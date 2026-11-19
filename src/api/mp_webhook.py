"""
Webhook de Mercado Pago (tarea 4.6).

  POST /api/webhooks/mercadopago

Se configura en Tus integraciones > la aplicación > Webhooks > Configurar
notificaciones, con la dirección https://www.vocacionesmhpvm.com/api/webhooks/mercadopago
y el evento Pagos. Al guardar, Mercado Pago genera la clave secreta, que va en
MP_WEBHOOK_SECRET. La preferencia no lleva notification_url: la firma que
documenta Mercado Pago es la de los avisos configurados en el panel.

Reglas (CLAUDE.md, Seguridad: verificar la firma, consultar el pago a la API
y ser idempotente):
1. La firma x-signature se comprueba con el validador del SDK
   (HMAC-SHA256 de "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" con la
   clave secreta). Sin clave configurada: 503; firma mala: 401. No se usa la
   tolerancia de tiempo del SDK (mezcla segundos y milisegundos): un aviso
   repetido no hace daño porque el pago se consulta y el proceso es
   idempotente.
2. Del aviso solo se usa el id del pago. Estado, importe, moneda y folio se
   leen de Mercado Pago (payments.get_payment).
3. Mercado Pago espera 200 o 201 en 22 segundos; si no, reintenta (cada 15
   minutos al principio). Por eso: 200 en todo lo que ya está resuelto o no
   nos toca (otros tipos de aviso, pagos de otra cosa); 500 solo si no se pudo
   consultar o reembolsar, para que vuelva a avisar.
4. En el registro: el id del pago, el folio y lo que se hizo. Nunca la clave,
   la firma ni datos de la compradora.
"""
import logging
import re

from flask import Blueprint, jsonify, request
from mercadopago.webhook import InvalidWebhookSignatureError, WebhookSignatureValidator

from api.limiter import limiter
from api.order_payments import process_order_payment
from api.payments import PaymentServiceError, get_payment, webhook_secret

logger = logging.getLogger(__name__)

mp_webhook = Blueprint("mp_webhook", __name__)

PAYMENT_ID = re.compile(r"^\d{1,20}$")


def _ok(result):
    return jsonify({"result": result}), 200


@mp_webhook.route("/webhooks/mercadopago", methods=["POST"])
@limiter.limit("300 per minute")
def mercadopago_webhook():
    secret = webhook_secret()
    if secret is None:
        logger.error("Llegó un aviso de Mercado Pago y falta MP_WEBHOOK_SECRET: se rechaza")
        return jsonify({"message": "Webhook sin configurar."}), 503

    data_id = request.args.get("data.id")
    request_id = request.headers.get("x-request-id")
    try:
        WebhookSignatureValidator.validate(
            request.headers.get("x-signature"), request_id, data_id, secret
        )
    except InvalidWebhookSignatureError as error:
        logger.warning("Aviso de Mercado Pago con firma no válida (%s, request-id %s)", error.reason.value, request_id)
        return jsonify({"message": "Firma no válida."}), 401

    body = request.get_json(silent=True)
    kind = request.args.get("type") or (body.get("type") if isinstance(body, dict) else None)
    if kind != "payment":
        return _ok("ignored")
    if not data_id or not PAYMENT_ID.match(data_id):
        logger.warning("Aviso de pago sin un id válido (request-id %s)", request_id)
        return _ok("ignored")

    try:
        payment = get_payment(data_id)
        if payment is None:
            logger.warning("Mercado Pago no encuentra el pago %s del aviso", data_id)
            return _ok("not_found")
        result = process_order_payment(payment)
    except PaymentServiceError as error:
        logger.warning("Aviso del pago %s sin terminar, Mercado Pago reintentará: %s", data_id, error)
        return jsonify({"message": "Inténtalo más tarde."}), 500

    logger.info("Aviso del pago %s (%s): %s", data_id, payment.get("external_reference"), result)
    return _ok(result)
