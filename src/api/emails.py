"""Correos automáticos con Resend (tarea 5.2).

Este archivo es el único que habla con Resend. Las rutas llaman a send() con
el destinatario, el asunto, el nombre de la plantilla y sus datos; aquí se
arma el correo y se manda.

Cómo se manda (decisiones de Enrique, 20 nov):
- En segundo plano: send() arma el correo en la misma petición (así un error
  de plantilla sale al momento) y lo entrega a un hilo aparte, que es el que
  llama a Resend. La respuesta no espera a Resend: "Olvidé mi contraseña"
  tarda lo mismo exista o no la cuenta (nadie averigua cuentas midiendo
  tiempos) y el webhook de Mercado Pago responde sin esperar.
- Un correo que falla nunca rompe nada: send() no lanza errores; si Resend
  falla o tarda más de TIMEOUT_SECONDS, solo se anota en el registro. Si
  Render reinicia justo mientras se manda, ese correo se pierde (aceptado).
- Plantillas en src/api/templates/emails/: un .txt y un .html por correo, con
  Jinja. En el .html, Jinja escapa solo cada dato (autoescape), así que un
  nombre como <script> llega como texto.
- Remitente fijo en el subdominio verificado en Resend
  (avisos.vocacionesmhpvm.com, que no recibe correos); las respuestas van al
  correo de la tienda (Reply-To).
- Sin seguimiento de aperturas ni de clics (apagado en el dominio de Resend).

Variable (en `.env` en local y a mano en Environment en Render; nunca en el
código ni en el chat):
- `RESEND_API_KEY`: llave de solo envío, limitada al dominio. Una distinta en
  local y en Render. Sin ella la tienda arranca y funciona igual; los correos
  no salen (is_configured() da False y quien llama decide qué hacer).

En el registro nunca va el contenido del correo ni la dirección de quien lo
recibe: solo una referencia (por ejemplo "recuperación, cuenta 12").
"""
import logging
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import resend
from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape
from resend.http_client_requests import RequestsClient

logger = logging.getLogger(__name__)

STORE_NAME = "Tienda Vocaciones MHPVM"
# Remitente: el subdominio verificado en Resend. Esta dirección no recibe correos.
FROM_ADDRESS = f"{STORE_NAME} <pedidos@avisos.vocacionesmhpvm.com>"
# Correo de la tienda (decisión de Enrique, 20 nov): a él van las respuestas de
# quien compra (Reply-To) y los avisos de pedidos y donativos a la congregación.
STORE_EMAIL = "merch.vocaciones.mhpvm@gmail.com"

# Cuánto se espera a Resend como máximo, en segundos. Como se manda en segundo
# plano, nadie espera en pantalla; el límite evita hilos colgados.
TIMEOUT_SECONDS = 10
# Hilos que mandan correos a la vez. Con 2 basta: Render tiene 1 worker y
# Resend admite unas pocas peticiones por segundo.
MAX_WORKERS = 2
# En las pruebas se pone en False para mandar en el mismo hilo y revisar el resultado.
SEND_IN_BACKGROUND = True

TEMPLATES_DIR = Path(__file__).resolve().parent / "templates" / "emails"
_templates = Environment(
    loader=FileSystemLoader(TEMPLATES_DIR),
    # Escapa los datos solo en el HTML; el texto plano va tal cual.
    autoescape=select_autoescape(enabled_extensions=("html",), default_for_string=False),
    # Un dato que falta es un error al armar el correo, no un hueco en blanco.
    undefined=StrictUndefined,
    trim_blocks=True,
    lstrip_blocks=True,
    keep_trailing_newline=True,
)

# El grupo de hilos se crea al primer envío y no al importar: con --preload,
# gunicorn importa la app antes de crear el worker, y los hilos no pasan de un
# proceso a otro.
_executor = None
_executor_lock = threading.Lock()


def _api_key():
    return os.getenv("RESEND_API_KEY", "").strip()


def is_configured():
    """True si hay llave de Resend: los correos se pueden mandar."""
    return bool(_api_key())


def render(template, **context):
    """Arma el texto plano y el HTML de una plantilla. Devuelve (texto, html)."""
    context.setdefault("store_name", STORE_NAME)
    context.setdefault("store_email", STORE_EMAIL)
    text = _templates.get_template(f"{template}.txt").render(**context)
    html = _templates.get_template(f"{template}.html").render(**context)
    return text, html


def _get_executor():
    global _executor
    with _executor_lock:
        if _executor is None:
            _executor = ThreadPoolExecutor(max_workers=MAX_WORKERS, thread_name_prefix="correo")
        return _executor


def _deliver(params, idempotency_key, log_ref):
    """Llama a Resend. Corre en el hilo de correos (o en el mismo, en las pruebas).
    Devuelve True si Resend aceptó el correo."""
    key = _api_key()
    if not key:
        logger.error("Correo sin mandar (%s): falta RESEND_API_KEY", log_ref)
        return False
    resend.api_key = key
    resend.default_http_client = RequestsClient(timeout=TIMEOUT_SECONDS)
    # Con la misma clave, Resend no manda dos veces el mismo correo durante 24 h
    # aunque lo pidamos de nuevo (por ejemplo, si un aviso se procesa dos veces).
    options = {"idempotency_key": idempotency_key} if idempotency_key else None
    try:
        response = resend.Emails.send(params, options)
    except Exception as error:  # noqa: BLE001 - un correo nunca debe romper nada
        # Solo el tipo de error y la referencia: el mensaje de Resend podría
        # repetir la dirección de quien recibe.
        logger.error("Resend no aceptó el correo (%s): %s", log_ref, type(error).__name__)
        return False
    logger.info("Correo mandado (%s): %s", log_ref, (response or {}).get("id"))
    return True


def send(to, subject, template, context, *, log_ref, idempotency_key=None, reply_to=STORE_EMAIL):
    """Arma el correo y lo manda en segundo plano. Nunca lanza errores.

    - to: dirección de quien lo recibe.
    - subject: asunto, sin el nombre de la tienda (se añade aquí).
    - template: nombre de la plantilla, sin extensión (por ejemplo "password_reset").
    - context: datos de la plantilla.
    - log_ref: texto corto para el registro, sin datos personales.
    - idempotency_key: clave única de este correo (hasta 256 caracteres) para
      que Resend no lo mande dos veces si se pide de nuevo.

    Devuelve True si el correo quedó en cola (o se mandó, en las pruebas) y
    False si no se pudo armar o no hay llave.
    """
    if not is_configured():
        logger.error("Correo sin mandar (%s): falta RESEND_API_KEY", log_ref)
        return False
    try:
        text, html = render(template, **context)
    except Exception:  # noqa: BLE001
        logger.exception("No se pudo armar el correo (%s)", log_ref)
        return False
    params = {
        "from": FROM_ADDRESS,
        "to": [to],
        "subject": f"{subject} | {STORE_NAME}",
        "text": text,
        "html": html,
    }
    if reply_to:
        params["reply_to"] = reply_to
    if not SEND_IN_BACKGROUND:
        return _deliver(params, idempotency_key, log_ref)
    try:
        _get_executor().submit(_deliver, params, idempotency_key, log_ref)
    except RuntimeError:
        # El grupo de hilos ya se cerró (el servidor se está apagando).
        logger.error("Correo sin mandar (%s): el servidor se está apagando", log_ref)
        return False
    return True
