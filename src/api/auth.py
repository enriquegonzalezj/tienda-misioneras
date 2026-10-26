"""
Acceso seguro (tarea 1.5): sesión con JWT en cookies, registro, inicio y cierre
de sesión, y decoradores para proteger rutas por rol.

Las rutas cuelgan de /api/auth (ver app.py). Los textos que ve la persona no
marcan género: también compran hombres y puede haber administradores.
"""
import hashlib
import re
from datetime import datetime, timedelta, timezone
from functools import wraps

from flask import Blueprint, jsonify, request
from flask_jwt_extended import (
    JWTManager,
    create_access_token,
    current_user,
    get_jwt,
    jwt_required,
    set_access_cookies,
    unset_jwt_cookies,
    verify_jwt_in_request,
)
from sqlalchemy import select

from api.limiter import email_key, failed_login, limiter
from api.models import User, db
from api.passwords import CUSTOMER_MIN_LENGTH, MAX_LENGTH, hash_password, password_problem, verify_password
from api.utils import APIException

auth = Blueprint("auth", __name__)
jwt = JWTManager()

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
# Si al token le queda menos que esto, se renueva en la respuesta (opción A).
REFRESH_WHEN_LESS_THAN = timedelta(minutes=30)


# ---------- Cómo se relaciona el token con la cuenta ----------

def _password_fingerprint(user):
    # Huella corta del hash de la contraseña. Va dentro del token: si la contraseña
    # cambia (recuperación, paso 6), la huella ya no coincide y todas las sesiones
    # abiertas dejan de valer, sin tabla extra.
    return hashlib.sha256(user.password_hash.encode()).hexdigest()[:16]


@jwt.user_identity_loader
def _identity(user):
    # En el token solo va el id, como texto (PyJWT exige que "sub" sea texto).
    return str(user.id)


@jwt.additional_claims_loader
def _claims(user):
    return {"pwd": _password_fingerprint(user)}


@jwt.user_lookup_loader
def _load_user(_jwt_header, jwt_data):
    # En cada petición se busca la cuenta en la base. Así, desactivar una cuenta
    # o cambiar su contraseña cierra sus sesiones al momento.
    user = db.session.get(User, int(jwt_data["sub"]))
    if user is None or not user.is_active:
        return None
    if jwt_data.get("pwd") != _password_fingerprint(user):
        return None
    return user


# ---------- Respuestas de error en español (por defecto salen en inglés) ----------

def _session_error(message="Inicia sesión para continuar."):
    response = jsonify({"message": message})
    unset_jwt_cookies(response)
    return response, 401


@jwt.unauthorized_loader
def _no_session(reason):
    if "CSRF" in reason:
        return jsonify({"message": "No se pudo confirmar la petición. Recarga la página e inténtalo de nuevo."}), 401
    return _session_error()


@jwt.invalid_token_loader
def _invalid_session(_reason):
    return _session_error()


@jwt.expired_token_loader
def _expired_session(_jwt_header, _jwt_data):
    return _session_error("Tu sesión terminó. Vuelve a iniciar sesión.")


@jwt.user_lookup_error_loader
def _account_gone(_jwt_header, _jwt_data):
    return _session_error()


# ---------- Renovación automática mientras se usa (opción A) ----------

@auth.after_app_request
def refresh_expiring_session(response):
    # Patrón documentado de flask-jwt-extended: si la petición traía una sesión
    # válida y le queda poco, se manda una cookie nueva con otra hora.
    # Tras 1 h sin peticiones, la sesión caduca y hay que volver a entrar.
    try:
        expires_at = get_jwt()["exp"]
    except (RuntimeError, KeyError):
        return response  # la petición no traía sesión (o es logout)
    if current_user is None:
        return response
    if datetime.now(timezone.utc) + REFRESH_WHEN_LESS_THAN > datetime.fromtimestamp(expires_at, timezone.utc):
        set_access_cookies(response, create_access_token(identity=current_user))
    return response


# ---------- Decoradores para proteger rutas ----------

def admin_required(fn):
    """La ruta exige sesión con rol de administración."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        if current_user.role != "admin":
            raise APIException("No tienes permiso para hacer esto.", status_code=403)
        return fn(*args, **kwargs)
    return wrapper


def customer_required(fn):
    """La ruta exige sesión de cliente. Cada ruta devuelve solo los datos de
    current_user, nunca los de un id que llegue en la URL."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        if current_user.role != "customer":
            raise APIException("Esta sección es solo para cuentas de cliente.", status_code=403)
        return fn(*args, **kwargs)
    return wrapper


# ---------- Utilidades de las rutas ----------

def _json_body():
    # Solo se acepta JSON: un formulario de otra web no puede mandarlo sin permiso.
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise APIException("Faltan los datos de la petición.", status_code=400)
    return data


def _text(data, field):
    value = data.get(field)
    return value.strip() if isinstance(value, str) else ""


def _user_json(user):
    # Nunca se devuelve password_hash.
    return {
        "id": user.id,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "phone": user.phone,
        "role": user.role,
    }


# ---------- Rutas ----------

@auth.route("/register", methods=["POST"])
# Por IP y contando todos los intentos: frena la creación masiva de cuentas y a
# quien use el aviso de correo repetido para averiguar qué correos existen.
# 20 por hora deja registrarse a un grupo que comparte la wifi de un evento.
@limiter.limit("20 per hour")
def register():
    """Crea una cuenta de cliente y deja la sesión iniciada. El rol siempre es
    customer, aunque el navegador mande otro."""
    data = _json_body()
    email = _text(data, "email").lower()
    first_name = _text(data, "first_name")
    last_name = _text(data, "last_name")
    phone = re.sub(r"[\s\-().]", "", _text(data, "phone"))
    password = data.get("password") if isinstance(data.get("password"), str) else ""

    errors = {}
    if not EMAIL_PATTERN.match(email) or len(email) > 254:
        errors["email"] = "Escribe un correo válido."
    if not first_name or len(first_name) > 80:
        errors["first_name"] = "Escribe tu nombre (hasta 80 caracteres)."
    if not last_name or len(last_name) > 80:
        errors["last_name"] = "Escribe tus apellidos (hasta 80 caracteres)."
    if phone and not re.fullmatch(r"[0-9]{10}", phone):
        errors["phone"] = "El teléfono debe tener 10 dígitos."
    problem = password_problem(password, CUSTOMER_MIN_LENGTH, email=email)
    if problem:
        errors["password"] = problem
    if data.get("privacy_accepted") is not True:
        errors["privacy_accepted"] = "Para crear la cuenta hay que aceptar el aviso de privacidad."
    if errors:
        raise APIException("Revisa los datos marcados.", status_code=400, payload={"errors": errors})

    if db.session.scalar(select(User).where(User.email == email)):
        raise APIException(
            "Ya existe una cuenta con ese correo. Inicia sesión o recupera tu contraseña.",
            status_code=409,
        )

    user = User(
        email=email,
        password_hash=hash_password(password),
        role="customer",
        first_name=first_name,
        last_name=last_name,
        phone=phone or None,
        is_active=True,
        privacy_accepted_at=datetime.now(timezone.utc),
    )
    db.session.add(user)
    db.session.commit()

    response = jsonify({"user": _user_json(user)})
    set_access_cookies(response, create_access_token(identity=user))
    return response, 201


@auth.route("/login", methods=["POST"])
# Dos límites, solo con intentos fallidos: por IP (alguien probando muchas cuentas)
# y por correo (alguien probando muchas contraseñas contra una cuenta). Si una
# cuenta se bloquea por intentos ajenos, se libera sola a los 15 minutos.
@limiter.limit("20 per 15 minutes", deduct_when=failed_login)
@limiter.limit("5 per 15 minutes", key_func=email_key, deduct_when=failed_login)
def login():
    data = _json_body()
    email = _text(data, "email").lower()
    password = data.get("password") if isinstance(data.get("password"), str) else ""

    user = None
    if email and 0 < len(password) <= MAX_LENGTH:
        user = db.session.scalar(select(User).where(User.email == email))
    # Mismo mensaje si el correo no existe, la contraseña falla o la cuenta está
    # desactivada: no se le dice a nadie cuál de las tres cosas pasó.
    if user is None or not user.is_active or not verify_password(user.password_hash, password):
        raise APIException("Correo o contraseña incorrectos.", status_code=401)

    response = jsonify({"user": _user_json(user)})
    set_access_cookies(response, create_access_token(identity=user))
    return response, 200


@auth.route("/logout", methods=["POST"])
def logout():
    # No exige sesión: cerrar sesión tiene que funcionar siempre, aunque ya
    # haya caducado. Borra las dos cookies (token y CSRF).
    response = jsonify({"message": "Sesión cerrada."})
    unset_jwt_cookies(response)
    return response, 200


@auth.route("/me", methods=["GET"])
@jwt_required()
def me():
    """Datos de la cuenta con sesión iniciada. El frontend lo usa al cargar
    para saber si hay sesión y de qué rol."""
    return jsonify({"user": _user_json(current_user)}), 200
