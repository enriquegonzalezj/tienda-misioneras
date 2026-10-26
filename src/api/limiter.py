"""
Límite de intentos (tarea 1.5) con Flask-Limiter.

Los contadores viven en la memoria del proceso: se reinician con cada despliegue
y, si gunicorn arranca varios procesos (workers), cada uno lleva su cuenta.
Para esta tienda es suficiente; se revisa en la 1.4.
"""
from flask import request
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

limiter = Limiter(
    key_func=get_remote_address,  # por defecto, cuenta por IP
    storage_uri="memory://",
    # Ventana móvil: cuenta los intentos de los últimos 15 min exactos, sin que
    # el contador se ponga a cero de golpe al cambiar de cuarto de hora.
    strategy="moving-window",
    # Manda la cabecera Retry-After: el frontend sabrá cuánto falta para reintentar.
    headers_enabled=True,
)


def email_key():
    """Cuenta por correo (en minúsculas), para frenar a quien prueba contraseñas
    contra una misma cuenta desde muchas IP. Sin correo, cuenta por IP."""
    data = request.get_json(silent=True)
    email = data.get("email") if isinstance(data, dict) else None
    if isinstance(email, str) and email.strip():
        return "email:" + email.strip().lower()
    return get_remote_address()


def failed_login(response):
    """Solo cuentan los intentos fallidos: entrar bien no gasta intentos."""
    return response.status_code == 401
