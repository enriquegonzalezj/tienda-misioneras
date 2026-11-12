"""
Pago como invitada o con cuenta (tareas 4.2 y 4.4) con reserva de existencias
(tarea 4.5).

  GET  /api/checkout/options   paqueterías activas y estados, para el formulario
  POST /api/checkout           crea el pedido pendiente y aparta las unidades
  GET  /api/orders/<token>     resumen del pedido para /pedido/<token>

Reglas (CLAUDE.md, Seguridad y Existencias):
- Precios, envío y total se calculan aquí, desde la base. Del navegador solo se
  usan el id de cada variante, la cantidad y el total que veía, que sirve para
  no cobrar algo distinto de lo que se mostró: si no coincide, no se crea nada.
- Las unidades se apartan con las filas bloqueadas (FOR UPDATE) dentro de una
  transacción: o se aparta todo el pedido, o nada. Nunca se dice cuántas quedan.
- Orden de bloqueo: primero pedidos y después variantes de menor a mayor id,
  igual que reservations.py y el formulario de producto. Así dos compras a la
  vez nunca se esperan mutuamente (deadlock).
- La reserva dura RESERVATION_MINUTES. Si vence sin pago, reservations.py
  cancela el pedido y devuelve las unidades.
- El pedido se consulta solo con su access_token (secrets.token_urlsafe(32)),
  nunca con el id. La respuesta nunca lleva SKU, costo ni ids internos.
- Con sesión de cliente (4.4) el pedido queda enlazado a la cuenta (user_id) y
  lleva el correo de la cuenta: si llega otro, 400 (así el límite por correo,
  que cuenta el correo recibido, no se salta). Con save_address, la dirección
  del pedido se guarda en la cuenta en la misma transacción. Sin sesión, con
  sesión de administración o con una sesión vencida, el pedido es de invitada.

Pendiente: precios de campaña (4.8) y Mercado Pago (4.6).
"""
import re
import secrets
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_current_user, verify_jwt_in_request
from flask_jwt_extended.exceptions import JWTExtendedException
from jwt.exceptions import PyJWTError
from sqlalchemy import select, update
from sqlalchemy.orm import selectinload

from api.cart import _read_items
from api.catalog import _complete_variants
from api.limiter import email_key, limiter
from api.models import Order, OrderItem, Product, ProductOption, ProductVariant, ShippingMethod, User, db
from api.reservations import EXPIRED_REASON, release_expired_reservations
from api.utils import APIException

checkout = Blueprint("checkout", __name__)

RESERVATION_MINUTES = 30  # el mismo límite irá en la preferencia de Mercado Pago (4.6)
REPLACED_REASON = "Reemplazado por un pedido nuevo"
INVALID_DATA = "Revisa los datos marcados."

# Los 32 estados de México, en el orden en que se muestran.
MEXICAN_STATES = [
    "Aguascalientes", "Baja California", "Baja California Sur", "Campeche", "Chiapas",
    "Chihuahua", "Ciudad de México", "Coahuila", "Colima", "Durango", "Estado de México",
    "Guanajuato", "Guerrero", "Hidalgo", "Jalisco", "Michoacán", "Morelos", "Nayarit",
    "Nuevo León", "Oaxaca", "Puebla", "Querétaro", "Quintana Roo", "San Luis Potosí",
    "Sinaloa", "Sonora", "Tabasco", "Tamaulipas", "Tlaxcala", "Veracruz", "Yucatán", "Zacatecas",
]

# Campos de texto: (clave, largo máximo como en models.py, mensaje si falta o
# None si es opcional).
TEXT_FIELDS = [
    ("first_name", 80, "Escribe tu nombre."),
    ("last_name", 80, "Escribe tus apellidos."),
    ("street", 150, "Escribe la calle."),
    ("exterior_number", 20, "Escribe el número exterior."),
    ("interior_number", 20, None),
    ("neighborhood", 100, "Escribe la colonia."),
    ("municipality", 100, "Escribe el municipio o la alcaldía."),
    ("references", 255, None),
    ("recipient_name", 150, None),
]
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
TOKEN_MAX = 64  # el largo de la columna access_token


def order_created(response):
    """Solo cuentan los pedidos creados (los que apartan unidades): un
    formulario con errores no gasta intentos."""
    return response.status_code == 201


def _folio(order):
    return f"MHP-{order.id:06d}"


def _money(value):
    # Texto, no número: así no se pierden centavos al pasar por JavaScript.
    return f"{value:.2f}"


def _shipping_json(method):
    return {
        "id": method.id,
        "name": method.name,
        "delivery_time": method.delivery_time,
        "price": _money(method.price),
    }


def _active_shipping_methods():
    return list(db.session.scalars(
        select(ShippingMethod)
        .where(ShippingMethod.is_active.is_(True))
        .order_by(ShippingMethod.position, ShippingMethod.id)
    ))


# ---------------------------------------------------------------------------
# Validación del formulario
# ---------------------------------------------------------------------------

def _text(data, key, max_length, required_message, errors):
    value = data.get(key)
    if value is None:
        value = ""
    if not isinstance(value, str):
        errors[key] = "Este dato no es válido."
        return None
    value = " ".join(value.split())  # sin espacios de más, ni saltos de línea
    if not value:
        if required_message:
            errors[key] = required_message
        return None
    if len(value) > max_length:
        errors[key] = f"Usa como máximo {max_length} caracteres."
        return None
    return value


def _digits(data, key, length, message, errors, required=True):
    """Teléfono o código postal: solo los dígitos (se aceptan espacios, guiones
    o paréntesis al escribir). Un teléfono con +52 delante también vale."""
    value = data.get(key)
    if value in (None, "") and not required:
        return None
    if not isinstance(value, str):
        errors[key] = message
        return None
    digits = re.sub(r"[\s\-().+]", "", value)
    if length == 10 and len(digits) == 12 and digits.startswith("52"):
        digits = digits[2:]
    if not digits and not required:
        return None
    if not digits.isdigit() or len(digits) != length:
        errors[key] = message
        return None
    return digits


def _validate(data):
    """Datos de contacto, dirección, paquetería y aviso. Devuelve los datos
    limpios o lanza 400 con los errores por campo."""
    errors = {}
    fields = {key: _text(data, key, max_length, message, errors) for key, max_length, message in TEXT_FIELDS}

    email = data.get("email")
    email = email.strip().lower() if isinstance(email, str) else ""
    if not email:
        errors["email"] = "Escribe tu correo."
    elif len(email) > 254 or not EMAIL_PATTERN.match(email):
        errors["email"] = "Revisa el correo: debe ser como nombre@ejemplo.com."
    fields["email"] = email

    fields["phone"] = _digits(data, "phone", 10, "Escribe un teléfono de 10 dígitos.", errors)
    fields["postal_code"] = _digits(data, "postal_code", 5, "Escribe un código postal de 5 dígitos.", errors)

    state = data.get("state")
    if state not in MEXICAN_STATES:
        errors["state"] = "Elige el estado."
    fields["state"] = state

    # Quién recibe: si se escribe un nombre, también su teléfono. Sin nombre,
    # recibe quien compra (con su teléfono).
    fields["recipient_phone"] = _digits(
        data, "recipient_phone", 10, "Escribe un teléfono de 10 dígitos.", errors,
        required=bool(fields["recipient_name"]),
    )
    if fields["first_name"] and fields["last_name"] and not fields["recipient_name"]:
        if len(fields["first_name"]) + 1 + len(fields["last_name"]) > 150:
            errors["last_name"] = "Nombre y apellidos juntos pueden tener hasta 149 caracteres."

    method_id = data.get("shipping_method_id")
    if isinstance(method_id, bool) or not isinstance(method_id, int):
        errors["shipping_method_id"] = "Elige cómo quieres recibir tu pedido."
    fields["shipping_method_id"] = method_id

    if data.get("privacy_accepted") is not True:
        errors["privacy_accepted"] = "Para continuar, acepta el aviso de privacidad."

    if errors:
        raise APIException(INVALID_DATA, status_code=400, payload={"errors": errors})
    return fields


def _expected_total(data):
    raw = data.get("expected_total")
    try:
        value = Decimal(raw) if isinstance(raw, str) else None
    except InvalidOperation:
        value = None
    if value is None or not value.is_finite() or value < 0:
        raise APIException("Falta el total que se mostró. Recarga la página.", status_code=400)
    return value.quantize(Decimal("0.01"))


def _previous_token(data):
    token = data.get("previous_token")
    if isinstance(token, str) and 0 < len(token) <= TOKEN_MAX:
        return token
    return None


def _session_customer():
    """La cuenta de cliente con sesión, o None. Pagar nunca exige sesión: una
    cookie vencida, sin CSRF o de una cuenta cuya contraseña cambió no debe
    impedir la compra; el pedido sale como de invitada."""
    try:
        if verify_jwt_in_request(optional=True) is None:
            return None  # sin cookie de sesión
    except (JWTExtendedException, PyJWTError):
        return None
    # get_current_user y no current_user: current_user es un intermediario
    # (proxy) que nunca es None aunque no haya cuenta detrás.
    user = get_current_user()
    if user is None or user.role != "customer":
        return None
    return user


def _address_fields(fields):
    """Los datos de la dirección del pedido, con las claves de account.py.
    Sin nombre de quien recibe, lo recibe la titular (los dos vacíos)."""
    keys = ("street", "exterior_number", "interior_number", "neighborhood", "postal_code",
            "municipality", "state", "references", "recipient_name")
    address = {key: fields[key] for key in keys}
    address["recipient_phone"] = fields["recipient_phone"] if fields["recipient_name"] else None
    return address


def _variant_label(product, values):
    """"Beige / M" en el orden de las opciones. Vacío si no tiene opciones."""
    return " / ".join(value.value for _option, value in zip(product.options, values)) or None


# ---------------------------------------------------------------------------
# Rutas
# ---------------------------------------------------------------------------

@checkout.route("/checkout/options", methods=["GET"])
def checkout_options():
    """Lo que el formulario necesita: paqueterías activas, en su orden, y estados."""
    return jsonify({
        "shipping_methods": [_shipping_json(m) for m in _active_shipping_methods()],
        "states": MEXICAN_STATES,
        "reservation_minutes": RESERVATION_MINUTES,
    })


@checkout.route("/checkout", methods=["POST"])
@limiter.limit("10 per hour", deduct_when=order_created)
@limiter.limit("5 per hour", key_func=email_key, deduct_when=order_created)
def create_order():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise APIException("Faltan los datos de la petición.", status_code=400)
    quantities = _read_items()  # mismas reglas que el carrito (1 a 99, 50 líneas)
    if not quantities:
        raise APIException("Tu carrito está vacío.", status_code=400)
    fields = _validate(data)
    expected_total = _expected_total(data)
    previous_token = _previous_token(data)
    customer = _session_customer()
    if customer is not None and fields["email"] != customer.email:
        # La pantalla manda el correo de la cuenta, fijo. Otro correo es un error
        # (o alguien intentando saltarse el límite por correo).
        raise APIException(INVALID_DATA, status_code=400, payload={
            "errors": {"email": "Con tu cuenta, el pedido usa el correo de tu cuenta."}
        })
    save_address = customer is not None and data.get("save_address") is True

    # 1. Reservas vencidas fuera (tiene su propia transacción).
    release_expired_reservations()

    # 2. Pedido pendiente anterior de esta misma persona (el navegador guarda su
    #    token): se cancela para no apartar dos veces las mismas unidades. Se
    #    bloquea primero (pedidos antes que variantes); sus unidades se
    #    devuelven en el paso 3, con las variantes ya bloqueadas en orden.
    returned = {}
    previous = None
    if previous_token:
        previous = db.session.scalar(
            select(Order)
            .where(Order.access_token == previous_token, Order.status == "pending")
            .with_for_update()
        )
        if previous is not None:
            for item in previous.items:
                returned[item.variant_id] = returned.get(item.variant_id, 0) + item.quantity

    # 3. Bloquear las variantes (las del carrito y las que se devuelven), de
    #    menor a mayor id. populate_existing: leer las existencias de este
    #    momento aunque algo ya estuviera cargado.
    ids = sorted(set(quantities) | set(returned))
    variants = {
        v.id: v
        for v in db.session.scalars(
            select(ProductVariant)
            .where(ProductVariant.id.in_(ids))
            .order_by(ProductVariant.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    }
    for variant_id, quantity in returned.items():
        if variant_id in variants:
            variants[variant_id].stock += quantity
    if previous is not None:
        previous.status = "cancelled"
        previous.cancel_reason = REPLACED_REASON

    # Datos del producto para comprobar que se sigue vendiendo (sin bloquear).
    products = {
        p.id: p
        for p in db.session.scalars(
            select(Product)
            .where(Product.id.in_({variants[i].product_id for i in quantities if i in variants}))
            .options(
                selectinload(Product.options).selectinload(ProductOption.values),
                selectinload(Product.variants).selectinload(ProductVariant.option_values),
            )
        )
    }

    # 4. ¿Se sigue vendiendo cada variante? Las mismas reglas que el carrito.
    lines = []
    removed = []
    for variant_id, quantity in quantities.items():
        variant = variants.get(variant_id)
        product = products.get(variant.product_id) if variant else None
        values = None
        if product is not None and product.is_active:
            values = next((vals for v, vals in _complete_variants(product) if v.id == variant_id), None)
        if values is None:
            removed.append(variant_id)
        else:
            lines.append((variant, product, values, quantity))
    if removed:
        db.session.rollback()
        raise APIException(
            "Algunos productos de tu carrito ya no están disponibles. Revisa tu carrito.",
            status_code=409,
            payload={"code": "unavailable", "removed": removed},
        )

    # 5. ¿Alcanzan las unidades? Nunca se dice cuántas quedan.
    short = [(variant, product, values) for variant, product, values, quantity in lines if variant.stock < quantity]
    if short:
        db.session.rollback()
        variant, product, values = short[0]
        label = _variant_label(product, values)
        name = f"{product.name} ({label})" if label else product.name
        message = f"No hay suficientes unidades de {name}."
        if len(short) > 1:
            message = f"No hay suficientes unidades de {len(short)} productos de tu carrito."
        raise APIException(
            f"{message} Ajusta la cantidad en tu carrito.",
            status_code=409,
            payload={"code": "insufficient", "insufficient": [v.id for v, _p, _vals in short]},
        )

    # 6. Paquetería (activa) y total, siempre desde la base.
    method = db.session.get(ShippingMethod, fields["shipping_method_id"])
    if method is None or not method.is_active:
        db.session.rollback()
        raise APIException(
            "La paquetería que elegiste ya no está disponible. Elige otra.",
            status_code=409,
            payload={
                "code": "shipping_unavailable",
                "errors": {"shipping_method_id": "Ya no está disponible: elige otra."},
                "shipping_methods": [_shipping_json(m) for m in _active_shipping_methods()],
            },
        )
    # Pendiente 4.8: precio con campaña. Hasta entonces se cobra el precio normal.
    subtotal = sum((variant.price * quantity for variant, _p, _v, quantity in lines), Decimal("0"))
    total = subtotal + method.price
    if total != expected_total:
        db.session.rollback()
        raise APIException(
            f"El total cambió: ahora es ${_money(total)}. Revisa el resumen antes de continuar.",
            status_code=409,
            payload={"code": "total_changed", "total": _money(total)},
        )

    # 7. Apartar las unidades y crear el pedido. Con las filas bloqueadas, la
    #    resta es segura; el CHECK stock >= 0 de la base es la última defensa.
    for variant, _product, _values, quantity in lines:
        variant.stock -= quantity

    now = datetime.now(timezone.utc)
    full_name = f"{fields['first_name']} {fields['last_name']}"
    order = Order(
        access_token=secrets.token_urlsafe(32),
        status="pending",
        user_id=customer.id if customer is not None else None,
        first_name=fields["first_name"],
        last_name=fields["last_name"],
        email=fields["email"],
        phone=fields["phone"],
        privacy_accepted_at=now,
        shipping_recipient_name=fields["recipient_name"] or full_name,
        shipping_phone=fields["recipient_phone"] or fields["phone"],
        shipping_street=fields["street"],
        shipping_exterior_number=fields["exterior_number"],
        shipping_interior_number=fields["interior_number"],
        shipping_neighborhood=fields["neighborhood"],
        shipping_postal_code=fields["postal_code"],
        shipping_municipality=fields["municipality"],
        shipping_state=fields["state"],
        shipping_references=fields["references"],
        shipping_method_id=method.id,
        shipping_method_name=method.name,
        subtotal=subtotal,
        discount_amount=Decimal("0"),
        shipping_cost=method.price,
        shipping_discount_amount=Decimal("0"),
        total=total,
        reserved_until=now + timedelta(minutes=RESERVATION_MINUTES),
    )
    for variant, product, values, quantity in lines:
        order.items.append(OrderItem(
            variant_id=variant.id,
            product_name=product.name,
            variant_label=_variant_label(product, values),
            sku=variant.sku,
            list_unit_price=variant.price,
            unit_price=variant.price,
            unit_cost=variant.cost,
            quantity=quantity,
        ))
    db.session.add(order)
    if save_address:
        # Importado aquí: account.py ya importa de este archivo (validaciones y
        # estados) y al revés sería una importación circular.
        from api.account import save_address as save_account_address
        save_account_address(customer, _address_fields(fields))
    db.session.commit()

    return jsonify({
        "access_token": order.access_token,
        "folio": _folio(order),
        "reserved_until": order.reserved_until.isoformat(),
    }), 201


@checkout.route("/orders/<token>", methods=["GET"])
@limiter.limit("60 per minute")
def get_order(token):
    """Resumen del pedido para quien tiene el enlace. Mismo 404 si el token no
    existe o tiene un formato raro: no se revela nada."""
    if len(token) > TOKEN_MAX:
        raise APIException("Pedido no encontrado.", status_code=404)
    release_expired_reservations()  # un pedido vencido sale ya cancelado
    order = db.session.scalar(
        select(Order).where(Order.access_token == token).options(selectinload(Order.items))
    )
    if order is None:
        raise APIException("Pedido no encontrado.", status_code=404)
    # Para ofrecer crear la cuenta (4.4): "linked" si el pedido ya es de una
    # cuenta, "exists" si su correo ya tiene cuenta (se ofrece entrar) y
    # "available" si se puede crear. Solo lo ve quien tiene el enlace, que es
    # quien escribió ese correo; el registro ya avisa lo mismo con su 409.
    if order.user_id is not None:
        account_status = "linked"
    elif db.session.scalar(select(User.id).where(User.email == order.email)) is not None:
        account_status = "exists"
    else:
        account_status = "available"
    return jsonify({
        "folio": _folio(order),
        "account_status": account_status,
        "status": order.status,
        # Solo si se canceló porque venció el tiempo para pagar.
        "expired": order.status == "cancelled" and order.cancel_reason == EXPIRED_REASON,
        # Solo si se canceló porque la misma persona hizo un pedido nuevo.
        "replaced": order.status == "cancelled" and order.cancel_reason == REPLACED_REASON,
        "created_at": order.created_at.isoformat(),
        "reserved_until": order.reserved_until.isoformat() if order.status == "pending" and order.reserved_until else None,
        "items": [
            {
                "name": item.product_name,
                "variant_label": item.variant_label,
                "quantity": item.quantity,
                "list_unit_price": _money(item.list_unit_price),
                "unit_price": _money(item.unit_price),
                "line_total": _money(item.unit_price * item.quantity),
            }
            for item in order.items
        ],
        "subtotal": _money(order.subtotal),
        "discount_amount": _money(order.discount_amount),
        "shipping": {
            "method": order.shipping_method_name,
            "cost": _money(order.shipping_cost),
            "discount": _money(order.shipping_discount_amount),
        },
        "total": _money(order.total),
        "contact": {
            "first_name": order.first_name,
            "last_name": order.last_name,
            "email": order.email,
            "phone": order.phone,
        },
        "shipping_address": {
            "recipient_name": order.shipping_recipient_name,
            "phone": order.shipping_phone,
            "street": order.shipping_street,
            "exterior_number": order.shipping_exterior_number,
            "interior_number": order.shipping_interior_number,
            "neighborhood": order.shipping_neighborhood,
            "postal_code": order.shipping_postal_code,
            "municipality": order.shipping_municipality,
            "state": order.shipping_state,
            "references": order.shipping_references,
        },
    })
