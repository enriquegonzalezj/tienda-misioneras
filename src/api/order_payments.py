"""
Pagar un pedido con Mercado Pago, Checkout Pro con la API de Orders (tarea 4.6).

  POST /api/orders/<token>/pay   crea la orden de Mercado Pago y devuelve la
                                 dirección de pago
  process_order_payment(charge)  lo que hace el webhook (mp_webhook.py) con
                                 una orden de un pedido, ya leída de Mercado Pago

La página /pedido/<token> llama aquí al pulsar "Pagar con Mercado Pago" y
lleva a la clienta a la página de pago de Mercado Pago (checkout_url de la
orden; la respuesta la sigue llamando init_point para que el frontend no
cambie). Quien confirma el pago es el webhook, nunca la vuelta del navegador:
la dirección de vuelta la puede escribir cualquiera.

Reglas (CLAUDE.md, Seguridad y Existencias; decisiones de Enrique, 18 y 20 nov):
- Solo un pedido pendiente con la reserva vigente. El importe sale del pedido
  guardado (renglones, envío y total), nunca del navegador.
- La orden caduca cuando vence la reserva (expiration_time con los minutos que
  quedan): pasado ese momento, Mercado Pago ya no deja pagarla.
- Solo pagos que se aprueban al momento: sin efectivo (OXXO, Paycash), sin
  pago en ventanilla y sin transferencia (SPEI). Así la reserva de 30 minutos
  basta. Si la congregación acepta OXXO, se cambia aquí. Orders no tiene el
  binary_mode de las preferencias (en Checkout Pro, capture_mode es siempre
  automatic_async): un pago con tarjeta que Mercado Pago revisa a mano y se
  aprueba tarde sigue las reglas del pago tardío de abajo.
- external_reference lleva el folio (MHP-000123), nunca el token: el folio lo
  ve la congregación en su cuenta de Mercado Pago y el token es la llave del
  pedido.
- payer.email lleva el correo del pedido (decisión 1 de Enrique, 20 nov): la
  referencia de Orders lo pide para Checkout Pro y el aviso de privacidad ya
  dice que los datos del pago se comparten con Mercado Pago.
- Las URLs de vuelta (config.online, a /pedido/<token>) solo con
  PUBLIC_BASE_URL en https: Mercado Pago no acepta localhost ni 127.0.0.1. En
  local, al terminar de pagar se vuelve a la tienda a mano.
- Cada clic crea una orden nueva: se guarda la última en mp_order_id. Al
  pagar se guarda la orden pagada (puede ser otra, si se pulsó dos veces):
  es la que se reembolsa al cancelar desde el panel.

Confirmar un pago (decisiones 3 y 4 de Enrique, 18 nov):
- Orden pagada de un pedido pendiente: pasa a pagado (aunque la reserva haya
  vencido hace un momento y aún no se haya liberado: las unidades siguen
  apartadas). Se guardan la orden, el id del pago, su estado, la comisión y
  la fecha.
- Orden pagada de un pedido cancelado porque venció la reserva: si todavía
  hay unidades, se vuelven a apartar y el pedido queda pagado; si no, se
  reembolsa completa y el pedido sigue cancelado (con refunded_at).
- Orden pagada de un pedido sustituido, de otro cancelado o de un pedido que
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
import math
import re
from datetime import datetime, timedelta, timezone

from flask import Blueprint, current_app, jsonify
from sqlalchemy import select, update
from sqlalchemy.orm import selectinload

from api.checkout import TOKEN_MAX, _folio
from api.limiter import limiter
from api.models import Order, ProductVariant, db
from api.payments import PaymentServiceError, create_checkout, money_text, refund_order
from api.reservations import EXPIRED_REASON, release_expired_reservations
from api.utils import APIException

logger = logging.getLogger(__name__)

order_payments = Blueprint("order_payments", __name__)

NOT_FOUND = "Pedido no encontrado."
NOT_PAYABLE = "Este pedido ya no está pendiente de pago."

# Con menos tiempo que esto no se crea la orden: no daría tiempo a pagar y el
# pago podría llegar con el pedido ya cancelado.
MIN_REMAINING = timedelta(minutes=2)

# Tipos de pago que no se aprueban al momento (decisión 2 de Enrique, 18 nov).
EXCLUDED_PAYMENT_TYPES = ("ticket", "atm", "bank_transfer")


def _items(order):
    """Renglones de la orden: un artículo por renglón del pedido y el envío
    (con su descuento) como uno más. Si la suma no diera el total guardado,
    un solo artículo por el total: se cobra siempre order.total (Mercado Pago
    exige que total_amount sea la suma de los renglones)."""
    items = []
    for item in order.items:
        title = item.product_name
        if item.variant_label:
            title = f"{title} ({item.variant_label})"
        items.append((title, item.quantity, item.unit_price))
    shipping = order.shipping_cost - order.shipping_discount_amount
    if shipping > 0:
        items.append((f"Envío: {order.shipping_method_name}", 1, shipping))
    if sum(price * quantity for _, quantity, price in items) != order.total:
        logger.warning("La suma de renglones de %s no da el total: un solo artículo", _folio(order))
        items = [(f"Pedido {_folio(order)}", 1, order.total)]
    return [
        {"title": title[:250], "quantity": quantity, "unit_price": money_text(price)}
        for title, quantity, price in items
    ]


def build_order(order, now):
    """Datos de la orden de Mercado Pago de un pedido pendiente."""
    minutes = max(1, math.floor((order.reserved_until - now).total_seconds() / 60))
    data = {
        "type": "online",
        "processing_mode": "manual",
        "total_amount": money_text(order.total),
        "external_reference": _folio(order),
        "description": f"Pedido {_folio(order)} de Vocaciones MHPVM",
        "expiration_time": f"PT{minutes}M",
        "payer": {"email": order.email},
        "items": _items(order),
        "config": {
            "payment_method": {"not_allowed_types": list(EXCLUDED_PAYMENT_TYPES)},
        },
    }
    base_url = current_app.config["PUBLIC_BASE_URL"]
    if base_url.startswith("https://"):
        back = f"{base_url}/pedido/{order.access_token}"
        data["config"]["online"] = {
            "success_url": back,
            "failure_url": back,
            "pending_url": back,
            "auto_return": "approved",
        }
    return data


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

    data = build_order(order, now)
    folio = _folio(order)
    db.session.rollback()  # no dejar la transacción abierta mientras se espera a Mercado Pago

    mp_order_id, checkout_url = create_checkout(data, folio)  # 503 o 502 si falla

    # Se guarda la última orden del pedido (solo si sigue pendiente).
    db.session.execute(
        update(Order)
        .where(Order.access_token == token, Order.status == "pending")
        .values(mp_order_id=mp_order_id)
    )
    db.session.commit()
    return jsonify({"init_point": checkout_url})


# ---------------------------------------------------------------------------
# Confirmar un pago (lo llama el webhook)
# ---------------------------------------------------------------------------

FOLIO_REFERENCE = re.compile(r"^MHP-(\d{6,})$")


def set_paid(order, paid_at, charge=None):
    """Pasa el pedido a pagado. Con la fila del pedido ya bloqueada.

    charge: el pago de Mercado Pago (payments.Charge); sin él (flask
    mark-paid, solo en local) el pedido queda sin datos de pago.
    """
    order.status = "paid"
    order.paid_at = paid_at
    order.reserved_until = None
    order.cancel_reason = None
    if charge is not None:
        order.mp_order_id = charge.order_id
        order.mp_payment_id = charge.payment_id
        order.mp_status = "approved"
        order.mp_fee = charge.fee


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


def process_order_payment(charge):
    """Aplica al pedido una orden leída de Mercado Pago (nunca del aviso).

    charge: payments.Charge; si está aprobada, ya con la comisión y la fecha
    (payments.get_payment_details).

    Devuelve una palabra con lo que se hizo, para el registro: paid,
    paid_late, refunded, refunded_duplicate, already_done, updated,
    amount_mismatch, unknown_order, ignored. Si un reembolso falla lanza
    PaymentServiceError (el webhook responde 500 y Mercado Pago reintenta).
    """
    match = FOLIO_REFERENCE.match(charge.reference)
    if not match or not charge.payment_id:
        return "ignored"
    payment_id = charge.payment_id

    order = db.session.scalar(
        select(Order)
        .where(Order.id == int(match.group(1)))
        .options(selectinload(Order.items))
        .with_for_update(of=Order)
        .execution_options(populate_existing=True)
    )
    if order is None:
        db.session.rollback()
        logger.warning("Orden %s con un folio que no existe: %s", charge.order_id, match.group(0))
        return "unknown_order"
    folio = _folio(order)

    if charge.status != "approved":
        # Un pago ya guardado que cambió después (reembolsado desde la cuenta
        # de Mercado Pago, contracargo): se anota su estado. Lo demás
        # (rechazado, en proceso) no cambia el pedido.
        if order.mp_payment_id == payment_id:
            order.mp_status = charge.status[:30]
            if charge.status == "refunded" and order.refunded_at is None:
                order.refunded_at = datetime.now(timezone.utc)
            db.session.commit()
            return "updated"
        db.session.rollback()
        return "ignored"

    if order.mp_payment_id == payment_id:
        db.session.rollback()
        return "already_done"

    if charge.amount != order.total or charge.currency != "MXN":
        db.session.rollback()
        logger.error(
            "Orden %s de %s no coincide con el pedido (%s %s, esperado %s MXN): revisar a mano",
            charge.order_id, folio, charge.amount, charge.currency, order.total,
        )
        return "amount_mismatch"

    paid_at = charge.paid_at or datetime.now(timezone.utc)
    if order.status == "pending":
        set_paid(order, paid_at, charge)
        db.session.commit()
        return "paid"
    if (
        order.status == "cancelled"
        and order.cancel_reason == EXPIRED_REASON
        and order.mp_payment_id is None
        and _reserve_again(order)
    ):
        set_paid(order, paid_at, charge)
        db.session.commit()
        logger.info("Pago tardío de %s: había unidades y el pedido quedó pagado", folio)
        return "paid_late"

    # Sustituido, cancelado sin unidades o con otro pago ya guardado: reembolso.
    if not refund_order(charge.order_id):
        db.session.rollback()
        raise PaymentServiceError(f"no se pudo reembolsar la orden {charge.order_id} de {folio}")
    if order.status == "cancelled" and order.mp_payment_id is None:
        order.mp_order_id = charge.order_id
        order.mp_payment_id = payment_id
        order.mp_status = "refunded"
        order.refunded_at = datetime.now(timezone.utc)
        db.session.commit()
        logger.warning("Pago tardío de %s reembolsado (pedido cancelado)", folio)
        return "refunded"
    db.session.rollback()
    logger.warning("Segunda orden pagada %s de %s reembolsada (el pedido ya tenía otro pago)", charge.order_id, folio)
    return "refunded_duplicate"
