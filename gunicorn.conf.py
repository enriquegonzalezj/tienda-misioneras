"""
Configuración de gunicorn en Render (commit de los Logs, después de la 5.2).

gunicorn lee este archivo solo, porque se llama gunicorn.conf.py y está en la
carpeta desde donde arranca (la raíz del repositorio en Render; el --chdir
./src/ del startCommand se aplica después). No hace falta tocar render.yaml.
En local no se usa: pipenv run start arranca Flask sin gunicorn.

Lo que Render ya pone por su cuenta en GUNICORN_CMD_ARGS (--preload,
--access-logfile - y --bind) manda sobre este archivo para esas opciones; aquí
solo van dos que Render no pone:

1. logger_class: el registro de accesos (una línea por petición) tacha los
   tokens. Cada pedido y donativo se consulta con un token largo que va en la
   dirección (/pedido/<token>, /donativo/<token>, /api/orders/<token> y
   /api/donations/<token>): con él se ve el pedido completo (nombre, dirección,
   teléfono). La regla del proyecto es que el token nunca va al registro
   (CLAUDE.md, Seguridad). Además se quita la parte de la dirección después de
   "?" (la vuelta de Mercado Pago, las búsquedas del panel con nombres o
   correos), salvo en el webhook de Mercado Pago, donde solo lleva el folio y
   el id de la orden y sirve para revisar los avisos. La cabecera Referer (la
   página desde la que se pidió) se trata igual.

2. logconfig_dict: hace que salgan en Render los logger.info de la app (por
   ejemplo "Aviso de la orden ...: paid" o "Correo mandado (...)"). Sin esto,
   Python solo escribe los avisos de nivel warning o más grave. "loggers" no
   nombra a gunicorn.error ni a gunicorn.access a propósito: gunicorn mezcla
   este diccionario con su configuración por defecto, y si "loggers" faltara,
   volvería a configurar sus propios registros y cada línea de acceso saldría
   dos veces.
"""
import re
from urllib.parse import urlsplit, urlunsplit

from gunicorn.glogging import Logger

# /pedido/<token>, /donativo/<token>, /api/orders/<token>(/pay) y
# /api/donations/<token>(/pay). /api/donations/options no es un token.
TOKEN_PATH = re.compile(r"^(/(?:pedido|donativo)/|/api/(?:orders|donations)/)(?!options(?:/|$))[^/]+")
# La única dirección que conserva lo que va después de "?".
KEEP_QUERY_PATHS = ("/api/webhooks/mercadopago",)


def redact_path(path):
    """La dirección sin el token: /pedido/[token], /api/orders/[token]/pay."""
    return TOKEN_PATH.sub(r"\1[token]", path)


def redact_target(target):
    """Dirección pedida (con o sin "?..."), sin token y sin la consulta,
    salvo en el webhook."""
    path, _, query = target.partition("?")
    path = redact_path(path)
    if query and path in KEEP_QUERY_PATHS:
        return f"{path}?{query}"
    return path


def redact_referer(referer):
    """La página de origen, sin token y sin consulta. "-" si no hay."""
    if not referer or referer == "-":
        return referer
    try:
        parts = urlsplit(referer)
    except ValueError:
        return "-"
    return urlunsplit((parts.scheme, parts.netloc, redact_path(parts.path), "", ""))


class RedactingLogger(Logger):
    """El registro de accesos de siempre, con los tokens tachados."""

    def atoms(self, resp, req, environ, request_time):
        atoms = super().atoms(resp, req, environ, request_time)
        target = redact_target(environ.get("RAW_URI") or environ.get("PATH_INFO", ""))
        path, _, query = target.partition("?")
        # "r" es la línea de la petición ("GET /pedido/... HTTP/1.1"), "U" la
        # dirección, "q" la consulta y "f" la página de origen (Referer).
        atoms["r"] = f"{environ.get('REQUEST_METHOD', '-')} {target} {environ.get('SERVER_PROTOCOL', '-')}"
        atoms["U"] = path
        atoms["q"] = query
        atoms["f"] = redact_referer(atoms.get("f"))
        return atoms


logger_class = RedactingLogger

logconfig_dict = {
    "version": 1,
    "disable_existing_loggers": False,
    "root": {"level": "INFO", "handlers": ["app"]},
    # Ni gunicorn.error ni gunicorn.access: gunicorn los configura solo. Las
    # migraciones (alembic) escriben varias líneas de info al arrancar que no
    # dicen nada útil.
    "loggers": {"alembic": {"level": "WARNING"}},
    "handlers": {
        "app": {
            "class": "logging.StreamHandler",
            "formatter": "app",
            "stream": "ext://sys.stderr",
        },
    },
    "formatters": {
        # Render ya pone la fecha y la hora de cada línea.
        "app": {"format": "[%(levelname)s] %(name)s: %(message)s"},
    },
}
