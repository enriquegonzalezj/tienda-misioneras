"""
Catálogo público: categorías y productos para Inicio y Tienda (tarea 3.2) y la
ficha de un producto (tarea 3.4). Solo lectura y sin sesión. Nunca devuelve el costo, las existencias exactas,
ids internos ni productos ocultos (ver CLAUDE.md, Seguridad).
"""
from cloudinary.utils import cloudinary_url
from flask import Blueprint, jsonify, request
from sqlalchemy import exists, func, select
from sqlalchemy.orm import selectinload

from api.models import Category, Product, ProductImage, ProductOption, ProductVariant, db
from api.utils import APIException

catalog = Blueprint("catalog", __name__)

DEFAULT_LIMIT = 12  # la maqueta de Tienda muestra 12 en escritorio
MAX_LIMIT = 24
MAX_OFFSET = 10_000  # evita consultas absurdas; la tienda tendrá unos 100 productos
CARD_IMAGE_WIDTH = 600  # ancho de la foto en tarjetas; Cloudinary la reduce y elige formato
DETAIL_IMAGE_WIDTH = 1200  # foto grande de la ficha (unos 600 px en pantalla, nítida en retina)
THUMB_IMAGE_WIDTH = 240  # miniaturas de la ficha (unos 120 px en pantalla)


# ---------------------------------------------------------------------------
# Qué producto se puede ver
# ---------------------------------------------------------------------------

def _visible_conditions():
    """Un producto se ve si está activo y tiene al menos una variante activa.
    Sin variantes activas no hay precio que mostrar, así que no sale."""
    has_active_variant = exists().where(
        ProductVariant.product_id == Product.id,
        ProductVariant.is_active.is_(True),
    )
    return [Product.is_active.is_(True), has_active_variant]


# ---------------------------------------------------------------------------
# Imágenes
# ---------------------------------------------------------------------------

def _image_url(public_id, width):
    """URL de Cloudinary con formato y calidad automáticos (f_auto, q_auto) y
    ancho máximo fijo. En la base solo se guarda el public_id, nunca la URL."""
    url, _options = cloudinary_url(
        public_id,
        secure=True,
        fetch_format="auto",
        quality="auto",
        crop="limit",
        width=width,
    )
    return url


def _image(public_id, alt):
    """Foto de tarjeta (Inicio y Tienda)."""
    return {"url": _image_url(public_id, CARD_IMAGE_WIDTH), "alt": alt}


def _detail_image(image):
    """Foto de la ficha: la grande y su miniatura, con el mismo texto alternativo."""
    return {
        "url": _image_url(image.public_id, DETAIL_IMAGE_WIDTH),
        "thumb_url": _image_url(image.public_id, THUMB_IMAGE_WIDTH),
        "alt": image.alt_text,
    }


def _first_product_image(product):
    # product.images ya viene ordenado por sort_order (ver models.py).
    if not product.images:
        return None
    first = product.images[0]
    return _image(first.public_id, first.alt_text)


# ---------------------------------------------------------------------------
# Texto de la tarjeta ("2 colores · 3 tallas")
# ---------------------------------------------------------------------------

def _plural(name):
    """Plural en minúsculas del nombre de una opción: Color -> colores,
    Talla -> tallas, Diseño -> diseños, Edición -> ediciones.
    Si son varias palabras, solo la primera: Tipo de papel -> tipos de papel.
    Los casos raros se resuelven con card_subtitle desde el panel."""
    first, _, rest = name.strip().lower().partition(" ")
    if first.endswith("ión"):
        first = first[:-3] + "iones"
    elif first.endswith("z"):
        first = first[:-1] + "ces"
    elif first[-1:] in "aeiouáéó":
        first += "s"
    else:
        first += "es"
    return f"{first} {rest}".strip()


def _value_in_phrase(value):
    """'Negro' -> 'negro' para escribir "Color negro"; 'G' y 'EG' se quedan igual."""
    if len(value) > 1 and value[1:].islower():
        return value[0].lower() + value[1:]
    return value


def _computed_subtitle(product, active_variants):
    """Resumen de opciones con los valores que de verdad se venden
    (los de variantes activas), en el orden de las opciones."""
    parts = []
    for option in product.options:
        values = {
            value.value
            for variant in active_variants
            for value in variant.option_values
            if value.option_id == option.id
        }
        if len(values) == 1:
            parts.append(f"{option.name} {_value_in_phrase(next(iter(values)))}")
        elif len(values) > 1:
            parts.append(f"{len(values)} {_plural(option.name)}")
    return " · ".join(parts) or None


# ---------------------------------------------------------------------------
# Tarjeta de producto
# ---------------------------------------------------------------------------

def _product_card(product):
    active_variants = [v for v in product.variants if v.is_active]
    prices = {v.price for v in active_variants}
    return {
        "name": product.name,
        "slug": product.slug,
        "image": _first_product_image(product),
        "subtitle": product.card_subtitle or _computed_subtitle(product, active_variants),
        # Texto, no número: así no se pierden centavos al pasar por JavaScript.
        "price_min": f"{min(prices):.2f}",
        "price_varies": len(prices) > 1,
        # Precio con campaña: lo calcula la tarea 4.8. Hasta entonces, null.
        "sale_price_min": None,
        # Solo disponible o agotado, nunca la cantidad.
        # Pendiente 4.5: liberar reservas vencidas antes de calcular esto.
        "available": any(v.stock > 0 for v in active_variants),
    }


# ---------------------------------------------------------------------------
# Ficha de producto
# ---------------------------------------------------------------------------

def _category_ref(category):
    return {"name": category.name, "slug": category.slug}


def _complete_variants(product):
    """Variantes activas con un valor por cada opción del producto, y esos
    valores en el orden de las opciones. Una variante a medio configurar (le
    falta o le sobra un valor) no se puede elegir en la ficha, así que no sale.
    El panel (2.1) debe impedir que existan."""
    option_ids = [option.id for option in product.options]
    result = []
    for variant in product.variants:
        if not variant.is_active:
            continue
        by_option = {value.option_id: value for value in variant.option_values}
        if len(variant.option_values) != len(option_ids) or set(by_option) != set(option_ids):
            continue
        result.append((variant, [by_option[option_id] for option_id in option_ids]))
    return result


def _product_detail(product, variants):
    """Datos de la ficha. Cada variante se reconoce por sus valores
    (["Beige", "G"], en el orden de las opciones), sin ids ni SKU."""
    used_value_ids = {value.id for _variant, values in variants for value in values}
    category = product.category
    return {
        "name": product.name,
        "slug": product.slug,
        "subtitle": product.subtitle,
        # Texto plano: el frontend lo muestra como texto, nunca como HTML.
        "description": product.description,
        "category": _category_ref(category),
        "parent_category": _category_ref(category.parent) if category.parent else None,
        "images": [_detail_image(image) for image in product.images],
        # Solo los valores que tiene alguna variante activa, en su orden (M, G, EG).
        "options": [
            {
                "name": option.name,
                "values": [
                    {"value": value.value, "swatch_hex": value.swatch_hex}
                    for value in option.values
                    if value.id in used_value_ids
                ],
            }
            for option in product.options
        ],
        "variants": [
            {
                "values": [value.value for value in values],
                # Texto, no número: así no se pierden centavos al pasar por JavaScript.
                "price": f"{variant.price:.2f}",
                # Precio con campaña: lo calcula la tarea 4.8. Hasta entonces, null.
                "sale_price": None,
                # Solo disponible o agotado, nunca la cantidad.
                # Pendiente 4.5: liberar reservas vencidas antes de calcular esto.
                "available": variant.stock > 0,
            }
            for variant, values in variants
        ],
        "available": any(variant.stock > 0 for variant, _values in variants),
    }


# ---------------------------------------------------------------------------
# Lectura de parámetros
# ---------------------------------------------------------------------------

def _int_param(name, default, minimum, maximum):
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        value = None
    if value is None or not minimum <= value <= maximum:
        raise APIException(f"{name} debe ser un número entero entre {minimum} y {maximum}", 400)
    return value


# ---------------------------------------------------------------------------
# Rutas
# ---------------------------------------------------------------------------

@catalog.route("/categories", methods=["GET"])
def list_categories():
    """Árbol de categorías con productos visibles. Una categoría principal cuenta
    también los productos de sus subcategorías. Las vacías no salen."""
    counts = dict(
        db.session.execute(
            select(Product.category_id, func.count(Product.id))
            .where(*_visible_conditions())
            .group_by(Product.category_id)
        ).all()
    )

    categories = db.session.scalars(
        select(Category).order_by(Category.sort_order, Category.name)
    ).all()
    children_of = {}
    for category in categories:
        if category.parent_id is not None:
            children_of.setdefault(category.parent_id, []).append(category)

    result = []
    total = 0
    for category in categories:
        if category.parent_id is not None:
            continue
        children = []
        for child in children_of.get(category.id, []):
            child_count = counts.get(child.id, 0)
            if child_count:
                children.append({"name": child.name, "slug": child.slug, "product_count": child_count})
        product_count = counts.get(category.id, 0) + sum(c["product_count"] for c in children)
        if not product_count:
            continue
        total += product_count

        if category.image_public_id:
            image = _image(category.image_public_id, category.name)
        else:
            # Sin imagen propia: la del producto visible más reciente que tenga foto.
            ids = [category.id] + [c.id for c in children_of.get(category.id, [])]
            first = db.session.scalars(
                select(ProductImage)
                .join(Product, ProductImage.product_id == Product.id)
                .where(Product.category_id.in_(ids), *_visible_conditions())
                .order_by(Product.created_at.desc(), Product.id.desc(), ProductImage.sort_order)
                .limit(1)
            ).first()
            image = _image(first.public_id, first.alt_text) if first else None

        result.append({
            "name": category.name,
            "slug": category.slug,
            "card_text": category.card_text,
            "image": image,
            "product_count": product_count,
            "children": children,
        })

    return jsonify({"total_products": total, "categories": result}), 200


@catalog.route("/products", methods=["GET"])
def list_products():
    """Productos visibles, los más recientes primero.
    Parámetros opcionales: category (slug; incluye subcategorías),
    featured=true (destacados, para Inicio), limit (1 a 24) y offset."""
    limit = _int_param("limit", DEFAULT_LIMIT, 1, MAX_LIMIT)
    offset = _int_param("offset", 0, 0, MAX_OFFSET)
    conditions = _visible_conditions()

    if request.args.get("featured", "").lower() in ("true", "1"):
        conditions.append(Product.is_featured.is_(True))

    slug = request.args.get("category", "").strip()
    if slug:
        category = db.session.scalar(select(Category).where(Category.slug == slug))
        if category is None:
            raise APIException("Categoría no encontrada", 404)
        ids = [category.id] + [child.id for child in category.children]
        conditions.append(Product.category_id.in_(ids))

    total = db.session.scalar(select(func.count(Product.id)).where(*conditions))
    products = db.session.scalars(
        select(Product)
        .where(*conditions)
        .order_by(Product.created_at.desc(), Product.id.desc())
        .limit(limit)
        .offset(offset)
        # Carga fotos, opciones y variantes en pocas consultas, no una por producto.
        .options(
            selectinload(Product.images),
            selectinload(Product.options),
            selectinload(Product.variants).selectinload(ProductVariant.option_values),
        )
    ).all()

    return jsonify({"total": total, "items": [_product_card(p) for p in products]}), 200


@catalog.route("/products/<slug>", methods=["GET"])
def get_product(slug):
    """Ficha de un producto visible. Si no existe, está oculto o no tiene
    variantes que se puedan elegir: 404 con el mismo mensaje en los tres casos,
    para no revelar qué productos ocultos existen."""
    product = db.session.scalars(
        select(Product)
        .where(Product.slug == slug, *_visible_conditions())
        .options(
            selectinload(Product.images),
            selectinload(Product.options).selectinload(ProductOption.values),
            selectinload(Product.variants).selectinload(ProductVariant.option_values),
            selectinload(Product.category).selectinload(Category.parent),
        )
    ).first()
    variants = _complete_variants(product) if product else []
    if not variants:
        raise APIException("Producto no encontrado", 404)
    return jsonify(_product_detail(product, variants)), 200
