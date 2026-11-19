"""Conexión con Mercado Pago (tarea 4.6).

Aquí solo se lee la configuración y se arma el cliente del SDK oficial
(`mercadopago`). Lo usan las rutas que crean la preferencia de pago, el
webhook y los reembolsos del panel.

Variables (en `.env` en local y a mano en Environment en Render; nunca en el
código ni en el chat):
- `MP_ACCESS_TOKEN`: access token de la cuenta que cobra. En local y en las
  pruebas en Render, el de la cuenta vendedora de prueba.
- `MP_WEBHOOK_SECRET`: clave secreta del webhook de la aplicación, en Tus
  integraciones > Webhooks. Sirve para comprobar que un aviso viene de
  Mercado Pago (firma `x-signature`).

Sin `MP_ACCESS_TOKEN` la tienda arranca y funciona igual; solo pagar responde
503, como subir fotos sin Cloudinary.
"""
import os

import mercadopago
from mercadopago.config import RequestOptions

from api.utils import APIException

NOT_CONFIGURED = "Por ahora no se pueden recibir pagos. Intenta más tarde."

# Render tiene un solo worker de gunicorn: mientras una petición espera a
# Mercado Pago, la tienda entera espera. El SDK trae 60 s y 3 reintentos por
# defecto; con 10 s y 1 reintento, una caída de Mercado Pago tarda como mucho
# unos 20 s en dar error en lugar de dejar la tienda colgada minutos.
# (urllib3 no reintenta los POST por un error del servidor: crear una
# preferencia o un reembolso no se repite por esto.)
TIMEOUT_SECONDS = 10.0  # el SDK exige un decimal: con 10 lanza ValueError
MAX_RETRIES = 1


def _env(name):
    return os.getenv(name, "").strip()


def is_configured():
    """True si hay access token: la tienda puede crear preferencias de pago."""
    return bool(_env("MP_ACCESS_TOKEN"))


def get_sdk():
    """Cliente del SDK listo para usar, o 503 si falta el access token.

    Se crea en cada llamada (es barato) para leer siempre el valor actual
    de la variable.
    """
    token = _env("MP_ACCESS_TOKEN")
    if not token:
        raise APIException(NOT_CONFIGURED, status_code=503)
    options = RequestOptions(
        connection_timeout=TIMEOUT_SECONDS,
        max_retries=MAX_RETRIES,
    )
    return mercadopago.SDK(token, request_options=options)


def webhook_secret():
    """Clave secreta del webhook, o None si no está puesta.

    Sin clave, el webhook rechaza todos los avisos: nunca se marca un pedido
    como pagado sin comprobar la firma.
    """
    return _env("MP_WEBHOOK_SECRET") or None
