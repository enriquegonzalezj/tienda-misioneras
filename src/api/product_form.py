"""
Formulario de producto del panel (tarea 2.1, paso 5b): validar lo que llega y
guardarlo. Lo usan las rutas de admin_products.py.

El formulario llega entero en una sola petición (datos, estado, categoría,
opciones y variantes), porque el panel tiene un solo "Guardar cambios": o se
guarda todo o nada. Las fotos van aparte (paso 8).

Forma del cuerpo:
  {
    "name": "Playera Modelo 3", "slug": "", "subtitle": "", "card_subtitle": "",
    "description": "", "seo_description": "", "category_id": 4,
    "is_active": false, "is_featured": false,
    "options": [                                   (máximo 2, en su orden)
      { "id": 7, "name": "Color", "has_swatch": true,
        "values": [ { "id": 21, "value": "Beige", "swatch_hex": "#EDE3D1" }, ... ] }
    ],
    "variants": [                                  (en su orden)
      { "id": 43, "values": ["Beige", "M"], "sku": "P3-BEI-M",
        "price": "250.00", "cost": "120.00", "stock": 5, "is_active": true }
    ]
  }
`id` solo en lo que ya existe; lo nuevo va sin id. Una variante nombra sus
valores por su texto, en el orden de las opciones (así una variante nueva
puede usar un valor nuevo que todavía no tiene id). Sin opciones, el producto
lleva una sola variante con "values": [].

Los errores van por campo, con claves como "name", "options.0.values.1.value"
o "variants.2.sku", para que la pantalla los ponga junto a su campo.
"""
import re
from decimal import Decimal, InvalidOperation

from sqlalchemy import func, select

from api.models import Category, OrderItem, Product, ProductOption, ProductOptionValue, ProductVariant, db
from api.slugs import is_valid_slug, slugify, unique_slug
from api.utils import APIException

# Los mismos límites que las columnas de models.py.
NAME_MAX = 150
SLUG_MAX = 170
SUBTITLE_MAX = 150
CARD_SUBTITLE_MAX = 60
SEO_DESCRIPTION_MAX = 160
DESCRIPTION_MAX = 5_000  # Text no tiene límite; esto evita textos absurdos
OPTION_NAME_MAX = 40
VALUE_MAX = 40
SKU_MAX = 64
MAX_OPTIONS = 2
MAX_VALUES = 50  # por opción ("Más de 30 diseños" en stickers)
MAX_VARIANTS = 150
MAX_PRICE = Decimal("99999999.99")  # lo que cabe en Numeric(10, 2)
MAX_STOCK = 99_999

INVALID_DATA = "Revisa los datos marcados."
SLUG_HELP = "Usa solo minúsculas sin acentos, números y guiones (por ejemplo, playera-modelo-3)."
SKU_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
HEX_PATTERN = re.compile(r"^#[0-9A-Fa-f]{6}$")

PRICE_HELP = "Escribe un precio mayor que 0, con 2 decimales como máximo."
STOCK_HELP = f"Escribe un número entero de 0 a {MAX_STOCK}."


class _MismatchedIds(Exception):
    """Un id que no es de este producto: la pantalla tiene datos viejos."""


# ---------------------------------------------------------------------------
# Lectores de valores sueltos (también los usa el Inventario)
# ---------------------------------------------------------------------------

def parse_price(raw):
    """Precio como texto ("180", "180.5", "180.50") o número. Devuelve Decimal,
    o None si no es válido: mayor que 0 y con 2 decimales como máximo."""
    value = _parse_decimal(raw)
    return value if value is not None and value > 0 else None


def parse_cost(raw):
    """Costo de compra: como el precio, pero puede ser 0."""
    value = _parse_decimal(raw)
    return value if value is not None and value >= 0 else None


def _parse_decimal(raw):
    if isinstance(raw, bool) or not isinstance(raw, (str, int, float)):
        return None
    try:
        value = Decimal(str(raw).strip())
    except InvalidOperation:
        return None
    if not value.is_finite() or value > MAX_PRICE or value.as_tuple().exponent < -2:
        return None
    return value.quantize(Decimal("0.01"))


def parse_stock(raw):
    if isinstance(raw, bool) or not isinstance(raw, int):
        return None
    return raw if 0 <= raw <= MAX_STOCK else None


def _text(value, max_length, key, errors, required_message=None):
    """Texto limpio, o None si viene vacío. Anota en `errors` lo que no cumpla."""
    if value is None:
        value = ""
    if not isinstance(value, str):
        errors[key] = "Este dato no es válido."
        return None
    value = value.strip()
    if not value:
        if required_message:
            errors[key] = required_message
        return None
    if len(value) > max_length:
        errors[key] = f"Usa como máximo {max_length} caracteres."
        return None
    return value


def _flag(data, key, errors):
    value = data.get(key, False)
    if not isinstance(value, bool):
        errors[key] = "Este dato no es válido."
        return False
    return value


def _list(value):
    if value is None:
        return []
    if not isinstance(value, list):
        raise APIException("Los datos de la petición no son válidos.", status_code=400)
    return value


def _id(item, allowed):
    """Id de algo que ya existe, o None si es nuevo. Si no es de este producto, error."""
    raw = item.get("id")
    if raw is None:
        return None
    if isinstance(raw, bool) or not isinstance(raw, int) or raw not in allowed:
        raise _MismatchedIds()
    return raw


# ---------------------------------------------------------------------------
# Validación
# ---------------------------------------------------------------------------

def sold_variant_ids(variant_ids):
    """Variantes que aparecen en algún pedido (de cualquier estado). La base no
    deja borrarlas (RESTRICT), así que se desactivan en lugar de quitarse."""
    if not variant_ids:
        return set()
    return set(db.session.scalars(
        select(OrderItem.variant_id).where(OrderItem.variant_id.in_(variant_ids)).distinct()
    ))


def validate_product(data, product=None):
    """Revisa el formulario. Devuelve los datos limpios o lanza APIException
    con los errores por campo. `product` es None al crear."""
    if not isinstance(data, dict):
        raise APIException("Faltan los datos de la petición.", status_code=400)
    try:
        return _validate(data, product)
    except _MismatchedIds:
        raise APIException(
            "Los datos de la pantalla no coinciden con los guardados. Recarga la página.",
            status_code=409,
        )


def _validate(data, product):
    errors = {}
    fields = {
        "name": _text(data.get("name"), NAME_MAX, "name", errors, "Escribe el nombre."),
        "subtitle": _text(data.get("subtitle"), SUBTITLE_MAX, "subtitle", errors),
        "card_subtitle": _text(data.get("card_subtitle"), CARD_SUBTITLE_MAX, "card_subtitle", errors),
        "description": _text(data.get("description"), DESCRIPTION_MAX, "description", errors),
        "seo_description": _text(data.get("seo_description"), SEO_DESCRIPTION_MAX, "seo_description", errors),
        "is_active": _flag(data, "is_active", errors),
        "is_featured": _flag(data, "is_featured", errors),
    }
    fields["slug"] = _validate_slug(data.get("slug"), fields["name"], product, errors)
    fields["category_id"] = _validate_category(data.get("category_id"), errors)

    options = _validate_options(_list(data.get("options")), product, errors)
    variants = _validate_variants(_list(data.get("variants")), options, product, errors)

    if fields["is_active"]:
        if product is not None and product.archived_at is not None:
            errors["is_active"] = "Está archivado: desarchívalo antes de mostrarlo en la tienda."
        elif variants is not None and not any(v["is_active"] for v in variants):
            errors["is_active"] = "Para mostrarlo en la tienda, deja activa al menos una variante."

    if errors:
        raise APIException(INVALID_DATA, status_code=400, payload={"errors": errors})
    return {"fields": fields, "options": options, "variants": variants}


def _validate_slug(raw, name, product, errors):
    """Dirección escrita a mano, o una nueva sacada del nombre si se deja
    vacía. Si choca con otro producto se avisa (no se añade -2 a escondidas)."""
    if raw is not None and not isinstance(raw, str):
        errors["slug"] = SLUG_HELP
        return None
    slug = (raw or "").strip()
    exclude_id = product.id if product is not None else None
    if not slug:
        if not name:
            return None
        return unique_slug(Product, slugify(name, SLUG_MAX) or "producto", SLUG_MAX, exclude_id)
    if not is_valid_slug(slug, SLUG_MAX):
        errors["slug"] = SLUG_HELP
        return None
    query = select(Product.id).where(Product.slug == slug)
    if exclude_id is not None:
        query = query.where(Product.id != exclude_id)
    if db.session.scalar(query) is not None:
        errors["slug"] = "Ya hay otro producto con esta dirección."
        return None
    return slug


def _validate_category(raw, errors):
    if isinstance(raw, bool) or not isinstance(raw, int):
        errors["category_id"] = "Elige la categoría."
        return None
    category = db.session.get(Category, raw)
    if category is None:
        errors["category_id"] = "Esa categoría ya no existe. Recarga la página."
        return None
    if category.children:
        errors["category_id"] = f"«{category.name}» tiene subcategorías: elige una de ellas."
        return None
    return category.id


def _validate_options(raw_options, product, errors):
    if len(raw_options) > MAX_OPTIONS:
        errors["options"] = f"Un producto tiene como máximo {MAX_OPTIONS} opciones (por ejemplo, Color y Talla)."
        return None
    own_options = {o.id: o for o in product.options} if product is not None else {}
    options = []
    seen_names = set()
    for i, raw in enumerate(raw_options):
        key = f"options.{i}"
        if not isinstance(raw, dict):
            raise APIException("Los datos de la petición no son válidos.", status_code=400)
        option_id = _id(raw, own_options)
        name = _text(raw.get("name"), OPTION_NAME_MAX, f"{key}.name", errors, "Escribe el nombre de la opción.")
        if name:
            if name.lower() in seen_names:
                errors[f"{key}.name"] = "Ya hay otra opción con este nombre."
            seen_names.add(name.lower())
        has_swatch = raw.get("has_swatch", False)
        if not isinstance(has_swatch, bool):
            raise APIException("Los datos de la petición no son válidos.", status_code=400)
        own_values = {v.id for v in own_options[option_id].values} if option_id else set()
        raw_values = _list(raw.get("values"))
        if not raw_values:
            errors[f"{key}.values"] = "Agrega al menos un valor."
        elif len(raw_values) > MAX_VALUES:
            errors[f"{key}.values"] = f"Una opción tiene como máximo {MAX_VALUES} valores."
        values = []
        seen_values = set()
        for j, raw_value in enumerate(raw_values[:MAX_VALUES]):
            value_key = f"{key}.values.{j}"
            if not isinstance(raw_value, dict):
                raise APIException("Los datos de la petición no son válidos.", status_code=400)
            value_id = _id(raw_value, own_values)
            text = _text(raw_value.get("value"), VALUE_MAX, f"{value_key}.value", errors, "Escribe el valor.")
            if text:
                if text.lower() in seen_values:
                    errors[f"{value_key}.value"] = "Este valor está repetido."
                seen_values.add(text.lower())
            swatch = raw_value.get("swatch_hex")
            if has_swatch:
                if not isinstance(swatch, str) or not HEX_PATTERN.match(swatch):
                    errors[f"{value_key}.swatch_hex"] = "Elige el color."
                    swatch = None
                else:
                    swatch = swatch.upper()
            else:
                swatch = None  # sin círculo de color, no se guarda ninguno
            values.append({"id": value_id, "value": text, "swatch_hex": swatch})
        options.append({"id": option_id, "name": name, "values": values})
    return options


def _validate_variants(raw_variants, options, product, errors):
    own_variants = {v.id: v for v in product.variants} if product is not None else {}
    if not raw_variants:
        errors["variants"] = "El producto necesita al menos una variante."
        return None
    if len(raw_variants) > MAX_VARIANTS:
        errors["variants"] = f"Un producto tiene como máximo {MAX_VARIANTS} variantes."
        return None
    if options is not None and not options and len(raw_variants) > 1:
        errors["variants"] = "Sin opciones, el producto lleva una sola variante."
        return None

    # Valores permitidos por opción, tal como se escribieron.
    allowed = [{v["value"] for v in o["values"] if v["value"]} for o in options] if options is not None else None

    variants = []
    seen_combos = {}
    seen_skus = {}
    for i, raw in enumerate(raw_variants):
        key = f"variants.{i}"
        if not isinstance(raw, dict):
            raise APIException("Los datos de la petición no son válidos.", status_code=400)
        variant_id = _id(raw, own_variants)

        values = raw.get("values")
        if not isinstance(values, list) or not all(isinstance(v, str) for v in values):
            raise APIException("Los datos de la petición no son válidos.", status_code=400)
        values = [v.strip() for v in values]
        if allowed is not None:
            if len(values) != len(allowed) or any(v not in allowed[n] for n, v in enumerate(values)):
                errors[f"{key}.values"] = "Elige un valor de cada opción."
            else:
                combo = tuple(v.lower() for v in values)
                if combo in seen_combos:
                    errors[f"{key}.values"] = "Esta combinación está repetida."
                seen_combos[combo] = i

        sku = _text(raw.get("sku"), SKU_MAX, f"{key}.sku", errors, "Escribe el SKU.")
        if sku:
            if not SKU_PATTERN.match(sku):
                errors[f"{key}.sku"] = "Usa letras, números, guiones, puntos o guiones bajos, sin espacios."
            elif sku.lower() in seen_skus:
                errors[f"{key}.sku"] = "Este SKU está repetido en otra variante."
            seen_skus[sku.lower()] = i

        price = parse_price(raw.get("price"))
        if price is None:
            errors[f"{key}.price"] = PRICE_HELP
        raw_cost = raw.get("cost")
        cost = None
        if raw_cost not in (None, ""):
            cost = parse_cost(raw_cost)
            if cost is None:
                errors[f"{key}.cost"] = "Escribe el costo (0 o más, con 2 decimales como máximo) o déjalo vacío."
        stock = parse_stock(raw.get("stock"))
        if stock is None:
            errors[f"{key}.stock"] = STOCK_HELP
        is_active = raw.get("is_active", True)
        if not isinstance(is_active, bool):
            raise APIException("Los datos de la petición no son válidos.", status_code=400)

        variants.append({
            "id": variant_id, "values": values, "sku": sku,
            "price": price, "cost": cost, "stock": stock, "is_active": is_active,
        })

    _check_skus_elsewhere(variants, product, errors)
    _check_sold_kept(variants, own_variants, errors)
    return variants


def _check_skus_elsewhere(variants, product, errors):
    """El SKU es único en toda la tienda (sin distinguir mayúsculas, para no
    confundir). Las variantes del propio producto no cuentan: se pueden
    intercambiar SKU entre ellas."""
    by_sku = {v["sku"].lower(): i for i, v in enumerate(variants) if v["sku"]}
    if not by_sku:
        return
    query = (
        select(func.lower(ProductVariant.sku), Product.name)
        .join(Product, Product.id == ProductVariant.product_id)
        .where(func.lower(ProductVariant.sku).in_(by_sku.keys()))
    )
    if product is not None:
        query = query.where(ProductVariant.product_id != product.id)
    for sku, product_name in db.session.execute(query):
        errors[f"variants.{by_sku[sku]}.sku"] = f"Este SKU ya lo usa «{product_name}»."


def _check_sold_kept(variants, own_variants, errors):
    """Una variante con ventas no se puede quitar: se desactiva."""
    kept = {v["id"] for v in variants if v["id"]}
    removed = set(own_variants) - kept
    sold = sold_variant_ids(removed)
    if sold:
        skus = ", ".join(sorted(own_variants[i].sku for i in sold))
        errors["variants"] = (
            f"No se pueden quitar variantes con ventas ({skus}). Desactívalas en lugar de quitarlas."
        )


# ---------------------------------------------------------------------------
# Guardado
# ---------------------------------------------------------------------------

def save_product(product, cleaned):
    """Crea (product=None) o actualiza el producto con los datos ya validados.
    No hace commit: lo hace la ruta. Devuelve el producto."""
    if product is None:
        product = Product()
        db.session.add(product)
    for key, value in cleaned["fields"].items():
        setattr(product, key, value)
    db.session.flush()

    old_options = {o.id: o for o in product.options}
    old_values = {v.id: v for o in product.options for v in o.values}
    old_variants = {v.id: v for v in product.variants}
    kept_variants = {v["id"] for v in cleaned["variants"] if v["id"]}
    kept_options = {o["id"] for o in cleaned["options"] if o["id"]}
    kept_values = {v["id"] for o in cleaned["options"] for v in o["values"] if v["id"]}

    # 1. Quitar las variantes que ya no están (sin ventas: ya se comprobó) y
    #    soltar los valores de las que se quedan, para poder borrar valores.
    #    Se quitan de su lista (delete-orphan los borra) en lugar de
    #    session.delete, para que la lista del producto quede al día.
    for variant_id, variant in old_variants.items():
        if variant_id in kept_variants:
            variant.option_values = []
        else:
            product.variants.remove(variant)
    db.session.flush()

    # 2. Quitar opciones y valores que ya no están.
    for option_id, option in old_options.items():
        if option_id not in kept_options:
            product.options.remove(option)
    for value_id, value in old_values.items():
        if value.option_id in kept_options and value_id not in kept_values:
            old_options[value.option_id].values.remove(value)
    db.session.flush()

    # 3. Nombres provisionales en lo que se queda. Así, intercambiar dos nombres
    #    (por ejemplo, los SKU de dos variantes) no choca con UNIQUE a medio
    #    guardar. "~" no es válido en nombres de SKU, así que no choca con nada.
    for option_id in kept_options:
        old_options[option_id].name = f"~{option_id}"
    for value_id in kept_values:
        old_values[value_id].value = f"~{value_id}"
    for variant_id in kept_variants:
        old_variants[variant_id].sku = f"~{variant_id}"
    db.session.flush()

    # 4. Opciones y valores, en su orden.
    value_lookup = []  # por opción: texto -> ProductOptionValue
    for position, data in enumerate(cleaned["options"]):
        # Lo nuevo se añade con append a la lista: en SQLAlchemy 2.0, crear con
        # ProductOption(product=product) no lo mete en la sesión y no se guardaría.
        if data["id"]:
            option = old_options[data["id"]]
        else:
            option = ProductOption()
            product.options.append(option)
        option.name = data["name"]
        option.position = position
        lookup = {}
        for value_position, value_data in enumerate(data["values"]):
            if value_data["id"]:
                value = old_values[value_data["id"]]
            else:
                value = ProductOptionValue()
                option.values.append(value)
            value.value = value_data["value"]
            value.swatch_hex = value_data["swatch_hex"]
            value.position = value_position
            lookup[value_data["value"]] = value
        value_lookup.append(lookup)

    # 5. Variantes, en su orden, con sus valores.
    for position, data in enumerate(cleaned["variants"]):
        if data["id"]:
            variant = old_variants[data["id"]]
        else:
            variant = ProductVariant()
            product.variants.append(variant)
        variant.sku = data["sku"]
        variant.price = data["price"]
        variant.cost = data["cost"]
        variant.stock = data["stock"]
        variant.is_active = data["is_active"]
        variant.position = position
        variant.option_values = [value_lookup[n][text] for n, text in enumerate(data["values"])]
    db.session.flush()
    return product
