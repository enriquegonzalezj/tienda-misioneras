"""
Carrito (tarea 4.1). El carrito vive en el navegador y solo guarda el id de cada
variante y su cantidad. Esta ruta le pone nombre, foto, precio y disponibilidad
con los datos de la base, y calcula el subtotal: nunca se confía en precios que
mande el navegador (ver CLAUDE.md, Seguridad). Los precios con campaña (4.8)
salen de pricing.py, igual que en el pedido; con sesión de cliente, incluyen
también las campañas "Solo clientas con cuenta".

Sin exigir sesión y sin escribir nada en la base. No reserva existencias ni dice
cuántas quedan: eso lo hace el pago (tareas 4.5 y 4.2). Antes de leer las
existencias, libera las reservas vencidas (reservations.py).

La página de pago (/pago, tarea 4.2) manda además la paquetería elegida
(shipping_method_id) y recibe el envío y el total ya sumados: así el total que
se muestra y el expected_total que se manda a POST /api/checkout salen del
mismo cálculo del servidor, y el navegador nunca suma importes.
"""
from flask import Blueprint, jsonify, request
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from api.catalog import THUMB_IMAGE_WIDTH, _complete_variants, _image_url
from api.limiter import limiter
from api.models import Product, ProductOption, ProductVariant, ShippingMethod, db
from api.pricing import PriceBook, order_totals
from api.reservations import release_expired_reservations
from api.utils import APIException

cart = Blueprint("cart", __name__)

MAX_LINES = 50  # más que suficiente para unos 100 productos; frena peticiones enormes
MAX_QUANTITY = 99  # el mismo tope que la ficha: solo contra errores de dedo
MAX_VARIANT_ID = 2_147_483_647  # el mayor entero de PostgreSQL; más grande daría error en la base


def _positive_int(value, maximum):
    """Entero entre 1 y maximum. bool se rechaza aparte: en Python True es 1."""
    return isinstance(value, int) and not isinstance(value, bool) and 1 <= value <= maximum


def _read_items():
    """Lee {"items": [{"variant_id": 12, "quantity": 2}, ...]} y junta las
    líneas repetidas de una misma variante (sin pasar de 99)."""
    data = request.get_json(silent=True)
    items = data.get("items") if isinstance(data, dict) else None
    if not isinstance(items, list):
        raise APIException("El carrito no tiene un formato válido", 400)
    if len(items) > MAX_LINES:
        raise APIException(f"El carrito admite hasta {MAX_LINES} productos distintos", 400)

    quantities = {}
    for item in items:
        if not isinstance(item, dict):
            raise APIException("El carrito no tiene un formato válido", 400)
        variant_id = item.get("variant_id")
        quantity = item.get("quantity")
        if not _positive_int(variant_id, MAX_VARIANT_ID):
            raise APIException("El carrito no tiene un formato válido", 400)
        if not _positive_int(quantity, MAX_QUANTITY):
            raise APIException(f"Cada producto necesita una cantidad de 1 a {MAX_QUANTITY}", 400)
        quantities[variant_id] = min(quantities.get(variant_id, 0) + quantity, MAX_QUANTITY)
    return quantities


def _read_shipping_method_id():
    """shipping_method_id es opcional: el carrito no lo manda y /pago sí. Si
    llega, tiene que ser un id válido (entero positivo); si no, 400."""
    data = request.get_json(silent=True)
    value = data.get("shipping_method_id") if isinstance(data, dict) else None
    if value is None:
        return None
    if not _positive_int(value, MAX_VARIANT_ID):
        raise APIException("La paquetería no tiene un formato válido", 400)
    return value


def _shipping(method_id):
    """La paquetería elegida, si existe y está activa, o None. Una paquetería
    apagada o borrada no da error: /pago vuelve a pedir las opciones."""
    if method_id is None:
        return None
    method = db.session.get(ShippingMethod, method_id)
    if method is None or not method.is_active:
        return None
    return method


def _line(variant, values, quantity, book):
    product = variant.product
    first_image = product.images[0] if product.images else None
    available = variant.stock > 0
    unit_price, campaign = book.variant_price(variant)
    return {
        "variant_id": variant.id,
        "quantity": quantity,
        "name": product.name,
        "slug": product.slug,
        # La opción y su valor, en el orden de las opciones: Color Beige, Talla G.
        "values": [
            {"option": option.name, "value": value.value}
            for option, value in zip(product.options, values)
        ],
        "image": (
            {"url": _image_url(first_image.public_id, THUMB_IMAGE_WIDTH), "alt": first_image.alt_text}
            if first_image
            else None
        ),
        # Texto, no número: así no se pierden centavos al pasar por JavaScript.
        "price": f"{variant.price:.2f}",
        # Precio con campaña, o null si no tiene rebaja.
        "sale_price": f"{unit_price:.2f}" if campaign is not None else None,
        # Solo disponible o agotado, nunca la cantidad.
        # Las reservas vencidas ya se liberaron (release_expired_reservations).
        "available": available,
        "line_total": f"{unit_price * quantity:.2f}" if available else None,
        # La misma línea a precio normal (para tacharla si está rebajada).
        "list_line_total": f"{variant.price * quantity:.2f}" if available else None,
    }


@cart.route("/cart", methods=["POST"])
@limiter.limit("120 per minute")  # cada visita al carrito hace una petición; esto solo frena abusos
def quote_cart():
    """Responde las líneas que se pueden mostrar, en el orden en que llegaron,
    y en "removed" los ids que ya no existen, están ocultos o no se pueden elegir
    (el navegador los quita y avisa). Las agotadas salen marcadas y no suman.

    Importes (pricing.order_totals, el mismo cálculo que POST /api/checkout):
    "subtotal" a precio normal, "discount" (lo que rebajan las campañas) e
    "items_total" (subtotal - discount), solo de lo disponible.

    Con shipping_method_id (solo /pago): "shipping" con la paquetería, su
    precio y su descuento, y "total" = items_total + envío - descuento del
    envío. Sin él, o si la paquetería ya no está activa, los dos van en null;
    en ese segundo caso, además, "shipping_unavailable" es true."""
    quantities = _read_items()
    method_id = _read_shipping_method_id()
    found = {}
    if quantities:
        release_expired_reservations()  # "disponible" depende de las existencias (tarea 4.5)
        variants = db.session.scalars(
            select(ProductVariant)
            .where(ProductVariant.id.in_(quantities))
            .options(
                selectinload(ProductVariant.product).selectinload(Product.images),
                selectinload(ProductVariant.product)
                .selectinload(Product.options)
                .selectinload(ProductOption.values),
                selectinload(ProductVariant.product)
                .selectinload(Product.variants)
                .selectinload(ProductVariant.option_values),
            )
        ).all()
        for variant in variants:
            # Las mismas reglas que la ficha (GET /api/products/<slug>): producto
            # activo (un archivado nunca lo está) y variante activa con un valor por
            # cada opción. Si la variante es una de esas, el producto ya tiene una
            # variante activa, así que también es visible.
            if not variant.product.is_active:
                continue
            for complete, values in _complete_variants(variant.product):
                if complete.id == variant.id:
                    found[variant.id] = (variant, values)
                    break

    book = PriceBook.for_request()
    lines = []
    removed = []
    for variant_id, quantity in quantities.items():
        if variant_id in found:
            variant, values = found[variant_id]
            lines.append(_line(variant, values, quantity, book))
        else:
            removed.append(variant_id)

    # El mismo cálculo que POST /api/checkout, solo con lo disponible.
    method = _shipping(method_id)
    available = [(found[line["variant_id"]][0], line["quantity"]) for line in lines if line["available"]]
    totals = order_totals(book, available, method.price if method else None)
    return jsonify({
        "items": lines,
        "removed": removed,
        "subtotal": f"{totals.subtotal:.2f}",
        "discount": f"{totals.discount:.2f}",
        "items_total": f"{totals.items_total:.2f}",
        "shipping": (
            {
                "id": method.id,
                "name": method.name,
                "price": f"{method.price:.2f}",
                "discount": f"{totals.shipping_discount:.2f}",
            }
            if method
            else None
        ),
        "shipping_unavailable": method_id is not None and method is None,
        "total": f"{totals.total:.2f}" if totals.total is not None else None,
        # Artículos que se pueden comprar (para el número de la cabecera).
        "count": sum(line["quantity"] for line in lines if line["available"]),
    }), 200
