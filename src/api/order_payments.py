"""
Pagar un pedido con Mercado Pago, Checkout Pro vía preferencias (tarea 4.6).

  POST /api/orders/<token>/pay   crea la preferencia y devuelve init_point

La página /pedido/<token> llama aquí al pulsar "Pagar con Mercado Pago" y
lleva a la clienta a init_point, la página de pago de Mercado Pago. Quien
confirma el pago es el webhook (commit siguiente), nunca la vuelta del
navegador: la dirección de vuelta la puede escribir cualquiera.

Reglas (CLAUDE.md, Seguridad y Existencias; decisiones de Enrique, 18 nov):
- Solo un pedido pendiente con la reserva vigente. El importe sale del pedido
  guardado (renglones, envío y total), nunca del navegador.
- La preferencia caduca cuando vence la reserva (expiration_date_to =
  reserved_until): pasado ese momento, Mercado Pago ya no deja empezar el pago.
- Solo pagos que se aprueban al momento: sin efectivo (OXXO, Paycash), sin
  pago en ventanilla y sin transferencia (SPEI), y con binary_mode (el pago
  queda aprobado o rechazado, nunca "en revisión"). Así la reserva de 30
  minutos basta. Si la congregación acepta OXXO, se cambia aquí.
- external_reference lleva el folio (MHP-000123), nunca el token: el folio lo
  ve la congregación en su cuenta de Mercado Pago y el token es la llave del
  pedido.
- back_urls (volver a /pedido/<token> al terminar) solo con PUBLIC_BASE_URL en
  https: Mercado Pago no acepta localhost ni 127.0.0.1. En local, al terminar
  de pagar se vuelve a la tienda a mano.
- No se mandan datos de la compradora (nombre, correo): se piden en Mercado
  Pago. Guardar solo lo necesario (LFPDPPP).
- En el registro solo se anota el código y el error de Mercado Pago, nunca la
  respuesta completa (lleva back_urls, y con ellas el token).
"""
import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from urllib.parse import urlparse

from flask import Blueprint, current_app, jsonify
from sqlalchemy import select, update
from sqlalchemy.orm import selectinload

from api.checkout import TOKEN_MAX, _folio
from api.limiter import limiter
from api.models import Order, db
from api.payments import get_sdk
from api.reservations import release_expired_reservations
from api.utils import APIException

logger = logging.getLogger(__name__)

order_payments = Blueprint("order_payments", __name__)

NOT_FOUND = "Pedido no encontrado."
NOT_PAYABLE = "Este pedido ya no está pendiente de pago."
MP_FAILED = "No pudimos abrir Mercado Pago. Intenta de nuevo en unos minutos."

# Con menos tiempo que esto no se crea la preferencia: no daría tiempo a pagar
# y el pago podría llegar con el pedido ya cancelado.
MIN_REMAINING = timedelta(minutes=2)

# Tipos de pago que no se aprueban al momento (decisión 2 de Enrique, 18 nov).
EXCLUDED_PAYMENT_TYPES = ("ticket", "atm", "bank_transfer")

# init_point solo puede llevar a Mercado Pago.
ALLOWED_HOSTS = ("mercadopago.com.mx", "mercadopago.com")


def _iso(moment):
    # Formato de fecha que usa Mercado Pago: 2026-11-19T18:30:00.000+00:00
    return moment.astimezone(timezone.utc).isoformat(timespec="milliseconds")


def _items(order):
    """Renglones de la preferencia: un artículo por renglón del pedido y el
    envío (con su descuento) como uno más. Si la suma no diera el total
    guardado, un solo artículo por el total: se cobra siempre order.total."""
    items = []
    for item in order.items:
        title = item.product_name
        if item.variant_label:
            title = f"{title} ({item.variant_label})"
        items.append({
            "title": title[:250],
            "quantity": item.quantity,
            "unit_price": float(item.unit_price),
            "currency_id": "MXN",
        })
    shipping = order.shipping_cost - order.shipping_discount_amount
    if shipping > 0:
        items.append({
            "title": f"Envío: {order.shipping_method_name}"[:250],
            "quantity": 1,
            "unit_price": float(shipping),
            "currency_id": "MXN",
        })
    total = sum((Decimal(str(i["unit_price"])) * i["quantity"] for i in items), Decimal("0"))
    if total != order.total:
        logger.warning("La suma de renglones de %s no da el total: un solo artículo", _folio(order))
        items = [{
            "title": f"Pedido {_folio(order)}",
            "quantity": 1,
            "unit_price": float(order.total),
            "currency_id": "MXN",
        }]
    return items


def build_preference(order, now):
    """Datos de la preferencia de un pedido pendiente."""
    preference = {
        "items": _items(order),
        "external_reference": _folio(order),
        "expires": True,
        "expiration_date_from": _iso(now),
        "expiration_date_to": _iso(order.reserved_until),
        "binary_mode": True,
        "payment_methods": {
            "excluded_payment_types": [{"id": kind} for kind in EXCLUDED_PAYMENT_TYPES],
        },
    }
    base_url = current_app.config["PUBLIC_BASE_URL"]
    if base_url.startswith("https://"):
        back = f"{base_url}/pedido/{order.access_token}"
        preference["back_urls"] = {"success": back, "pending": back, "failure": back}
        preference["auto_return"] = "approved"
    return preference


def _safe_init_point(url):
    """init_point solo si es https y de Mercado Pago; si no, None."""
    if not isinstance(url, str):
        return None
    parts = urlparse(url)
    host = (parts.hostname or "").lower()
    if parts.scheme != "https":
        return None
    if any(host == allowed or host.endswith("." + allowed) for allowed in ALLOWED_HOSTS):
        return url
    return None


@order_payments.route("/orders/<token>/pay", methods=["POST"])
@limiter.limit("10 per minute")
def pay_order(token):
    if len(token) > TOKEN_MAX:
        raise APIException(NOT_FOUND, status_code=404)
    release_expired_reservations()  # un pedido vencido sale ya cancelado
    order = db.session.scalar(
        select(Order).where(Order.access_token == token).options(selectinload(Order.items))
    )
    if order is None:
        raise APIException(NOT_FOUND, status_code=404)
    if order.status != "pending" or order.reserved_until is None:
        raise APIException(NOT_PAYABLE, status_code=409, payload={"code": "not_payable"})
    now = datetime.now(timezone.utc)
    if order.reserved_until - now < MIN_REMAINING:
        raise APIException(
            "Queda muy poco tiempo para pagar este pedido. Espera a que se cancele y haz uno nuevo desde tu carrito.",
            status_code=409,
            payload={"code": "reservation_ending"},
        )

    sdk = get_sdk()  # 503 si falta MP_ACCESS_TOKEN
    data = build_preference(order, now)
    folio = _folio(order)
    db.session.rollback()  # no dejar la transacción abierta mientras se espera a Mercado Pago

    try:
        result = sdk.preference().create(data)
    except Exception as error:  # sin conexión, tiempo agotado o respuesta rara
        logger.warning("Mercado Pago no respondió al crear la preferencia de %s: %r", folio, error)
        raise APIException(MP_FAILED, status_code=502) from None

    status = result.get("status") if isinstance(result, dict) else None
    response = result.get("response") if isinstance(result, dict) else None
    response = response if isinstance(response, dict) else {}
    init_point = _safe_init_point(response.get("init_point"))
    preference_id = response.get("id")
    if status != 201 or not init_point or not isinstance(preference_id, str):
        logger.warning(
            "Mercado Pago rechazó la preferencia de %s: %s %s %s",
            folio, status, response.get("error"), response.get("message"),
        )
        raise APIException(MP_FAILED, status_code=502)

    # Se guarda la última preferencia del pedido (solo si sigue pendiente).
    db.session.execute(
        update(Order)
        .where(Order.access_token == token, Order.status == "pending")
        .values(mp_preference_id=preference_id[:100])
    )
    db.session.commit()
    return jsonify({"init_point": init_point})
