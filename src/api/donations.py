"""
Donativos (tarea 4.9).

  GET  /api/donations/options          monto mínimo y si se puede pagar
  POST /api/donations                  crea el donativo (pendiente)
  POST /api/donations/<token>/pay      crea la orden de Mercado Pago
  GET  /api/donations/<token>          página del donativo (/donativo/<token>)
  process_donation_payment(charge)     lo que hace el webhook con una orden de
                                       un donativo, ya leída de Mercado Pago

Reglas (CLAUDE.md, Reglas de negocio; decisiones de Enrique del 19 nov):
- Monto libre, sin montos sugeridos, con un mínimo de 20.00 MXN validado aquí
  (la comisión de Mercado Pago se descuenta de cada cobro: un donativo muy
  pequeño casi no llegaría) y un tope de 100,000.00 contra errores de dedo.
- Se piden nombre completo y correo; ni país ni dirección. Sin envío ni
  campañas. Abierto a cualquier país (la moneda es MXN).
- Todos los medios de pago de Mercado Pago, también OXXO y SPEI: un donativo
  no aparta nada, así que puede quedar pendiente hasta que se acredite. Sin
  tipos excluidos (a diferencia de los pedidos).
- La misma pasarela que los pedidos: Checkout Pro con la API de Orders
  (payments.py) y el mismo webhook. El folio es DON-000001
  (external_reference); el de los pedidos es MHP-000001.
- payer.email lleva el correo del donativo (decisión 1 de Enrique, 20 nov).
- La página del donativo se abre con su access_token, nunca con el id.
- Quien confirma el pago es el webhook, nunca la vuelta del navegador.
- Con sesión de cliente y el correo de su cuenta, el donativo se enlaza a la
  cuenta (user_id). Nunca por coincidir el correo sin sesión.

Confirmar un pago (process_donation_payment):
- Aprobado, con el donativo pendiente: pasa a pagado (orden, id del pago,
  estado, comisión y fecha).
- Aprobado, con el donativo ya pagado con otro pago (pagó dos veces): se
  reembolsa la segunda orden, como en los pedidos.
- Pendiente o en proceso (ficha de OXXO, SPEI), con el donativo sin pago: se
  anota mp_status para que la página diga "en proceso".
- Un pago guardado que luego sale reembolsado o con contracargo: se anota.
- Importe o moneda distintos: no se toca nada y se anota en el registro.
- Idempotente por mp_payment_id. El donativo se bloquea (FOR UPDATE).
"""
import logging
import re
import secrets
from datetime import datetime, timezone
from decimal import Decimal

from flask import Blueprint, current_app, jsonify, request
from sqlalchemy import select, update

from api import notifications
from api.auth import optional_customer
from api.checkout import EMAIL_PATTERN, INVALID_DATA, TOKEN_MAX, _money, _text
from api.limiter import email_key, limiter
from api.models import Donation, db
from api.payments import (
    PaymentServiceError,
    create_checkout,
    is_configured as payments_configured,
    money_text,
    refund_order,
)
from api.utils import APIException

logger = logging.getLogger(__name__)

donations = Blueprint("donations", __name__)

MIN_AMOUNT = Decimal("20.00")
MAX_AMOUNT = Decimal("100000.00")
# Hasta 6 cifras y 2 decimales, con punto: "250", "250.5", "1500.00".
AMOUNT_PATTERN = re.compile(r"^[0-9]{1,6}(?:\.[0-9]{1,2})?$")
# Pasado este tiempo, la orden ya no deja empezar a pagar (se puede crear
# otra desde la página del donativo). Formato ISO 8601: un día.
ORDER_EXPIRATION = "P1D"
# Estados guardados en mp_status de un pago que todavía puede acreditarse
# ("in_process" con Orders; los otros dos, de pagos con preferencias).
IN_PROCESS = ("pending", "in_process", "authorized")

NOT_FOUND = "Donativo no encontrado."
FOLIO_REFERENCE = re.compile(r"^DON-(\d{6,})$")


def donation_created(response):
    """Solo cuentan los donativos creados: un formulario con errores no gasta intentos."""
    return response.status_code == 201


def _folio(donation):
    return f"DON-{donation.id:06d}"


def _amount(data, errors):
    raw = data.get("amount")
    if isinstance(raw, str):
        raw = raw.strip().replace(",", "")  # "1,500.00" también vale
    if raw in (None, ""):
        errors["amount"] = "Escribe cuánto quieres donar."
        return None
    if not isinstance(raw, str) or not AMOUNT_PATTERN.match(raw):
        errors["amount"] = "Escribe el monto con números, por ejemplo 250 o 250.50."
        return None
    value = Decimal(raw).quantize(Decimal("0.01"))
    if value < MIN_AMOUNT:
        errors["amount"] = f"El donativo mínimo es de ${MIN_AMOUNT:,.2f}."
        return None
    if value > MAX_AMOUNT:
        errors["amount"] = f"El donativo máximo en línea es de ${MAX_AMOUNT:,.2f}."
        return None
    return value


def _validate(data):
    errors = {}
    amount = _amount(data, errors)
    name = _text(data, "donor_name", 150, "Escribe tu nombre completo.", errors)
    email = data.get("email")
    email = email.strip().lower() if isinstance(email, str) else ""
    if not email:
        errors["email"] = "Escribe tu correo."
    elif len(email) > 254 or not EMAIL_PATTERN.match(email):
        errors["email"] = "Revisa el correo: debe ser como nombre@ejemplo.com."
    if data.get("privacy_accepted") is not True:
        errors["privacy_accepted"] = "Para continuar, acepta el aviso de privacidad."
    if errors:
        raise APIException(INVALID_DATA, status_code=400, payload={"errors": errors})
    return amount, name, email


def _find(token, lock=False):
    if len(token) > TOKEN_MAX:
        raise APIException(NOT_FOUND, status_code=404)
    query = select(Donation).where(Donation.access_token == token)
    if lock:
        query = query.with_for_update()
    donation = db.session.scalar(query)
    if donation is None:
        raise APIException(NOT_FOUND, status_code=404)
    return donation


def donation_flags(donation):
    """Lo que dice la página y el panel además del estado."""
    return {
        # Pago empezado que aún no se acredita (ficha de OXXO, transferencia).
        "in_process": donation.status == "pending" and donation.mp_status in IN_PROCESS,
        # Pago devuelto (pago repetido o reembolso desde Mercado Pago).
        "refunded": donation.mp_status in ("refunded", "charged_back"),
    }


# ---------------------------------------------------------------------------
# Rutas públicas
# ---------------------------------------------------------------------------

@donations.route("/donations/options", methods=["GET"])
def donation_options():
    return jsonify({
        "min_amount": _money(MIN_AMOUNT),
        "max_amount": _money(MAX_AMOUNT),
        "payment_available": payments_configured(),
    })


@donations.route("/donations", methods=["POST"])
@limiter.limit("10 per hour", deduct_when=donation_created)
@limiter.limit("5 per hour", key_func=email_key, deduct_when=donation_created)
def create_donation():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise APIException("Faltan los datos de la petición.", status_code=400)
    amount, name, email = _validate(data)
    customer = optional_customer()
    donation = Donation(
        access_token=secrets.token_urlsafe(32),
        status="pending",
        amount=amount,
        donor_name=name,
        email=email,
        # Solo con la sesión de la persona y el correo de su cuenta.
        user_id=customer.id if customer is not None and customer.email == email else None,
        privacy_accepted_at=datetime.now(timezone.utc),
    )
    db.session.add(donation)
    db.session.commit()
    return jsonify({"access_token": donation.access_token, "folio": _folio(donation)}), 201


def build_order(donation):
    """Datos de la orden de Mercado Pago de un donativo pendiente."""
    amount = money_text(donation.amount)
    data = {
        "type": "online",
        "processing_mode": "manual",
        "total_amount": amount,
        "external_reference": _folio(donation),
        "description": "Donativo a Vocaciones MHPVM",
        "expiration_time": ORDER_EXPIRATION,
        "payer": {"email": donation.email},
        "items": [{"title": "Donativo a Vocaciones MHPVM", "quantity": 1, "unit_price": amount}],
    }
    base_url = current_app.config["PUBLIC_BASE_URL"]
    if base_url.startswith("https://"):
        back = f"{base_url}/donativo/{donation.access_token}"
        data["config"] = {"online": {
            "success_url": back,
            "failure_url": back,
            "pending_url": back,
            "auto_return": "approved",
        }}
    return data


@donations.route("/donations/<token>/pay", methods=["POST"])
@limiter.limit("10 per minute")
def pay_donation(token):
    donation = _find(token)
    if donation.status != "pending":
        raise APIException("Este donativo ya no está pendiente de pago.", status_code=409, payload={"code": "not_payable"})
    data = build_order(donation)
    folio = _folio(donation)
    db.session.rollback()  # no dejar la transacción abierta mientras se espera a Mercado Pago

    mp_order_id, checkout_url = create_checkout(data, folio)  # 503 o 502 si falla

    db.session.execute(
        update(Donation)
        .where(Donation.access_token == token, Donation.status == "pending")
        .values(mp_order_id=mp_order_id)
    )
    db.session.commit()
    # Se sigue llamando init_point para que la página no cambie.
    return jsonify({"init_point": checkout_url})


@donations.route("/donations/<token>", methods=["GET"])
@limiter.limit("60 per minute")
def get_donation(token):
    donation = _find(token)
    return jsonify({
        "folio": _folio(donation),
        "status": donation.status,
        **donation_flags(donation),
        "amount": _money(donation.amount),
        "donor_name": donation.donor_name,
        "created_at": donation.created_at.isoformat(),
        "paid_at": donation.paid_at.isoformat() if donation.paid_at else None,
        "payment_available": payments_configured(),
    })


# ---------------------------------------------------------------------------
# Confirmar un pago (lo llama el webhook, mp_webhook.py)
# ---------------------------------------------------------------------------

def process_donation_payment(charge):
    """Aplica al donativo una orden leída de Mercado Pago (payments.Charge;
    si está aprobada, ya con la comisión y la fecha). Devuelve una palabra
    para el registro: paid, already_done, noted, updated, refunded_duplicate,
    amount_mismatch, unknown_donation, ignored. Si un reembolso falla lanza
    PaymentServiceError (el webhook responde 500 y Mercado Pago reintenta)."""
    match = FOLIO_REFERENCE.match(charge.reference)
    payment_id = charge.payment_id
    if not match or not payment_id:
        return "ignored"
    status = charge.status

    donation = db.session.scalar(
        select(Donation)
        .where(Donation.id == int(match.group(1)))
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if donation is None:
        db.session.rollback()
        logger.warning("Orden %s con un folio que no existe: %s", charge.order_id, match.group(0))
        return "unknown_donation"
    folio = _folio(donation)

    if status != "approved":
        if donation.mp_payment_id == payment_id:
            donation.mp_status = status[:30]  # reembolsado o contracargo
            db.session.commit()
            return "updated"
        if donation.status == "pending" and donation.mp_payment_id is None:
            # Ficha de OXXO o transferencia en camino (o un intento rechazado):
            # solo se anota, para que la página lo diga.
            donation.mp_status = status[:30]
            db.session.commit()
            return "noted"
        db.session.rollback()
        return "ignored"

    if donation.mp_payment_id == payment_id:
        db.session.rollback()
        return "already_done"

    if charge.amount != donation.amount or charge.currency != "MXN":
        db.session.rollback()
        logger.error(
            "Orden %s de %s no coincide con el donativo (%s %s, esperado %s MXN): revisar a mano",
            charge.order_id, folio, charge.amount, charge.currency, donation.amount,
        )
        return "amount_mismatch"

    if donation.status == "pending" and donation.mp_payment_id is None:
        donation.status = "paid"
        donation.paid_at = charge.paid_at or datetime.now(timezone.utc)
        donation.mp_order_id = charge.order_id
        donation.mp_payment_id = payment_id
        donation.mp_status = "approved"
        donation.mp_fee = charge.fee
        db.session.commit()
        # Después del commit: el correo nunca anuncia un pago sin guardar.
        notifications.donation_paid(donation)
        return "paid"

    # Ya pagado con otro pago (o cancelado): se devuelve esta orden.
    if not refund_order(charge.order_id):
        db.session.rollback()
        raise PaymentServiceError(f"no se pudo reembolsar la orden {charge.order_id} de {folio}")
    db.session.rollback()
    # El dinero ya se devolvió: se avisa aunque el donativo no cambie.
    notifications.donation_refunded_duplicate(donation, charge)
    logger.warning("Segunda orden pagada %s de %s reembolsada (el donativo ya tenía otro pago)", charge.order_id, folio)
    return "refunded_duplicate"
