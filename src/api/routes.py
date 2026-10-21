"""
Rutas de la API. Todas cuelgan del prefijo /api (ver app.py).
"""
from flask import Blueprint, jsonify

api = Blueprint("api", __name__)


@api.route("/health", methods=["GET"])
def health():
    # Comprobación mínima de que el servidor está vivo.
    # Sirve en local y para que Render sepa si el servicio responde.
    return jsonify({"status": "ok"}), 200