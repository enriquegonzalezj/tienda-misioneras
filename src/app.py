"""
Arranque del servidor: configuración, base de datos, rutas de la API
y entrega del frontend compilado (carpeta dist/).
"""
import os
from datetime import timedelta
from flask import Flask, Response, jsonify, request, send_from_directory
from flask_migrate import Migrate
from werkzeug.exceptions import MethodNotAllowed, NotFound
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import safe_join
from api.utils import APIException
from api.models import db
from api.routes import api
from api.auth import auth, jwt
from api.catalog import catalog
from api.cart import cart
from api.checkout import checkout
from api.account import account
from api.admin_catalog import admin_catalog
from api.admin_products import admin_products
from api.admin_images import admin_images
from api.admin_shipping import admin_shipping
from api.images import MAX_REQUEST_BYTES
from api.seo import page_for, render_index, seo
from api.limiter import limiter
from api.commands import setup_commands

static_file_dir = os.path.join(os.path.dirname(os.path.realpath(__file__)), "../dist/")

app = Flask(__name__)
app.url_map.strict_slashes = False

# Detrás del proxy de Render (tarea 1.4). Sin esto, todas las peticiones parecen venir
# de la IP del proxy y el límite de intentos por IP sería uno solo para todo el mundo.
# TRUSTED_PROXY_HOPS dice cuántos proxies de confianza hay delante de Flask: ProxyFix toma
# la IP que añadió el último de ellos (contando desde la derecha de X-Forwarded-For), así
# que lo que invente el navegador al principio de la cabecera no cuenta.
# En local no se pone: vale 0 y no se confía en ninguna cabecera.
proxy_hops_text = os.getenv("TRUSTED_PROXY_HOPS", "").strip() or "0"
try:
    proxy_hops = int(proxy_hops_text)
except ValueError:
    raise RuntimeError("TRUSTED_PROXY_HOPS debe ser un número entero (0 o vacío en local)") from None
if not 0 <= proxy_hops <= 5:
    raise RuntimeError("TRUSTED_PROXY_HOPS debe estar entre 0 y 5")
if proxy_hops:
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=proxy_hops)

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
limiter.init_app(app)

# Dirección pública de la tienda, para armar enlaces en los correos (recuperación
# de contraseña). Viene del .env y nunca de la petición. Sin ella no se arranca.
public_base_url = os.getenv("PUBLIC_BASE_URL", "").strip().rstrip("/")
if not public_base_url.startswith(("http://", "https://")):
    raise RuntimeError("Falta PUBLIC_BASE_URL (por ejemplo http://localhost:3000) en el .env o en Render")
app.config["PUBLIC_BASE_URL"] = public_base_url

# Tamaño máximo de una petición (fotos del panel, paso 8 de la 2.1): una foto de
# hasta 10 MB más un margen. Flask deja de leer al pasarse y responde 413, así
# que nadie puede llenar la memoria del servidor mandando un archivo enorme.
app.config["MAX_CONTENT_LENGTH"] = MAX_REQUEST_BYTES

MIGRATE = Migrate(app, db, compare_type=True)
db.init_app(app)

setup_commands(app)

# Todas las rutas de la API llevan el prefijo /api; las de sesión, /api/auth
app.register_blueprint(api, url_prefix="/api")
# Catálogo público (tarea 3.2): /api/categories y /api/products
app.register_blueprint(catalog, url_prefix="/api")
# Carrito (tarea 4.1): /api/cart
app.register_blueprint(cart, url_prefix="/api")
# Pago como invitada (tareas 4.2 y 4.5): /api/checkout y /api/orders/<token>
app.register_blueprint(checkout, url_prefix="/api")
app.register_blueprint(auth, url_prefix="/api/auth")
# Cuenta de cliente (tarea 4.4): /api/account/..., todas con @customer_required
app.register_blueprint(account, url_prefix="/api")
# Panel de administración (tarea 2.1): /api/admin/..., todas con @admin_required
app.register_blueprint(admin_catalog, url_prefix="/api/admin")
app.register_blueprint(admin_products, url_prefix="/api/admin")
app.register_blueprint(admin_images, url_prefix="/api/admin")
# Paqueterías del panel (tarea 4.5): /api/admin/shipping-methods
app.register_blueprint(admin_shipping, url_prefix="/api/admin")
# Archivos para buscadores (tarea 5.7): /robots.txt y /sitemap.xml, sin prefijo
app.register_blueprint(seo)


@app.errorhandler(APIException)
def handle_invalid_usage(error):
    return jsonify(error.to_dict()), error.status_code


# Límite de intentos superado (ver api/limiter.py). Flask-Limiter añade Retry-After.
@app.errorhandler(429)
def handle_too_many_requests(_error):
    return jsonify({"message": "Demasiados intentos. Espera unos minutos y vuelve a intentarlo."}), 429


# Petición más grande que MAX_CONTENT_LENGTH (una foto de más de 10 MB).
@app.errorhandler(413)
def handle_too_large(_error):
    return jsonify({"message": "La foto pesa más de 10 MB."}), 413


# --- Entrega del frontend (tarea 3.5) ---------------------------------------------
# Flask decide el código HTTP de cada dirección antes de entregar index.html, para
# que Google reciba un 404 real en lo que no existe (React solo puede dibujar el
# aviso, no cambiar el código), y pone el título, la descripción y las etiquetas
# Open Graph de cada página (api/seo.py, donde están las páginas que existen).

# Direcciones que Google no debe mostrar en sus resultados. La cabecera X-Robots-Tag
# funciona aunque el buscador no ejecute JavaScript. Solo /admin existe hoy; las
# demás se dejan listas para cuando existan (pago 4.2, cuenta 4.4).
NOINDEX_PREFIXES = ("admin", "carrito", "pago", "pedido", "cuenta", "restablecer-contrasena")
# Páginas con un token en la dirección (/pedido/<token>, tarea 4.2): con
# no-referrer, el navegador no manda la dirección a otra web si se pulsa un
# enlace externo desde ahí.
NO_REFERRER_PREFIXES = ("pedido",)


def _starts_with(path, prefixes):
    return any(path == prefix or path.startswith(prefix + "/") for prefix in prefixes)


def _serve_page(path):
    index_file = os.path.join(static_file_dir, "index.html")
    try:
        with open(index_file, encoding="utf-8") as file:
            html = file.read()
    except FileNotFoundError:
        # Pasa en local si nunca se corrió npm run build (con npm run start no hace falta).
        return Response("Falta compilar el frontend: ejecuta npm run build.", status=503, mimetype="text/plain")
    page = page_for(path)
    response = Response(render_index(html, page), status=page["status"], mimetype="text/html")
    # El HTML siempre se pide de nuevo, para no servir una versión vieja tras publicar.
    response.cache_control.no_cache = True
    if _starts_with(path, NOINDEX_PREFIXES):
        response.headers["X-Robots-Tag"] = "noindex"
    if _starts_with(path, NO_REFERRER_PREFIXES):
        response.headers["Referrer-Policy"] = "no-referrer"
    return response


# Cualquier dirección que no sea de la API: si es un archivo de dist/ (JS, CSS,
# imágenes), se entrega; si no, se entrega index.html con el código que toca.
# Una barra final (/tienda/) se trata igual que sin ella, como hace React Router.
@app.route("/", defaults={"path": ""}, methods=["GET"])
@app.route("/<path:path>", methods=["GET"])
def serve_frontend(path):
    if path == "api" or path.startswith("api/"):
        raise NotFound()  # lo responde handle_not_found en JSON
    # safe_join devuelve None si la dirección intenta salir de dist/ (por ejemplo con ..)
    # index.html no se entrega suelto: siempre pasa por _serve_page.
    file_path = safe_join(static_file_dir, path) if path and path != "index.html" else None
    if file_path and os.path.isfile(file_path):
        response = send_from_directory(static_file_dir, path)
        response.cache_control.max_age = 0  # evita que el navegador sirva una versión vieja
        return response
    return _serve_page(path.rstrip("/"))


# Una ruta de la API que no existe responde en JSON, como el resto de la API.
# (Antes, GET /api/algo-mal-escrito devolvía el HTML de la tienda con 200.)
@app.errorhandler(NotFound)
def handle_not_found(error):
    if request.path == "/api" or request.path.startswith("/api/"):
        return jsonify({"message": "No encontrado"}), 404
    return error


@app.errorhandler(MethodNotAllowed)
def handle_method_not_allowed(error):
    if request.path == "/api" or request.path.startswith("/api/"):
        return jsonify({"message": "Método no permitido"}), 405
    return error
