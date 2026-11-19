"""
Pagar un pedido con Mercado Pago, Checkout Pro vía preferencias (tarea 4.6).

  POST /api/orders/<token>/pay   crea la preferencia y devuelve init_point
  process_order_payment(pago)    lo que hace el webhook (mp_webhook.py) con
                                 un pago de un pedido, ya leído de Mercado Pago

La página /pedido/<token> llama aquí al pulsar "Pagar con Mercado Pago" y
lleva a la clienta a init_point, la página de pago de Mercado Pago. Quien
confirma el pago es el webhook, nunca la vuelta del navegador: la dirección
de vuelta la puede escribir cualquiera.

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

Confirmar un pago (decisiones 3 y 4 de Enrique, 18 nov):
- Pago aprobado de un pedido pendiente: pasa a pagado (aunque la reserva haya
  vencido hace un momento y aún no se haya liberado: las unidades siguen
  apartadas). Se guardan el id del pago, su estado, la comisión y la fecha.
- Pago aprobado de un pedido cancelado porque venció la reserva: si todavía
  hay unidades, se vuelven a apartar y el pedido queda pagado; si no, se
  reembolsa completo y el pedido sigue cancelado (con refunded_at).
- Pago aprobado de un pedido sustituido, de otro cancelado o de un pedido que
  ya tiene otro pago: se reembolsa siempre (sería pagar dos veces).
- El importe y la moneda tienen que coincidir con el pedido guardado. Si no,
  no se toca nada y se anota en el registro para revisarlo a mano.
- Idempotente: un pago ya guardado en el pedido no se vuelve a procesar.
- Orden de bloqueo: primero el pedido y después sus variantes, de menor a
  mayor id (como reservations.py y checkout.py).
- set_paid() es lo único que pasa un pedido a pagado: la usan el webhook y
  flask mark-paid (solo en local).
"""
import logging
import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from urllib.parse import urlparse

from flask import Blueprint, current_app, jsonify
from sqlalchemy import select, update
from sqlalchemy.orm import selectinload

from api.checkout import TOKEN_MAX, _folio
from api.limiter import limiter
from api.models import Order, ProductVariant, db
from api.payments import PaymentServiceError, get_sdk, refund_payment
from api.reservations import EXPIRED_REASON, release_expired_reservations
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


# ---------------------------------------------------------------------------
# Confirmar un pago (lo llama el webhook)
# ---------------------------------------------------------------------------

FOLIO_REFERENCE = re.compile(r"^MHP-(\d{6,})$")


def set_paid(order, paid_at, payment_id=None, mp_status=None, fee=None):
    """Pasa el pedido a pagado. Con la fila del pedido ya bloqueada."""
    order.status = "paid"
    order.paid_at = paid_at
    order.reserved_until = None
    order.cancel_reason = None
    if payment_id is not None:
        order.mp_payment_id = payment_id
        order.mp_status = mp_status
        order.mp_fee = fee


def _decimal(value):
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        return None
    try:
        number = Decimal(str(value))
    except InvalidOperation:
        return None
    return number.quantize(Decimal("0.01")) if number.is_finite() else None


def _fee(payment):
    """Comisión que paga la congregación (fee_details con fee_payer collector)."""
    total = Decimal("0")
    for detail in payment.get("fee_details") or []:
        if isinstance(detail, dict) and detail.get("fee_payer") == "collector":
            total += _decimal(detail.get("amount")) or Decimal("0")
    return total


def _paid_at(payment):
    try:
        moment = datetime.fromisoformat(payment.get("date_approved"))
    except (TypeError, ValueError):
        return datetime.now(timezone.utc)
    return moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)


def _reserve_again(order):
    """Vuelve a apartar las unidades de un pedido cancelado por vencido.
    True si alcanzaron (y ya se restaron). Las variantes se bloquean de menor
    a mayor id, después del pedido."""
    quantities = {}
    for item in order.items:
        quantities[item.variant_id] = quantities.get(item.variant_id, 0) + item.quantity
    variants = list(db.session.scalars(
        select(ProductVariant)
        .where(ProductVariant.id.in_(sorted(quantities)))
        .order_by(ProductVariant.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    ))
    if len(variants) != len(quantities) or any(v.stock < quantities[v.id] for v in variants):
        return False
    for variant in variants:
        variant.stock -= quantities[variant.id]
    return True


def process_order_payment(payment):
    """Aplica al pedido un pago leído de Mercado Pago (nunca del aviso).

    Devuelve una palabra con lo que se hizo, para el registro: paid,
    paid_late, refunded, refunded_duplicate, already_done, updated,
    amount_mismatch, unknown_order, ignored. Si un reembolso falla lanza
    PaymentServiceError (el webhook responde 500 y Mercado Pago reintenta).
    """
    match = FOLIO_REFERENCE.match(str(payment.get("external_reference") or ""))
    if not match:
        return "ignored"
    payment_id = str(payment.get("id") or "")
    if not payment_id.isdigit():
        return "ignored"
    status = payment.get("status")

    order = db.session.scalar(
        select(Order)
        .where(Order.id == int(match.group(1)))
        .options(selectinload(Order.items))
        .with_for_update(of=Order)
        .execution_options(populate_existing=True)
    )
    if order is None:
        db.session.rollback()
        logger.warning("Pago %s con un folio que no existe: %s", payment_id, match.group(0))
        return "unknown_order"
    folio = _folio(order)

    if status != "approved":
        # Un pago ya guardado que cambió después (reembolsado desde el panel de
        # Mercado Pago, contracargo): se anota su estado. Lo demás (rechazado,
        # cancelado) no cambia el pedido.
        if order.mp_payment_id == payment_id and isinstance(status, str):
            order.mp_status = status[:30]
            if status == "refunded" and order.refunded_at is None:
                order.refunded_at = datetime.now(timezone.utc)
            db.session.commit()
            return "updated"
        db.session.rollback()
        return "ignored"

    if order.mp_payment_id == payment_id:
        db.session.rollback()
        return "already_done"

    amount = _decimal(payment.get("transaction_amount"))
    if amount != order.total or payment.get("currency_id") != "MXN":
        db.session.rollback()
        logger.error(
            "Pago %s de %s no coincide con el pedido (%s %s, esperado %s MXN): revisar a mano",
            payment_id, folio, amount, payment.get("currency_id"), order.total,
        )
        return "amount_mismatch"

    paid = dict(payment_id=payment_id, mp_status="approved", fee=_fee(payment))
    if order.status == "pending":
        set_paid(order, _paid_at(payment), **paid)
        db.session.commit()
        return "paid"
    if (
        order.status == "cancelled"
        and order.cancel_reason == EXPIRED_REASON
        and order.mp_payment_id is None
        and _reserve_again(order)
    ):
        set_paid(order, _paid_at(payment), **paid)
        db.session.commit()
        logger.info("Pago tardío de %s: había unidades y el pedido quedó pagado", folio)
        return "paid_late"

    # Sustituido, cancelado sin unidades o con otro pago ya guardado: reembolso.
    if not refund_payment(payment_id):
        db.session.rollback()
        raise PaymentServiceError(f"no se pudo reembolsar el pago {payment_id} de {folio}")
    if order.status == "cancelled" and order.mp_payment_id is None:
        order.mp_payment_id = payment_id
        order.mp_status = "refunded"
        order.refunded_at = datetime.now(timezone.utc)
        db.session.commit()
        logger.warning("Pago tardío de %s reembolsado (pedido cancelado)", folio)
        return "refunded"
    db.session.rollback()
    logger.warning("Segundo pago %s de %s reembolsado (el pedido ya tenía otro)", payment_id, folio)
    return "refunded_duplicate"
