"""
Arranque del servidor: configuración, base de datos, rutas de la API
y entrega del frontend compilado (carpeta dist/).
"""
import os
from flask import Flask, jsonify, send_from_directory
from flask_migrate import Migrate
from api.utils import APIException
from api.models import db
from api.routes import api
from api.commands import setup_commands

static_file_dir = os.path.join(os.path.dirname(os.path.realpath(__file__)), "../dist/")

app = Flask(__name__)
app.url_map.strict_slashes = False

# Base de datos: siempre desde DATABASE_URL. Si falta, el servidor no arranca.
# Es mejor un error claro al arrancar que guardar pedidos en un archivo temporal.
db_url = os.getenv("DATABASE_URL")
if not db_url:
    raise RuntimeError("Falta DATABASE_URL en el archivo .env o en las variables de Render")
app.config["SQLALCHEMY_DATABASE_URI"] = db_url.replace("postgres://", "postgresql://", 1)
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

MIGRATE = Migrate(app, db, compare_type=True)
db.init_app(app)

setup_commands(app)

# Todas las rutas de la API llevan el prefijo /api
app.register_blueprint(api, url_prefix="/api")


@app.errorhandler(APIException)
def handle_invalid_usage(error):
    return jsonify(error.to_dict()), error.status_code


@app.route("/")
def serve_index():
    return send_from_directory(static_file_dir, "index.html")


# Cualquier otra ruta: si es un archivo de dist/ (JS, CSS, imágenes), se entrega;
# si no, se entrega index.html y React decide qué pantalla mostrar.
@app.route("/<path:path>", methods=["GET"])
def serve_any_other_file(path):
    if not os.path.isfile(os.path.join(static_file_dir, path)):
        path = "index.html"
    response = send_from_directory(static_file_dir, path)
    response.cache_control.max_age = 0  # evita que el navegador sirva una versión vieja
    return response