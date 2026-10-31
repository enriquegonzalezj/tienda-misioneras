"""
Productos en el panel de administración (tarea 2.1, paso 5).

Paso 5a: la lista del Inventario y el guardado rápido de precio y existencias
desde ella. El paso 5b añade aquí crear, editar, borrar y archivar.

Todas las rutas llevan @admin_required (sesión de administración y, en POST,
PUT, PATCH y DELETE, la cabecera X-CSRF-TOKEN). A diferencia de la API pública
(catalog.py), aquí salen los productos ocultos y archivados, las existencias
exactas, el SKU y los ids: lo necesita quien administra. El costo de compra
solo sale en la ficha del producto del panel (paso 5b), no en la lista.

Estados de un producto en el panel:
  - archivado: archived_at con fecha (siempre oculto; la base lo garantiza);
  - visible: activo y con al menos una variante activa (lo mismo que la tienda);
  - oculto: el resto (nace así, o está activo pero sin variantes activas).
"""
from decimal import Decimal, InvalidOperation

from flask import Blueprint, jsonify, request
from sqlalchemy import and_, exists, func, not_, or_, select
from sqlalchemy.orm import selectinload

from api.auth import admin_required
from api.catalog import _image_url
from api.models import Category, Product, ProductVariant, db
from api.utils import APIException

admin_products = Blueprint("admin_products", __name__)

PAGE_SIZE = 25  # el diseño del Inventario pagina de 25 en 25
MAX_OFFSET = 10_000
SEARCH_MAX = 100
THUMB_WIDTH = 120  # miniatura de la fila (unos 48 px en pantalla)
MAX_VARIANT_CHANGES = 200  # cambios por guardado; de sobra para una pantalla de 25 productos
MAX_PRICE = Decimal("99999999.99")  # lo que cabe en Numeric(10, 2)
MAX_STOCK = 99_999

STATUSES = ("not_archived", "visible", "hidden", "archived", "all")


# ---------------------------------------------------------------------------
# Condiciones de estado (en SQL, para filtrar y contar sin traer todo)
# ---------------------------------------------------------------------------

def _has_active_variant():
    return exists().where(ProductVariant.product_id == Product.id, ProductVariant.is_active.is_(True))


def _has_sold_out_variant():
    """Alguna variante activa sin existencias. Las desactivadas no cuentan:
    no se venden, así que no "faltan"."""
    return exists().where(
        ProductVariant.product_id == Product.id,
        ProductVariant.is_active.is_(True),
        ProductVariant.stock <= 0,
    )


def _is_archived():
    return Product.archived_at.is_not(None)


def _is_visible():
    return and_(Product.archived_at.is_(None), Product.is_active.is_(True), _has_active_variant())


def _is_hidden():
    return and_(Product.archived_at.is_(None), not_(and_(Product.is_active.is_(True), _has_active_variant())))


def _status(product):
    if product.archived_at is not None:
        return "archived"
    if product.is_active and any(v.is_active for v in product.variants):
        return "visible"
    return "hidden"


# ---------------------------------------------------------------------------
# Lectura de parámetros
# ---------------------------------------------------------------------------

def _int_arg(name, default, minimum, maximum):
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        raise APIException(f"El parámetro {name} no es válido.", status_code=400)
    if not minimum <= value <= maximum:
        raise APIException(f"El parámetro {name} está fuera de rango.", status_code=400)
    return value


def _like_pattern(text):
    """Texto para buscar con ILIKE: %, _ y \\ se buscan tal cual."""
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _category_ids(category_id):
    """La categoría y sus subcategorías (filtrar por "Papelería" incluye sus libretas)."""
    category = db.session.get(Category, category_id)
    if category is None:
        raise APIException("Categoría no encontrada.", status_code=404)
    return [category.id, *(child.id for child in category.children)]


# ---------------------------------------------------------------------------
# Respuestas
# ---------------------------------------------------------------------------

def _money(value):
    # Texto, no número: así no se pierden centavos al pasar por JavaScript.
    return f"{value:.2f}"


def _variant_values(product, variant):
    """Valores de la variante en el orden de las opciones del producto."""
    position = {option.id: option.position for option in product.options}
    names = {option.id: option.name for option in product.options}
    values = sorted(variant.option_values, key=lambda value: (position.get(value.option_id, 0), value.option_id))
    return [{"option": names.get(v.option_id), "value": v.value, "swatch_hex": v.swatch_hex} for v in values]


def _inventory_variant(product, variant):
    values = _variant_values(product, variant)
    return {
        "id": variant.id,
        "label": " / ".join(v["value"] for v in values),  # "Beige / G"; vacío si no hay opciones
        "values": values,
        "sku": variant.sku,
        "price": _money(variant.price),
        "stock": variant.stock,
        "is_active": variant.is_active,
    }


def _inventory_item(product):
    active = [v for v in product.variants if v.is_active]
    prices = [v.price for v in active]
    category = product.category
    first_image = product.images[0] if product.images else None
    return {
        "id": product.id,
        "name": product.name,
        "slug": product.slug,
        "status": _status(product),
        "is_featured": product.is_featured,
        "category": {
            "id": category.id,
            "name": category.name,
            "parent_name": category.parent.name if category.parent else None,
        },
        "image": (
            {"url": _image_url(first_image.public_id, THUMB_WIDTH), "alt": first_image.alt_text}
            if first_image
            else None
        ),
        # Precio y existencias de las variantes activas (las que se venden).
        "price_min": _money(min(prices)) if prices else None,
        "price_max": _money(max(prices)) if prices else None,
        "stock_total": sum(v.stock for v in active),
        "variant_count": len(product.variants),
        "active_variant_count": len(active),
        "sold_out_count": sum(1 for v in active if v.stock <= 0),
        "variants": [_inventory_variant(product, v) for v in product.variants],
    }


def _with_inventory_data(query):
    """Carga de una vez lo que necesita _inventory_item (sin una consulta por fila)."""
    return query.options(
        selectinload(Product.category).selectinload(Category.parent),
        selectinload(Product.images),
        selectinload(Product.options),
        selectinload(Product.variants).selectinload(ProductVariant.option_values),
    )


def _counts():
    """Contadores de arriba del Inventario. No dependen de los filtros: siempre
    son de toda la tienda. "Con algo agotado" no cuenta los archivados."""
    row = db.session.execute(
        select(
            func.count().filter(Product.archived_at.is_(None)),
            func.count().filter(_is_visible()),
            func.count().filter(_is_hidden()),
            func.count().filter(_is_archived()),
            func.count().filter(and_(Product.archived_at.is_(None), _has_sold_out_variant())),
        ).select_from(Product)
    ).one()
    variants = db.session.scalar(
        select(func.count())
        .select_from(ProductVariant)
        .join(Product, Product.id == ProductVariant.product_id)
        .where(Product.archived_at.is_(None))
    )
    products, visible, hidden, archived, sold_out = row
    return {
        "products": products,  # sin contar archivados
        "variants": variants,  # de esos productos
        "visible": visible,
        "hidden": hidden,
        "archived": archived,
        "with_sold_out": sold_out,
    }


# ---------------------------------------------------------------------------
# Rutas
# ---------------------------------------------------------------------------

@admin_products.route("/products", methods=["GET"])
@admin_required
def list_products():
    """Lista del Inventario, 25 por página, más recientes primero.

    Filtros (todos opcionales):
      q             nombre del producto o SKU de alguna variante
      category      id de categoría (incluye sus subcategorías)
      status        not_archived (por defecto), visible, hidden, archived o all
      sold_out      true: solo productos con alguna variante activa agotada
      offset        desde dónde (0, 25, 50...)
    """
    conditions = []

    search = (request.args.get("q") or "").strip()
    if len(search) > SEARCH_MAX:
        raise APIException("La búsqueda es demasiado larga.", status_code=400)
    if search:
        pattern = _like_pattern(search)
        sku_match = exists().where(
            ProductVariant.product_id == Product.id,
            ProductVariant.sku.ilike(pattern, escape="\\"),
        )
        conditions.append(or_(Product.name.ilike(pattern, escape="\\"), sku_match))

    category_id = _int_arg("category", None, 1, 2**31 - 1)
    if category_id is not None:
        conditions.append(Product.category_id.in_(_category_ids(category_id)))

    status = request.args.get("status") or "not_archived"
    if status not in STATUSES:
        raise APIException("El estado pedido no es válido.", status_code=400)
    status_condition = {
        "not_archived": Product.archived_at.is_(None),
        "visible": _is_visible(),
        "hidden": _is_hidden(),
        "archived": _is_archived(),
        "all": None,
    }[status]
    if status_condition is not None:
        conditions.append(status_condition)

    sold_out = request.args.get("sold_out")
    if sold_out not in (None, "", "true", "false"):
        raise APIException("El parámetro sold_out no es válido.", status_code=400)
    if sold_out == "true":
        conditions.append(_has_sold_out_variant())

    offset = _int_arg("offset", 0, 0, MAX_OFFSET)

    total = db.session.scalar(select(func.count()).select_from(Product).where(*conditions))
    products = db.session.scalars(
        _with_inventory_data(
            select(Product)
            .where(*conditions)
            .order_by(Product.created_at.desc(), Product.id.desc())
            .limit(PAGE_SIZE)
            .offset(offset)
        )
    ).all()

    return jsonify({
        "total": total,
        "limit": PAGE_SIZE,
        "offset": offset,
        "counts": _counts(),
        "items": [_inventory_item(p) for p in products],
    })


# --- Guardar precio y existencias desde el Inventario ----------------------

def _parse_price(raw):
    """Precio como texto ("180", "180.5", "180.50") o número. Devuelve Decimal
    o None si no es válido: mayor que 0, como mucho 2 decimales."""
    if isinstance(raw, bool) or not isinstance(raw, (str, int, float)):
        return None
    try:
        value = Decimal(str(raw).strip())
    except InvalidOperation:
        return None
    if not value.is_finite() or value <= 0 or value > MAX_PRICE or value.as_tuple().exponent < -2:
        return None
    return value


def _parse_stock(raw):
    if isinstance(raw, bool) or not isinstance(raw, int):
        return None
    return raw if 0 <= raw <= MAX_STOCK else None


FIELDS = {
    # campo: (lector, mensaje si no es válido)
    "price": (_parse_price, "Escribe un precio mayor que 0, con 2 decimales como máximo."),
    "stock": (_parse_stock, f"Escribe un número entero de 0 a {MAX_STOCK}."),
}


@admin_products.route("/variants", methods=["PATCH"])
@admin_required
def update_variants():
    """Guarda precio y existencias de varias variantes a la vez (Inventario).

    Cuerpo:
      { "variants": [ { "id": 12, "price": "180.00", "stock": 15,
                        "previous": { "price": "175.00", "stock": 10 } } ] }

    Cada variante manda solo los campos que cambió, y en `previous` el valor
    que veía en pantalla. Si algún valor actual ya no es el que veía (por
    ejemplo, se vendió una unidad mientras editaba), no se guarda nada y se
    responde 409 con los valores actuales: así un guardado nunca borra una
    venta ni el cambio de otra persona. Todo o nada.
    """
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not isinstance(data.get("variants"), list) or not data["variants"]:
        raise APIException("Faltan los cambios que guardar.", status_code=400)
    changes = data["variants"]
    if len(changes) > MAX_VARIANT_CHANGES:
        raise APIException(f"Guarda como máximo {MAX_VARIANT_CHANGES} variantes a la vez.", status_code=400)

    # 1. Leer y validar todo antes de tocar la base.
    errors = {}
    parsed = {}  # id -> {campo: (nuevo, anterior)}
    for change in changes:
        if not isinstance(change, dict) or isinstance(change.get("id"), bool) or not isinstance(change.get("id"), int):
            raise APIException("Los datos de la petición no son válidos.", status_code=400)
        variant_id = change["id"]
        if variant_id in parsed:
            raise APIException("Una variante viene repetida.", status_code=400)
        previous = change.get("previous")
        if not isinstance(previous, dict):
            raise APIException("Falta el valor anterior de cada cambio.", status_code=400)
        if not any(field in change for field in FIELDS):
            raise APIException("Una de las variantes no trae cambios.", status_code=400)
        fields = {}
        for field, (parse, message) in FIELDS.items():
            if field not in change:
                continue
            old_value = parse(previous.get(field))
            if old_value is None:
                raise APIException("Falta el valor anterior de cada cambio.", status_code=400)
            new_value = parse(change[field])
            if new_value is None:
                errors[f"{variant_id}.{field}"] = message
                continue
            fields[field] = (new_value, old_value)
        parsed[variant_id] = fields
    if errors:
        raise APIException("Revisa los datos marcados.", status_code=400, payload={"errors": errors})

    # 2. Bloquear esas filas hasta el final (FOR UPDATE): mientras se comparan y
    #    se guardan, nadie más puede cambiarlas (ni una venta a la vez).
    variants = {
        v.id: v
        for v in db.session.scalars(
            select(ProductVariant)
            .where(ProductVariant.id.in_(parsed.keys()))
            .order_by(ProductVariant.id)
            .with_for_update()
        )
    }
    missing = [variant_id for variant_id in parsed if variant_id not in variants]
    if missing:
        db.session.rollback()
        raise APIException("Una de las variantes ya no existe. Recarga la página.", status_code=404)

    # 3. Comparar con lo que veía en pantalla.
    conflicts = []
    for variant_id, fields in parsed.items():
        variant = variants[variant_id]
        for field, (_new, old) in fields.items():
            current = getattr(variant, field)
            if current != old:
                conflicts.append({
                    "id": variant.id,
                    "sku": variant.sku,
                    "field": field,
                    "current": _money(current) if field == "price" else current,
                })
    if conflicts:
        db.session.rollback()  # suelta el bloqueo sin cambiar nada
        if len(conflicts) == 1:
            c = conflicts[0]
            if c["field"] == "stock":
                message = f"Las existencias de {c['sku']} cambiaron mientras editabas: ahora hay {c['current']}."
            else:
                message = f"El precio de {c['sku']} cambió mientras editabas: ahora es ${c['current']}."
        else:
            message = f"{len(conflicts)} valores cambiaron mientras editabas."
        raise APIException(
            f"{message} No se guardó nada: revisa y guarda de nuevo.",
            status_code=409,
            payload={"conflicts": conflicts},
        )

    # 4. Guardar todo junto.
    for variant_id, fields in parsed.items():
        for field, (new, _old) in fields.items():
            setattr(variants[variant_id], field, new)
    product_ids = {variants[variant_id].product_id for variant_id in parsed}
    db.session.commit()

    # Las filas de esos productos, ya actualizadas (totales y avisos de agotado).
    products = db.session.scalars(
        _with_inventory_data(select(Product).where(Product.id.in_(product_ids)))
    ).all()
    return jsonify({
        "message": "Cambios guardados.",
        "items": [_inventory_item(p) for p in products],
        "counts": _counts(),
    })
