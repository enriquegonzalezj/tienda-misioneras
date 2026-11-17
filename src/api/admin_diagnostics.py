"""
Diagnóstico temporal de la IP (tarea 1.4): GET /api/admin/ip-diagnostics.

Sirve para medir en Render cuántos proxies añaden su IP a X-Forwarded-For y
así poner TRUSTED_PROXY_HOPS con el número real (ver ProxyFix en app.py).
Devuelve solo las cabeceras de IP de la propia petición de quien la abre, y
solo con sesión de administración. Es un andamio: se quita en cuanto la
medición esté hecha y TRUSTED_PROXY_HOPS puesto en Render.
"""
import os

from flask import Blueprint, jsonify, request

from api.auth import admin_required

admin_diagnostics = Blueprint("admin_diagnostics", __name__)


def _header(name):
    value = request.headers.get(name, "").strip()
    return value or None


@admin_diagnostics.route("/ip-diagnostics", methods=["GET"])
@admin_required
def ip_diagnostics():
    # ProxyFix guarda aquí lo que había antes de cambiar remote_addr.
    # Si no está, ProxyFix no está activo (TRUSTED_PROXY_HOPS vacío o 0).
    original = request.environ.get("werkzeug.proxy_fix.orig") or {}
    forwarded = _header("X-Forwarded-For")
    response = jsonify(
        {
            # La IP que usa el límite de intentos (get_remote_address).
            "remote_addr": request.remote_addr,
            # La IP de quien conecta directamente con gunicorn (el último proxy).
            "remote_addr_before_proxy_fix": original.get("REMOTE_ADDR", request.remote_addr),
            "proxy_fix_active": bool(original),
            "trusted_proxy_hops": os.getenv("TRUSTED_PROXY_HOPS", "").strip() or "0",
            # De izquierda a derecha, tal como llega: cada proxy añade al final.
            "x_forwarded_for": [part.strip() for part in forwarded.split(",")] if forwarded else [],
            "cf_connecting_ip": _header("CF-Connecting-IP"),
            "true_client_ip": _header("True-Client-IP"),
            "x_real_ip": _header("X-Real-IP"),
        }
    )
    response.headers["Cache-Control"] = "no-store"
    return response
