"""
Webhook de Mercado Pago (tareas 4.6 y 4.9), API de Orders.

  POST /api/webhooks/mercadopago

Se configura en el panel de la aplicación, Configuración de webhooks, en las
pestañas Prueba y Producción, con la dirección
https://www.vocacionesmhpvm.com/api/webhooks/mercadopago y solo el evento
"Order (Mercado Pago)" (configurado el 20 nov; "Pagos (legacy)" desmarcado:
con los dos, cada cobro llegaría dos veces). Cada pestaña tiene su firma
secreta, que va en MP_WEBHOOK_SECRET según el modo de las credenciales. La
orden no lleva notification_url: los avisos son los del panel.

Reglas (CLAUDE.md, Seguridad: verificar la firma, consultar la orden a la API
y ser idempotente):
1. La firma x-signature se comprueba con el validador del SDK
   (HMAC-SHA256 de "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" con la
   firma secreta). En Orders, Mercado Pago firma con el data.id en
   minúsculas y el validador del SDK lo usa tal cual: se pasa a minúsculas
   aquí (si no, todos los avisos darían 401). Sin firma configurada: 503;
   firma mala: 401. No se usa la tolerancia de tiempo del SDK (mezcla
   segundos y milisegundos): un aviso repetido no hace daño porque la orden
   se consulta y el proceso es idempotente.
2. Solo avisos type=order. Los type=payment (Pagos legacy, por si un día se
   vuelve a marcar en el panel) se ignoran con 200, para no procesar dos veces
   el mismo cobro.
3. Del aviso solo se usa el id de la orden. Estado, importe, moneda y folio
   se leen de Mercado Pago (payments.get_order). Si la orden está pagada, se
   pide además la comisión y la fecha al pago por debajo
   (payments.get_payment_details), antes de bloquear nada.
4. Mercado Pago espera 200 o 201 en 22 segundos; si no, reintenta (cada 15
   minutos al principio). Por eso: 200 en todo lo que ya está resuelto o no
   nos toca; 500 solo si no se pudo consultar o reembolsar, para que vuelva a
   avisar.
5. En el registro: el id de la orden, el folio y lo que se hizo. Nunca la
   firma ni datos de la compradora.
6. El folio de la orden (external_reference) dice a quién va: DON-000001 a un
   donativo (donations.py, tarea 4.9); lo demás, a un pedido
   (order_payments.py, que ignora lo que no es MHP-000001).
"""
import logging

from flask import Blueprint, jsonify, request
from mercadopago.webhook import InvalidWebhookSignatureError, WebhookSignatureValidator

from api.donations import process_donation_payment
from api.limiter import limiter
from api.order_payments import process_order_payment
from api.payments import (
    ORDER_ID,
    PaymentServiceError,
    get_order,
    get_payment_details,
    read_charge,
    webhook_secret,
)

logger = logging.getLogger(__name__)

mp_webhook = Blueprint("mp_webhook", __name__)


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
            request.headers.get("x-signature"),
            request_id,
            data_id.lower() if isinstance(data_id, str) else data_id,
            secret,
        )
    except InvalidWebhookSignatureError as error:
        logger.warning("Aviso de Mercado Pago con firma no válida (%s, request-id %s)", error.reason.value, request_id)
        return jsonify({"message": "Firma no válida."}), 401

    body = request.get_json(silent=True)
    kind = request.args.get("type") or (body.get("type") if isinstance(body, dict) else None)
    if kind != "order":
        return _ok("ignored")
    order_id = data_id.upper() if isinstance(data_id, str) else ""
    if not ORDER_ID.match(order_id):
        logger.warning("Aviso de orden sin un id válido (request-id %s)", request_id)
        return _ok("ignored")

    try:
        mp_order = get_order(order_id)
        if mp_order is None:
            logger.warning("Mercado Pago no encuentra la orden %s del aviso", order_id)
            return _ok("not_found")
        charge = read_charge(mp_order)
        if charge.order_id.upper() != order_id:
            logger.warning("La orden %s devolvió otro id: se ignora", order_id)
            return _ok("ignored")
        if charge.status == "approved":
            get_payment_details(charge)
            if charge.currency is None:
                # Sin moneda no se puede comprobar el cobro: mejor que Mercado
                # Pago vuelva a avisar que dejar el pedido sin confirmar.
                raise PaymentServiceError(f"la orden {order_id} no trae la moneda")
        if charge.reference.startswith("DON-"):
            result = process_donation_payment(charge)
        else:
            result = process_order_payment(charge)
    except PaymentServiceError as error:
        logger.warning("Aviso de la orden %s sin terminar, Mercado Pago reintentará: %s", order_id, error)
        return jsonify({"message": "Inténtalo más tarde."}), 500

    logger.info("Aviso de la orden %s (%s, %s): %s", order_id, charge.reference, charge.status, result)
    return _ok(result)
