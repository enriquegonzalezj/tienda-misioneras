"""
Arranque del servidor: configuración, base de datos, rutas de la API
y entrega del frontend compilado (carpeta dist/).
"""
import os
from datetime import timedelta
from flask import Flask, jsonify, send_from_directory
from flask_migrate import Migrate
from api.utils import APIException
from api.models import db
from api.routes import api
from api.auth import auth, jwt
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

# Inicio de sesión (tarea 1.5): JWT guardado en cookies httpOnly, con protección CSRF.
# La llave firma los tokens; quien la tenga puede fabricar una sesión de administración.
# Por eso viene del .env (nunca del código) y, si falta o es corta, el servidor no arranca.
jwt_secret = os.getenv("JWT_SECRET_KEY")
if not jwt_secret:
    raise RuntimeError("Falta JWT_SECRET_KEY en el archivo .env o en las variables de Render")
if len(jwt_secret) < 32:
    raise RuntimeError("JWT_SECRET_KEY es demasiado corta: usa al menos 32 caracteres")
app.config["JWT_SECRET_KEY"] = jwt_secret
# El token viaja solo en cookies: JavaScript no puede leerlo, así que un script inyectado no lo roba.
app.config["JWT_TOKEN_LOCATION"] = ["cookies"]
# Secure: la cookie solo viaja por HTTPS. Activado salvo que el .env diga "false" (solo en local).
app.config["JWT_COOKIE_SECURE"] = os.getenv("JWT_COOKIE_SECURE", "true").strip().lower() != "false"
# Lax: el navegador no manda la cookie en envíos de formularios desde otras webs.
app.config["JWT_COOKIE_SAMESITE"] = "Lax"
# CSRF de doble envío: en POST, PUT, PATCH y DELETE el frontend copia la cookie
# csrf_access_token en la cabecera X-CSRF-TOKEN. Sin ella, la petición se rechaza.
app.config["JWT_COOKIE_CSRF_PROTECT"] = True
# La sesión dura 1 h y se renueva sola mientras se usa (ver api/auth.py).
# La cookie se borra al cerrar el navegador (comportamiento por defecto).
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(hours=1)
jwt.init_app(app)

MIGRATE = Migrate(app, db, compare_type=True)
db.init_app(app)

setup_commands(app)

# Todas las rutas de la API llevan el prefijo /api; las de sesión, /api/auth
app.register_blueprint(api, url_prefix="/api")
app.register_blueprint(auth, url_prefix="/api/auth")


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
