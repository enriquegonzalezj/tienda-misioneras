"""
Paqueterías en el panel de administración (tarea 4.5): /admin/envios.

La congregación crea y cambia aquí las tarifas de envío. El pago (tarea 4.2)
ofrece solo las activas, en este orden. El pedido copia el nombre y el precio
del momento, así que cambiar una tarifa no altera los pedidos anteriores.

Todas las rutas llevan @admin_required (sesión de administración y, en POST, PUT
y DELETE, la cabecera X-CSRF-TOKEN). Cada cambio responde con la lista completa,
como Categorías, para que la pantalla se dibuje con lo que de verdad quedó.
"""
from flask import Blueprint, jsonify, request
from sqlalchemy import exists, func, select
from sqlalchemy.exc import IntegrityError

from api.auth import admin_required
from api.models import Order, ShippingMethod, db
from api.product_form import parse_cost
from api.utils import APIException

admin_shipping = Blueprint("admin_shipping", __name__)

# Los mismos límites que las columnas de models.py.
NAME_MAX = 100
DELIVERY_TIME_MAX = 60

INVALID_DATA = "Revisa los datos marcados."
PRICE_HELP = "Escribe un precio de 0 o más, con 2 decimales como máximo."


def _json_body():
    # Solo JSON, como en el resto del panel: un formulario de otra web no puede mandarlo.
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise APIException("Faltan los datos de la petición.", status_code=400)
    return data


def _text(data, field, max_length, errors, required_message=None):
    """Texto limpio o None si viene vacío. Anota en `errors` lo que no cumpla."""
    value = data.get(field)
    if value is None:
        value = ""
    if not isinstance(value, str):
        errors[field] = "Este dato no es válido."
        return None
    value = value.strip()
    if not value:
        if required_message:
            errors[field] = required_message
        return None
    if len(value) > max_length:
        errors[field] = f"Usa como máximo {max_length} caracteres."
        return None
    return value


def _method_or_404(method_id):
    method = db.session.get(ShippingMethod, method_id)
    if method is None:
        raise APIException("Paquetería no encontrada.", status_code=404)
    return method


def _ordered():
    return list(db.session.scalars(
        select(ShippingMethod).order_by(ShippingMethod.position, ShippingMethod.id)
    ))


def _used_ids():
    """Paqueterías que ya aparecen en algún pedido: no se pueden borrar."""
    return set(db.session.scalars(
        select(Order.shipping_method_id).where(Order.shipping_method_id.is_not(None)).distinct()
    ))


def _method_json(method, used):
    return {
        "id": method.id,
        "name": method.name,
        "delivery_time": method.delivery_time,
        "price": f"{method.price:.2f}",
        "is_active": method.is_active,
        "used": method.id in used,
    }


def _list_response(message=None, status=200):
    used = _used_ids()
    body = {"methods": [_method_json(m, used) for m in _ordered()]}
    if message:
        body["message"] = message
    return jsonify(body), status


def _commit():
    """Guarda. Si dos personas guardan a la vez el mismo nombre, la base lo
    impide (UNIQUE) y se avisa en lugar de dar un error 500."""
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        raise APIException(
            "No se pudo guardar porque otro cambio se hizo al mismo tiempo. Recarga la página e inténtalo de nuevo.",
            status_code=409,
        )


def _validated_fields(data, method=None):
    errors = {}
    name = _text(data, "name", NAME_MAX, errors, "Escribe el nombre.")
    if name:
        # Sin repetir, aunque cambien mayúsculas: al pagar se elige por nombre.
        query = select(ShippingMethod.id).where(func.lower(ShippingMethod.name) == name.lower())
        if method is not None:
            query = query.where(ShippingMethod.id != method.id)
        if db.session.scalar(query) is not None:
            errors["name"] = "Ya hay una paquetería con este nombre."
    delivery_time = _text(data, "delivery_time", DELIVERY_TIME_MAX, errors)
    # Como el costo de un producto: 0 o más (0 = envío gratis), 2 decimales.
    price = parse_cost(data.get("price"))
    if price is None:
        errors["price"] = PRICE_HELP
    is_active = data.get("is_active", True)
    if not isinstance(is_active, bool):
        errors["is_active"] = "Este dato no es válido."
    if errors:
        raise APIException(INVALID_DATA, status_code=400, payload={"errors": errors})
    return {"name": name, "delivery_time": delivery_time, "price": price, "is_active": is_active}


@admin_shipping.route("/shipping-methods", methods=["GET"])
@admin_required
def list_methods():
    return _list_response()


@admin_shipping.route("/shipping-methods", methods=["POST"])
@admin_required
def create_method():
    fields = _validated_fields(_json_body())
    position = max((m.position for m in _ordered()), default=-1) + 1
    method = ShippingMethod(**fields, position=position)
    db.session.add(method)
    _commit()
    return _list_response(f"Paquetería «{method.name}» creada.", 201)


@admin_shipping.route("/shipping-methods/<int:method_id>", methods=["PUT"])
@admin_required
def update_method(method_id):
    method = _method_or_404(method_id)
    for key, value in _validated_fields(_json_body(), method).items():
        setattr(method, key, value)
    _commit()
    return _list_response("Cambios guardados.")


@admin_shipping.route("/shipping-methods/<int:method_id>/move", methods=["POST"])
@admin_required
def move_method(method_id):
    """Sube o baja una posición (el orden en que se ofrecen al pagar)."""
    method = _method_or_404(method_id)
    direction = _json_body().get("direction")
    if direction not in ("up", "down"):
        raise APIException("Indica si sube o baja.", status_code=400)
    methods = _ordered()
    index = methods.index(method)
    target = index - 1 if direction == "up" else index + 1
    if target < 0 or target >= len(methods):
        message = "Ya está en primer lugar." if direction == "up" else "Ya está en último lugar."
        raise APIException(message, status_code=400)
    methods[index], methods[target] = methods[target], methods[index]
    # Se renumeran todas (0, 1, 2...) por si había posiciones repetidas.
    for position, item in enumerate(methods):
        item.position = position
    _commit()
    return _list_response()


@admin_shipping.route("/shipping-methods/<int:method_id>", methods=["DELETE"])
@admin_required
def delete_method(method_id):
    """Solo se borra si nunca se usó en un pedido; si no, se apaga. La base
    también lo impide (RESTRICT en orders.shipping_method_id)."""
    method = _method_or_404(method_id)
    if db.session.scalar(select(exists().where(Order.shipping_method_id == method.id))):
        raise APIException(
            "No se puede borrar: ya se usó en pedidos. Apágala para dejar de ofrecerla.",
            status_code=409,
        )
    name = method.name
    db.session.delete(method)
    _commit()
    return _list_response(f"Paquetería «{name}» borrada.")
