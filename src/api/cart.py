"""
Carrito (tarea 4.1). El carrito vive en el navegador y solo guarda el id de cada
variante y su cantidad. Esta ruta le pone nombre, foto, precio y disponibilidad
con los datos de la base, y calcula el subtotal: nunca se confía en precios que
mande el navegador (ver CLAUDE.md, Seguridad).

Sin sesión y sin escribir nada en la base. No reserva existencias ni dice
cuántas quedan: eso lo hace el pago (tareas 4.5 y 4.2).
"""
from decimal import Decimal

from flask import Blueprint, jsonify, request
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from api.catalog import THUMB_IMAGE_WIDTH, _complete_variants, _image_url
from api.limiter import limiter
from api.models import Product, ProductOption, ProductVariant, db
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


def _line(variant, values, quantity):
    product = variant.product
    first_image = product.images[0] if product.images else None
    available = variant.stock > 0
    # Pendiente 4.8: precio con campaña. Hasta entonces se cobra el precio normal.
    unit_price = variant.price
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
        "sale_price": None,
        # Solo disponible o agotado, nunca la cantidad.
        # Pendiente 4.5: liberar reservas vencidas antes de calcular esto.
        "available": available,
        "line_total": f"{unit_price * quantity:.2f}" if available else None,
    }


@cart.route("/cart", methods=["POST"])
@limiter.limit("120 per minute")  # cada visita al carrito hace una petición; esto solo frena abusos
def quote_cart():
    """Responde las líneas que se pueden mostrar, en el orden en que llegaron,
    y en "removed" los ids que ya no existen, están ocultos o no se pueden elegir
    (el navegador los quita y avisa). Las agotadas salen marcadas y no suman."""
    quantities = _read_items()
    found = {}
    if quantities:
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

    lines = []
    removed = []
    for variant_id, quantity in quantities.items():
        if variant_id in found:
            variant, values = found[variant_id]
            lines.append(_line(variant, values, quantity))
        else:
            removed.append(variant_id)

    subtotal = sum((Decimal(line["line_total"]) for line in lines if line["line_total"]), Decimal("0"))
    return jsonify({
        "items": lines,
        "removed": removed,
        "subtotal": f"{subtotal:.2f}",
        # Artículos que se pueden comprar (para el número de la cabecera).
        "count": sum(line["quantity"] for line in lines if line["available"]),
    }), 200
