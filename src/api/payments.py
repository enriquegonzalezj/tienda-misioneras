"""Conexión con Mercado Pago, API de Orders (tareas 4.6 y 4.9).

Aquí se lee la configuración, se arma el cliente del SDK oficial
(`mercadopago`) y están todas las llamadas a Mercado Pago:

- create_checkout(): crea la orden de Checkout Pro de un pedido o un donativo
  y devuelve su id y la dirección de pago (checkout_url).
- get_order(): consulta una orden (lo que hace el webhook con cada aviso).
- read_charge(): resume una orden en lo que usan order_payments.py y
  donations.py (estado, id del pago, importe, moneda).
- get_payment_details(): comisión y fecha de aprobación, que la orden no trae
  y salen del pago por debajo de ella (GET /v1/payments/<reference_id>).
- refund_order(): reembolso completo de una orden.

Cómo funciona Orders (verificado en el paso 0, 20 nov): cada vez que se pulsa
"Pagar con Mercado Pago" se crea una orden nueva (ORD...). La orden admite un
solo intento de pago (config.online.retries.allowed es false): si la tarjeta
se rechaza, se pulsa otra vez y se crea otra orden. El pago dentro de la
orden tiene su propio id (PAY01...), que es el que se guarda en mp_payment_id.

Variables (en `.env` en local y a mano en Environment en Render; nunca en el
código ni en el chat):
- `MP_ACCESS_TOKEN`: access token de la cuenta que cobra. En local y en las
  pruebas en Render, el de prueba. Las credenciales son distintas en prueba y
  en producción.
- `MP_WEBHOOK_SECRET`: firma secreta de los webhooks (Configuración de
  webhooks), también distinta en cada modo. Sirve para comprobar que un aviso
  viene de Mercado Pago.

Sin `MP_ACCESS_TOKEN` la tienda arranca y funciona igual; solo pagar responde
503, como subir fotos sin Cloudinary.

Cabecera de idempotencia: el SDK pone en cada petición una
`x-idempotency-key` al azar, en minúsculas. Para poner la nuestra se manda en
custom_headers con el mismo nombre en minúsculas: con `X-Idempotency-Key`
saldrían dos cabeceras distintas (comprobado el 20 nov). El SDK la limita a
64 caracteres. Mercado Pago la exige al crear la orden y al reembolsarla.
"""
import logging
import os
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from urllib.parse import urlparse

import mercadopago
from mercadopago.config import RequestOptions

from api.utils import APIException

logger = logging.getLogger(__name__)

NOT_CONFIGURED = "Por ahora no se pueden recibir pagos. Intenta más tarde."
MP_FAILED = "No pudimos abrir Mercado Pago. Intenta de nuevo en unos minutos."

# Render tiene un solo worker de gunicorn: mientras una petición espera a
# Mercado Pago, la tienda entera espera. El SDK trae 60 s y 3 reintentos por
# defecto; con 10 s y 1 reintento, una caída de Mercado Pago tarda como mucho
# unos 20 s en dar error en lugar de dejar la tienda colgada minutos.
# (urllib3 no reintenta los POST por un error del servidor: crear una orden o
# un reembolso no se repite por esto.)
TIMEOUT_SECONDS = 10.0  # el SDK exige un decimal: con 10 lanza ValueError
MAX_RETRIES = 1

IDEMPOTENCY_HEADER = "x-idempotency-key"  # en minúsculas (ver arriba)

# checkout_url solo puede llevar a Mercado Pago.
ALLOWED_HOSTS = ("mercadopago.com.mx", "mercadopago.com")

# Id de una orden: ORD01... en producción, ORDTST01... en prueba.
ORDER_ID = re.compile(r"^ORD[A-Z0-9]{1,61}$")


def _env(name):
    return os.getenv(name, "").strip()


def is_configured():
    """True si hay access token: la tienda puede crear órdenes de pago."""
    return bool(_env("MP_ACCESS_TOKEN"))


def _options(custom_headers=None):
    return RequestOptions(
        connection_timeout=TIMEOUT_SECONDS,
        max_retries=MAX_RETRIES,
        custom_headers=custom_headers,
    )


def get_sdk():
    """Cliente del SDK listo para usar, o 503 si falta el access token.

    Se crea en cada llamada (es barato) para leer siempre el valor actual
    de la variable.
    """
    token = _env("MP_ACCESS_TOKEN")
    if not token:
        raise APIException(NOT_CONFIGURED, status_code=503)
    return mercadopago.SDK(token, request_options=_options())


def webhook_secret():
    """Firma secreta del webhook, o None si no está puesta.

    Sin firma, el webhook rechaza todos los avisos: nunca se marca un pedido
    como pagado sin comprobarla.
    """
    return _env("MP_WEBHOOK_SECRET") or None


class PaymentServiceError(Exception):
    """Mercado Pago no respondió o respondió algo inesperado. El webhook
    responde 500 y Mercado Pago vuelve a avisar más tarde."""


def _result(result):
    """(código HTTP, cuerpo como dict) de una respuesta del SDK."""
    status = result.get("status") if isinstance(result, dict) else None
    response = result.get("response") if isinstance(result, dict) else None
    return status, response if isinstance(response, dict) else {}


def money_text(amount):
    """Importe como lo pide Orders: texto con dos decimales ("150.00")."""
    return f"{amount:.2f}"


def to_decimal(value):
    """Importe de Mercado Pago como Decimal con dos decimales, o None.

    Orders manda los importes como texto y sin decimales cuando son enteros
    ("20"): siempre se comparan como Decimal, nunca como texto.
    """
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        return None
    try:
        number = Decimal(str(value))
    except InvalidOperation:
        return None
    return number.quantize(Decimal("0.01")) if number.is_finite() else None


# ---------------------------------------------------------------------------
# Crear la orden (pagar un pedido o un donativo)
# ---------------------------------------------------------------------------

def safe_checkout_url(url):
    """checkout_url solo si es https y de Mercado Pago; si no, None."""
    if not isinstance(url, str):
        return None
    parts = urlparse(url)
    host = (parts.hostname or "").lower()
    if parts.scheme != "https":
        return None
    if any(host == allowed or host.endswith("." + allowed) for allowed in ALLOWED_HOSTS):
        return url
    return None


def create_checkout(data, folio):
    """Crea la orden de Checkout Pro y devuelve (id de la orden, checkout_url).

    Cada intento lleva su propia clave de idempotencia (un UUID): cada clic en
    "Pagar" crea una orden nueva a propósito, y si urllib3 repitiera la misma
    petición, Mercado Pago no crearía dos.

    Si Mercado Pago falla o responde algo raro: 502. En el registro solo el
    folio, el código y el error de Mercado Pago, nunca la respuesta completa
    (lleva las URLs de vuelta, y con ellas el token del pedido).
    """
    sdk = get_sdk()  # 503 si falta MP_ACCESS_TOKEN
    options = _options({IDEMPOTENCY_HEADER: uuid.uuid4().hex})
    try:
        result = sdk.order().create(data, options)
    except Exception as error:  # sin conexión, tiempo agotado o respuesta rara
        logger.warning("Mercado Pago no respondió al crear la orden de %s: %r", folio, error)
        raise APIException(MP_FAILED, status_code=502) from None

    status, response = _result(result)
    checkout_url = safe_checkout_url(response.get("checkout_url"))
    order_id = response.get("id")
    if status != 201 or not checkout_url or not isinstance(order_id, str) or not ORDER_ID.match(order_id):
        logger.warning(
            "Mercado Pago rechazó la orden de %s: %s %s %s",
            folio, status, response.get("error") or response.get("code"), response.get("message"),
        )
        raise APIException(MP_FAILED, status_code=502)
    return order_id, checkout_url


# ---------------------------------------------------------------------------
# Leer una orden (webhook)
# ---------------------------------------------------------------------------

def get_order(order_id):
    """La orden tal como la tiene Mercado Pago (dict), o None si no existe.

    Nunca se cree lo que diga el aviso del webhook: el estado, el importe y
    el folio se leen siempre de aquí.
    """
    try:
        result = get_sdk().order().get(order_id)
    except APIException:
        raise
    except Exception as error:
        raise PaymentServiceError(f"sin respuesta al consultar la orden {order_id}: {error!r}") from None
    status, response = _result(result)
    if status == 404:
        return None
    if status != 200 or not response:
        raise PaymentServiceError(f"respuesta {status} al consultar la orden {order_id}")
    return response


@dataclass
class Charge:
    """Lo que importa de una orden de Mercado Pago, ya leída de su API.

    status (nuestro resumen, el que se guarda en mp_status):
    - approved: pagada (orden processed / accredited).
    - refunded: reembolsada completa (orden refunded, o processed / refunded).
    - partially_refunded: reembolso parcial hecho a mano en Mercado Pago.
    - charged_back: contracargo.
    - in_process: pago empezado que aún no se resuelve (ficha de OXXO,
      transferencia, revisión manual).
    - rejected: el pago falló (tarjeta rechazada).
    - created, cancelled, expired: sin pago.
    """
    order_id: str
    reference: str
    status: str
    payment_id: str | None
    reference_id: str | None  # id numérico del pago "antiguo" por debajo
    amount: Decimal | None
    currency: str | None
    # Los pone get_payment_details() (solo para un pago aprobado).
    fee: Decimal | None = None
    paid_at: datetime | None = None


def _summary_status(status, detail):
    if status == "processed":
        if detail == "accredited":
            return "approved"
        if detail in ("refunded", "partially_refunded"):
            return detail
        return "in_process"
    if status == "refunded":
        return "refunded"
    if status == "charged_back":
        return "charged_back"
    if status in ("action_required", "processing"):
        return "in_process"
    if status == "failed":
        return "rejected"
    if status == "canceled":
        return "cancelled"
    if status in ("created", "expired"):
        return status
    return "unknown"


def _main_payment(order):
    """El pago de la orden: el procesado si hay varios; si no, el primero."""
    transactions = order.get("transactions")
    payments = transactions.get("payments") if isinstance(transactions, dict) else None
    payments = [p for p in payments or [] if isinstance(p, dict)]
    for payment in payments:
        if payment.get("status") == "processed":
            return payment
    return payments[0] if payments else None


def read_charge(order):
    """Resume una orden de Mercado Pago en un Charge."""
    payment = _main_payment(order)
    payment_id = payment.get("id") if payment else None
    reference_id = payment.get("reference_id") if payment else None
    amount = to_decimal(order.get("total_paid_amount"))
    if amount is None and payment:
        amount = to_decimal(payment.get("paid_amount") or payment.get("amount"))
    return Charge(
        order_id=str(order.get("id") or ""),
        reference=str(order.get("external_reference") or ""),
        status=_summary_status(order.get("status"), order.get("status_detail")),
        payment_id=payment_id[:50] if isinstance(payment_id, str) and payment_id else None,
        reference_id=str(reference_id) if reference_id is not None else None,
        amount=amount,
        currency=order.get("currency") if isinstance(order.get("currency"), str) else None,
    )


def _fee(payment):
    """Comisión que paga la congregación (fee_details con fee_payer collector)."""
    total = Decimal("0")
    for detail in payment.get("fee_details") or []:
        if isinstance(detail, dict) and detail.get("fee_payer") == "collector":
            total += to_decimal(detail.get("amount")) or Decimal("0")
    return total


def _date(value):
    try:
        moment = datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None
    return moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)


def get_payment_details(charge):
    """Completa el Charge de un pago aprobado con la comisión y la fecha de
    aprobación del pago por debajo de la orden (reference_id).

    Si la consulta falla, el pago se confirma igual (decisión 2 de Enrique,
    20 nov): comisión vacía y la hora de ahora como fecha de pago. La
    comisión real se ve después en la cuenta de Mercado Pago. Si la orden no
    trajera la moneda, se toma de este pago.
    """
    details = None
    reference_id = charge.reference_id or ""
    if reference_id.isdigit():
        try:
            status, response = _result(get_sdk().payment().get(reference_id))
            if status == 200 and response:
                details = response
            else:
                logger.warning("Respuesta %s al consultar el pago %s de la orden %s", status, reference_id, charge.order_id)
        except APIException:
            raise
        except Exception as error:
            logger.warning("Sin respuesta al consultar el pago %s de la orden %s: %r", reference_id, charge.order_id, error)
    else:
        logger.warning("La orden %s no trae el id del pago: sin comisión", charge.order_id)

    if details is None:
        charge.fee = None
        charge.paid_at = datetime.now(timezone.utc)
        return charge
    charge.fee = _fee(details)
    charge.paid_at = _date(details.get("date_approved")) or datetime.now(timezone.utc)
    if charge.currency is None and isinstance(details.get("currency_id"), str):
        charge.currency = details["currency_id"]
    return charge


# ---------------------------------------------------------------------------
# Reembolsar
# ---------------------------------------------------------------------------

def refund_order(order_id):
    """Reembolso completo de una orden. Devuelve True si Mercado Pago lo aceptó.

    Lleva la clave de idempotencia refund-<id de la orden>: si el reembolso se
    pide dos veces (un aviso repetido, un reintento, un segundo clic), Mercado
    Pago devuelve el mismo reembolso y no reembolsa dos veces (comprobado en
    el paso 0: responde 201 con el mismo reembolso). Si en cambio respondiera
    409 idempotency_key_already_used, como dice la documentación, se consulta
    la orden: si ya está reembolsada, cuenta como hecho.
    """
    if not isinstance(order_id, str) or not ORDER_ID.match(order_id):
        logger.warning("No hay una orden de Mercado Pago válida que reembolsar (%r)", order_id)
        return False
    options = _options({IDEMPOTENCY_HEADER: f"refund-{order_id}"})
    try:
        result = get_sdk().order().refund(order_id, None, options)
    except APIException:
        raise
    except Exception as error:
        logger.warning("Mercado Pago no respondió al reembolsar la orden %s: %r", order_id, error)
        return False
    status, response = _result(result)
    if status in (200, 201):
        return True
    if status == 409:
        try:
            order = get_order(order_id)
        except PaymentServiceError as error:
            logger.warning("No se pudo comprobar el reembolso de la orden %s: %s", order_id, error)
            return False
        if order is not None and read_charge(order).status == "refunded":
            return True
    logger.warning(
        "Mercado Pago no reembolsó la orden %s: %s %s %s",
        order_id, status, response.get("error") or response.get("code"), response.get("message"),
    )
    return False
