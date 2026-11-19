"""
Donativos (tarea 4.9).

  GET  /api/donations/options          monto mínimo y si se puede pagar
  POST /api/donations                  crea el donativo (pendiente)
  POST /api/donations/<token>/pay      crea la preferencia de Mercado Pago
  GET  /api/donations/<token>          página del donativo (/donativo/<token>)
  process_donation_payment(pago)       lo que hace el webhook con un pago de
                                       un donativo, ya leído de Mercado Pago

Reglas (CLAUDE.md, Reglas de negocio; decisiones de Enrique del 19 nov):
- Monto libre, sin montos sugeridos, con un mínimo de 20.00 MXN validado aquí
  (la comisión de Mercado Pago se descuenta de cada cobro: un donativo muy
  pequeño casi no llegaría) y un tope de 100,000.00 contra errores de dedo.
- Se piden nombre completo y correo; ni país ni dirección. Sin envío ni
  campañas. Abierto a cualquier país (la moneda es MXN).
- Todos los medios de pago de Mercado Pago, también OXXO y SPEI: un donativo
  no aparta nada, así que puede quedar pendiente hasta que se acredite. Sin
  binary_mode ni tipos excluidos (a diferencia de los pedidos).
- La misma pasarela que los pedidos: payments.py y el mismo webhook. El folio
  es DON-000001 (external_reference); el de los pedidos es MHP-000001.
- La página del donativo se abre con su access_token, nunca con el id.
- Quien confirma el pago es el webhook, nunca la vuelta del navegador.
- Con sesión de cliente y el correo de su cuenta, el donativo se enlaza a la
  cuenta (user_id). Nunca por coincidir el correo sin sesión.

Confirmar un pago (process_donation_payment):
- Aprobado, con el donativo pendiente: pasa a pagado (id del pago, estado,
  comisión y fecha).
- Aprobado, con el donativo ya pagado con otro pago (pagó dos veces): se
  reembolsa el segundo, como en los pedidos.
- Pendiente o en proceso (ficha de OXXO, SPEI), con el donativo sin pago: se
  anota mp_status para que la página diga "en proceso".
- Un pago guardado que luego sale reembolsado o con contracargo: se anota.
- Importe o moneda distintos: no se toca nada y se anota en el registro.
- Idempotente por mp_payment_id. El donativo se bloquea (FOR UPDATE).
"""
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from flask import Blueprint, current_app, jsonify, request
from sqlalchemy import select, update

from api.auth import optional_customer
from api.checkout import EMAIL_PATTERN, INVALID_DATA, TOKEN_MAX, _money, _text
from api.limiter import email_key, limiter
from api.models import Donation, db
from api.order_payments import MP_FAILED, _decimal, _fee, _iso, _paid_at, _safe_init_point
from api.payments import PaymentServiceError, get_sdk, is_configured as payments_configured, refund_payment
from api.utils import APIException

logger = logging.getLogger(__name__)

donations = Blueprint("donations", __name__)

MIN_AMOUNT = Decimal("20.00")
MAX_AMOUNT = Decimal("100000.00")
# Hasta 6 cifras y 2 decimales, con punto: "250", "250.5", "1500.00".
AMOUNT_PATTERN = re.compile(r"^[0-9]{1,6}(?:\.[0-9]{1,2})?$")
# Pasado este tiempo, la preferencia ya no deja empezar a pagar (se puede
# crear otra desde la página del donativo).
PREFERENCE_HOURS = 24
# Estados de Mercado Pago de un pago que todavía puede acreditarse.
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


def build_preference(donation, now):
    preference = {
        "items": [{
            "title": "Donativo a Vocaciones MHPVM",
            "quantity": 1,
            "unit_price": float(donation.amount),
            "currency_id": "MXN",
        }],
        "external_reference": _folio(donation),
        "expires": True,
        "expiration_date_from": _iso(now),
        "expiration_date_to": _iso(now + timedelta(hours=PREFERENCE_HOURS)),
    }
    base_url = current_app.config["PUBLIC_BASE_URL"]
    if base_url.startswith("https://"):
        back = f"{base_url}/donativo/{donation.access_token}"
        preference["back_urls"] = {"success": back, "pending": back, "failure": back}
        preference["auto_return"] = "approved"
    return preference


@donations.route("/donations/<token>/pay", methods=["POST"])
@limiter.limit("10 per minute")
def pay_donation(token):
    donation = _find(token)
    if donation.status != "pending":
        raise APIException("Este donativo ya no está pendiente de pago.", status_code=409, payload={"code": "not_payable"})
    sdk = get_sdk()  # 503 si falta MP_ACCESS_TOKEN
    data = build_preference(donation, datetime.now(timezone.utc))
    folio = _folio(donation)
    db.session.rollback()  # no dejar la transacción abierta mientras se espera a Mercado Pago

    try:
        result = sdk.preference().create(data)
    except Exception as error:
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

    db.session.execute(
        update(Donation)
        .where(Donation.access_token == token, Donation.status == "pending")
        .values(mp_preference_id=preference_id[:100])
    )
    db.session.commit()
    return jsonify({"init_point": init_point})


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

def process_donation_payment(payment):
    """Aplica al donativo un pago leído de Mercado Pago. Devuelve una palabra
    para el registro: paid, already_done, noted, updated, refunded_duplicate,
    amount_mismatch, unknown_donation, ignored. Si un reembolso falla lanza
    PaymentServiceError (el webhook responde 500 y Mercado Pago reintenta)."""
    match = FOLIO_REFERENCE.match(str(payment.get("external_reference") or ""))
    payment_id = str(payment.get("id") or "")
    if not match or not payment_id.isdigit():
        return "ignored"
    status = payment.get("status")

    donation = db.session.scalar(
        select(Donation)
        .where(Donation.id == int(match.group(1)))
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if donation is None:
        db.session.rollback()
        logger.warning("Pago %s con un folio que no existe: %s", payment_id, match.group(0))
        return "unknown_donation"
    folio = _folio(donation)

    if status != "approved":
        if not isinstance(status, str):
            db.session.rollback()
            return "ignored"
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

    amount = _decimal(payment.get("transaction_amount"))
    if amount != donation.amount or payment.get("currency_id") != "MXN":
        db.session.rollback()
        logger.error(
            "Pago %s de %s no coincide con el donativo (%s %s, esperado %s MXN): revisar a mano",
            payment_id, folio, amount, payment.get("currency_id"), donation.amount,
        )
        return "amount_mismatch"

    if donation.status == "pending" and donation.mp_payment_id is None:
        donation.status = "paid"
        donation.paid_at = _paid_at(payment)
        donation.mp_payment_id = payment_id
        donation.mp_status = "approved"
        donation.mp_fee = _fee(payment)
        db.session.commit()
        return "paid"

    # Ya pagado con otro pago (o cancelado): se devuelve este.
    if not refund_payment(payment_id):
        db.session.rollback()
        raise PaymentServiceError(f"no se pudo reembolsar el pago {payment_id} de {folio}")
    db.session.rollback()
    logger.warning("Segundo pago %s de %s reembolsado (el donativo ya tenía otro)", payment_id, folio)
    return "refunded_duplicate"
