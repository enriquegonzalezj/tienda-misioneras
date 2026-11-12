"""
Cuenta de cliente (tarea 4.4): datos, dirección guardada y contraseña.

  GET    /api/account            datos y dirección de la cuenta con sesión
  PUT    /api/account/profile    nombre(s), apellidos y teléfono
  PUT    /api/account/address    crea o cambia la dirección (una por cuenta)
  DELETE /api/account/address    quita la dirección guardada
  POST   /api/account/password   cambia la contraseña con la actual

Reglas (CLAUDE.md, Seguridad):
- Todas llevan @customer_required y trabajan solo con current_user: ninguna
  recibe un id en la dirección, así nadie puede leer ni cambiar otra cuenta.
- El correo no se cambia aquí: sin un correo de verificación (5.2), cambiarlo
  dejaría que alguien con la sesión abierta se quedara con la cuenta.
- La dirección se valida con las mismas reglas que /pago (checkout.py), para que
  lo guardado aquí siempre sirva para crear un pedido.
- Cambiar la contraseña cierra las demás sesiones (cambia la huella del token,
  ver auth.py) y deja abierta esta con una cookie nueva.
"""
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from flask_jwt_extended import create_access_token, current_user, set_access_cookies
from sqlalchemy import update

from api.auth import customer_required
from api.checkout import INVALID_DATA, MEXICAN_STATES, _digits, _text
from api.limiter import limiter
from api.models import Address, PasswordResetToken, db
from api.passwords import CUSTOMER_MIN_LENGTH, MAX_LENGTH, hash_password, password_problem, verify_password
from api.utils import APIException

account = Blueprint("account", __name__)

# Campos de texto de la dirección: (clave en la API, largo como en models.py,
# mensaje si falta o None si es opcional). Las claves son las mismas de /pago.
ADDRESS_TEXT_FIELDS = [
    ("street", 150, "Escribe la calle."),
    ("exterior_number", 20, "Escribe el número exterior."),
    ("interior_number", 20, None),
    ("neighborhood", 100, "Escribe la colonia."),
    ("municipality", 100, "Escribe el municipio o la alcaldía."),
    ("references", 255, None),
    ("recipient_name", 150, None),
]


def _json_body():
    # Solo JSON, como en auth.py: un formulario de otra web no puede mandarlo.
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise APIException("Faltan los datos de la petición.", status_code=400)
    return data


def _invalid(errors):
    raise APIException(INVALID_DATA, status_code=400, payload={"errors": errors})


def address_json(address):
    """Dirección con las mismas claves que el formulario de /pago. También la usa
    checkout.py para rellenar el pago (4.4) y guardar la dirección."""
    if address is None:
        return None
    return {
        "recipient_name": address.recipient_name,
        "recipient_phone": address.recipient_phone,
        "street": address.street,
        "exterior_number": address.exterior_number,
        "interior_number": address.interior_number,
        "neighborhood": address.neighborhood,
        "postal_code": address.postal_code,
        "municipality": address.municipality,
        "state": address.state,
        "references": address.delivery_references,
    }


def _account_json(user):
    # Sin id, rol ni hash: la pantalla no los necesita.
    return {
        "user": {
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "phone": user.phone,
        },
        "address": address_json(user.address),
    }


def validate_address(data):
    """Devuelve la dirección limpia (claves de la API) o un dict de errores.
    Quién recibe: con nombre, también su teléfono; sin nombre, recibe la
    titular y el teléfono se ignora (la base exige los dos o ninguno)."""
    errors = {}
    fields = {key: _text(data, key, max_length, message, errors)
              for key, max_length, message in ADDRESS_TEXT_FIELDS}
    fields["postal_code"] = _digits(data, "postal_code", 5, "Escribe un código postal de 5 dígitos.", errors)
    state = data.get("state")
    if state not in MEXICAN_STATES:
        errors["state"] = "Elige el estado."
    fields["state"] = state
    if fields["recipient_name"]:
        fields["recipient_phone"] = _digits(
            data, "recipient_phone", 10, "Escribe un teléfono de 10 dígitos.", errors
        )
    else:
        fields["recipient_phone"] = None
    return fields, errors


def save_address(user, fields):
    """Crea o actualiza la única dirección de la cuenta (no hace commit)."""
    address = user.address or Address(user_id=user.id)
    address.recipient_name = fields["recipient_name"]
    address.recipient_phone = fields["recipient_phone"]
    address.street = fields["street"]
    address.exterior_number = fields["exterior_number"]
    address.interior_number = fields["interior_number"]
    address.neighborhood = fields["neighborhood"]
    address.postal_code = fields["postal_code"]
    address.municipality = fields["municipality"]
    address.state = fields["state"]
    address.delivery_references = fields["references"]
    if user.address is None:
        user.address = address
    return address


# ---------- Rutas ----------

@account.route("/account", methods=["GET"])
@customer_required
def get_account():
    return jsonify(_account_json(current_user)), 200


@account.route("/account/profile", methods=["PUT"])
@customer_required
def update_profile():
    data = _json_body()
    errors = {}
    first_name = _text(data, "first_name", 80, "Escribe tu nombre.", errors)
    last_name = _text(data, "last_name", 80, "Escribe tus apellidos.", errors)
    phone = _digits(data, "phone", 10, "El teléfono debe tener 10 dígitos.", errors, required=False)
    if errors:
        _invalid(errors)

    current_user.first_name = first_name
    current_user.last_name = last_name
    current_user.phone = phone
    db.session.commit()
    return jsonify({**_account_json(current_user), "message": "Guardamos tus datos."}), 200


@account.route("/account/address", methods=["PUT"])
@customer_required
def update_address():
    fields, errors = validate_address(_json_body())
    if errors:
        _invalid(errors)
    save_address(current_user, fields)
    db.session.commit()
    return jsonify({**_account_json(current_user), "message": "Guardamos tu dirección."}), 200


@account.route("/account/address", methods=["DELETE"])
@customer_required
def delete_address():
    if current_user.address is not None:
        db.session.delete(current_user.address)
        db.session.commit()
        db.session.refresh(current_user)
    return jsonify({**_account_json(current_user), "message": "Quitamos tu dirección."}), 200


@account.route("/account/password", methods=["POST"])
# Por IP y contando todos los intentos: con una sesión robada, frena a quien
# pruebe muchas contraseñas actuales para quedarse con la cuenta.
@limiter.limit("10 per 15 minutes")
@customer_required
def change_password():
    data = _json_body()
    current = data.get("current_password") if isinstance(data.get("current_password"), str) else ""
    new = data.get("new_password") if isinstance(data.get("new_password"), str) else ""

    # 400 y no 401: un 401 haría creer a la pantalla que se cerró la sesión.
    if not current or len(current) > MAX_LENGTH or not verify_password(current_user.password_hash, current):
        _invalid({"current_password": "La contraseña actual no es correcta."})
    problem = password_problem(new, CUSTOMER_MIN_LENGTH, email=current_user.email)
    if not problem and new == current:
        problem = "La contraseña nueva tiene que ser distinta de la actual."
    if problem:
        _invalid({"new_password": problem})

    current_user.password_hash = hash_password(new)
    # Un enlace de recuperación pendiente ya no debe servir.
    db.session.execute(
        update(PasswordResetToken)
        .where(PasswordResetToken.user_id == current_user.id, PasswordResetToken.used_at.is_(None))
        .values(used_at=datetime.now(timezone.utc))
    )
    db.session.commit()

    # La cookie anterior lleva la huella del hash viejo y ya no vale: esta
    # sesión sigue con una nueva; las demás se cierran.
    response = jsonify({"message": "Contraseña actualizada. Cerramos tu sesión en los demás dispositivos."})
    set_access_cookies(response, create_access_token(identity=current_user))
    return response, 200
