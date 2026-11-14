"""
Campañas de descuento en el panel de administración (tarea 4.8, commit 97).

La congregación crea aquí las campañas: /admin/campanas (lista) y
/admin/campanas/nueva o /admin/campanas/<id> (formulario). El cálculo de los
precios está en pricing.py; aquí solo se validan y se guardan.

Reglas (CLAUDE.md, Reglas de negocio, "Campañas de descuento", y decisiones de
Enrique del 13 y 14 nov):
- Público: "customers" (Solo clientas con cuenta) o "everyone" (Todas).
- Alcance: "store" (toda la tienda) o "selected" (productos seleccionados). En
  "selected" se eligen productos y entran todas sus variantes activas, cada una
  con precio fijo opcional; una variante creada después no entra hasta volver a
  guardar la campaña (el detalle lo avisa con missing_variants). En "store" se
  pueden poner precios fijos a algunas variantes y solo esas se guardan.
- Porcentaje de 1 a 99 en productos y de 1 a 100 en el envío (100 = gratis),
  los dos opcionales. Una de toda la tienda exige porcentaje o envío (CHECK
  store_needs_discount); una de productos seleccionados exige porcentaje, envío
  o al menos un precio fijo. Un precio fijo debe ser menor que el normal.
- Fechas: días completos en hora de México. El fin no puede haber pasado al
  crear la campaña ni al cambiar sus fechas (sí se puede renombrar una que ya
  terminó).
- No coincidir: una campaña activa no puede compartir fechas y productos con
  otra activa (una de toda la tienda con porcentaje los comparte todos). Las
  que solo descuentan el envío no cuentan: no tocan precios de productos, y si
  dos descuentan el envío ya se aplica el mayor. Al reactivar se comprueba otra
  vez. La comprobación no bloquea filas: si dos personas guardan a la vez,
  pricing.py aplica igual el precio más bajo.
- Borrar: solo si nunca se usó en un pedido; si no, se desactiva. La base lo
  garantiza con RESTRICT (order_items.campaign_id y orders.shipping_campaign_id).
  Una campaña usada sí se puede editar: los pedidos guardan su copia.

Todas las rutas llevan @admin_required (sesión de administración y, en POST, PUT
y DELETE, la cabecera X-CSRF-TOKEN).
"""
from datetime import date

from flask import Blueprint, jsonify, request
from sqlalchemy import exists, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from api.admin_products import _like_pattern, _money, _status, _variant_values
from api.auth import admin_required
from api.models import Campaign, CampaignVariant, Order, OrderItem, Product, ProductVariant, db
from api.pricing import today_in_mexico
from api.product_form import parse_price
from api.utils import APIException

admin_campaigns = Blueprint("admin_campaigns", __name__)

NAME_MAX = 100  # como la columna de models.py
MAX_PRODUCTS = 200  # tope contra errores; la tienda tiene que soportar al menos 100 productos
SEARCH_MAX = 100
SEARCH_LIMIT = 20
AUDIENCES = ("customers", "everyone")
SCOPES = ("store", "selected")

MONTHS = (
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
)

INVALID_DATA = "Revisa los datos marcados."
INVALID = "Este dato no es válido."
FIXED_PRICE_HELP = "Escribe un precio mayor que 0, con 2 decimales como máximo."


# ---------------------------------------------------------------------------
# Lectura
# ---------------------------------------------------------------------------

def _campaign_or_404(campaign_id):
    campaign = db.session.scalar(
        select(Campaign)
        .where(Campaign.id == campaign_id)
        .options(
            selectinload(Campaign.items)
            .selectinload(CampaignVariant.variant)
            .selectinload(ProductVariant.product)
        )
    )
    if campaign is None:
        raise APIException("Campaña no encontrada.", status_code=404)
    return campaign


def _used_ids(campaign_ids=None):
    """Campañas que aparecen en algún pedido, en un renglón o en el envío."""
    in_items = select(OrderItem.campaign_id).where(OrderItem.campaign_id.is_not(None))
    in_shipping = select(Order.shipping_campaign_id).where(Order.shipping_campaign_id.is_not(None))
    if campaign_ids is not None:
        in_items = in_items.where(OrderItem.campaign_id.in_(campaign_ids))
        in_shipping = in_shipping.where(Order.shipping_campaign_id.in_(campaign_ids))
    return set(db.session.scalars(in_items.distinct())) | set(db.session.scalars(in_shipping.distinct()))


def _is_used(campaign_id):
    return db.session.scalar(
        select(
            exists().where(OrderItem.campaign_id == campaign_id)
            | exists().where(Order.shipping_campaign_id == campaign_id)
        )
    )


def _date_range_text(start, end):
    """"del 14 al 30 de noviembre", "del 28 de noviembre al 2 de diciembre" o,
    si cambia el año, con los dos años. Para los mensajes del panel."""
    if start.year != end.year:
        return f"del {start.day} de {MONTHS[start.month - 1]} de {start.year} al {end.day} de {MONTHS[end.month - 1]} de {end.year}"
    if start.month != end.month:
        return f"del {start.day} de {MONTHS[start.month - 1]} al {end.day} de {MONTHS[end.month - 1]}"
    return f"del {start.day} al {end.day} de {MONTHS[end.month - 1]}"


def campaign_status(campaign, today=None):
    """Programada, En curso, Terminada o Pausada. Una pausada que ya terminó
    sale como terminada: ya no hay nada que reactivar."""
    today = today or today_in_mexico()
    if campaign.end_date < today:
        return "ended"
    if not campaign.is_active:
        return "paused"
    if campaign.start_date > today:
        return "scheduled"
    return "running"


# ---------------------------------------------------------------------------
# Respuestas
# ---------------------------------------------------------------------------

def _summary(campaign, used, today):
    product_ids = {item.variant.product_id for item in campaign.items}
    return {
        "id": campaign.id,
        "name": campaign.name,
        "status": campaign_status(campaign, today),
        "start_date": campaign.start_date.isoformat(),
        "end_date": campaign.end_date.isoformat(),
        "audience": campaign.audience,
        "scope": campaign.scope,
        "discount_percent": campaign.discount_percent,
        "shipping_discount_percent": campaign.shipping_discount_percent,
        "is_active": campaign.is_active,
        "product_count": len(product_ids),
        "fixed_count": sum(1 for item in campaign.items if item.fixed_price is not None),
        "used": campaign.id in used,
    }


def _variant_json(product, variant, item):
    return {
        "id": variant.id,
        "label": " / ".join(v["value"] for v in _variant_values(product, variant)),  # vacío si no hay opciones
        "sku": variant.sku,
        "price": _money(variant.price),
        "is_active": variant.is_active,
        "included": item is not None,
        "fixed_price": _money(item.fixed_price) if item is not None and item.fixed_price is not None else None,
    }


def _products_json(campaign):
    """Los productos de la campaña con sus variantes: las activas (para poner o
    quitar precios fijos) y las desactivadas que siguen en la campaña.
    missing_variants: variantes activas que no entran todavía (creadas después
    de guardar la campaña; solo en productos seleccionados)."""
    items = {item.variant_id: item for item in campaign.items}
    products = {}
    for item in campaign.items:
        products.setdefault(item.variant.product_id, item.variant.product)
    db.session.scalars(  # carga opciones y valores de todos de una vez
        select(Product)
        .where(Product.id.in_(products))
        .options(selectinload(Product.options), selectinload(Product.variants).selectinload(ProductVariant.option_values))
    ).all()
    result = []
    for product in sorted(products.values(), key=lambda p: (p.name.lower(), p.id)):
        variants = sorted(product.variants, key=lambda v: (v.position, v.id))
        shown = [v for v in variants if v.is_active or v.id in items]
        missing = 0
        if campaign.scope == "selected":
            missing = sum(1 for v in variants if v.is_active and v.id not in items)
        result.append({
            "id": product.id,
            "name": product.name,
            "status": _status(product),
            "variants": [_variant_json(product, v, items.get(v.id)) for v in shown],
            "missing_variants": missing,
        })
    return result


def _detail(campaign):
    data = _summary(campaign, _used_ids([campaign.id]), today_in_mexico())
    data["products"] = _products_json(campaign)
    return data


def _detail_response(campaign_id, message=None, status=200):
    db.session.expire_all()  # que la respuesta lea lo que de verdad quedó guardado
    body = {"campaign": _detail(_campaign_or_404(campaign_id))}
    if message:
        body["message"] = message
    return jsonify(body), status


def _commit():
    try:
        db.session.commit()
    except IntegrityError:
        # Por ejemplo, un producto borrado mientras se editaba la campaña, o
        # una campaña que se usó en un pedido justo al borrarla.
        db.session.rollback()
        raise APIException(
            "No se pudo guardar porque otro cambio se hizo al mismo tiempo. Recarga la página e inténtalo de nuevo.",
            status_code=409,
        )


# ---------------------------------------------------------------------------
# Validación
# ---------------------------------------------------------------------------

def _json_body():
    # Solo JSON, como en el resto del panel: un formulario de otra web no puede mandarlo.
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise APIException("Faltan los datos de la petición.", status_code=400)
    return data


def _date(data, field, errors):
    value = data.get(field)
    if not isinstance(value, str) or not value.strip():
        errors[field] = "Elige la fecha."
        return None
    try:
        return date.fromisoformat(value.strip())
    except ValueError:
        errors[field] = "La fecha no es válida."
        return None


def _percent(data, field, maximum, errors):
    """Entero de 1 a maximum, o None si viene vacío. Acepta el número o el
    texto del campo ("15"); nunca true ni decimales."""
    value = data.get(field)
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    if isinstance(value, str) and value.strip().isdigit():
        value = int(value.strip())
    if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= maximum:
        errors[field] = f"Escribe un número entero de 1 a {maximum}, o déjalo vacío."
        return None
    return value


def _choice(data, field, allowed, errors):
    value = data.get(field)
    if value not in allowed:
        errors[field] = INVALID
        return None
    return value


def _positive_id(value):
    return value if isinstance(value, int) and not isinstance(value, bool) and value > 0 else None


def _validate_products(raw, scope, errors):
    """Devuelve {variant_id: precio fijo o None} de lo que entra en la campaña.
    raw: [{"id": producto, "variants": [{"id": variante, "fixed_price": "199.00"}]}]."""
    if raw is None:
        raw = []
    if not isinstance(raw, list):
        errors["products"] = INVALID
        return {}
    if len(raw) > MAX_PRODUCTS:
        errors["products"] = f"Una campaña puede llevar como máximo {MAX_PRODUCTS} productos."
        return {}
    if scope == "selected" and not raw:
        errors["products"] = "Agrega al menos un producto."
        return {}

    product_ids = []
    for index, entry in enumerate(raw):
        product_id = _positive_id(entry.get("id")) if isinstance(entry, dict) else None
        if product_id is None or product_id in product_ids:
            errors[f"products.{index}"] = INVALID
            return {}
        product_ids.append(product_id)
    products = {
        product.id: product
        for product in db.session.scalars(
            select(Product).where(Product.id.in_(product_ids)).options(selectinload(Product.variants))
        )
    }

    items = {}
    for index, entry in enumerate(raw):
        key = f"products.{index}"
        product = products.get(entry["id"])
        if product is None:
            errors[key] = "Este producto ya no existe. Quítalo de la campaña."
            continue
        if product.archived_at is not None:
            errors[key] = "Este producto está archivado. Quítalo de la campaña."
            continue
        active = {v.id: v for v in product.variants if v.is_active}
        if not active:
            errors[key] = "Este producto no tiene variantes activas. Quítalo de la campaña."
            continue

        fixed = {}
        raw_variants = entry.get("variants") or []
        if not isinstance(raw_variants, list):
            errors[key] = INVALID
            continue
        for v_index, raw_variant in enumerate(raw_variants):
            v_key = f"{key}.variants.{v_index}.fixed_price"
            variant_id = _positive_id(raw_variant.get("id")) if isinstance(raw_variant, dict) else None
            if variant_id is None:
                errors[f"{key}.variants.{v_index}"] = INVALID
                continue
            # Una variante de otro producto o desactivada no entra (nunca se vende).
            variant = active.get(variant_id)
            if variant is None:
                continue
            raw_price = raw_variant.get("fixed_price")
            if raw_price is None or (isinstance(raw_price, str) and not raw_price.strip()):
                continue
            price = parse_price(raw_price)
            if price is None:
                errors[v_key] = FIXED_PRICE_HELP
            elif price >= variant.price:
                errors[v_key] = f"Tiene que ser menor que el precio normal ({_money(variant.price)})."
            else:
                fixed[variant_id] = price

        if scope == "selected":
            # Entran todas sus variantes activas; el precio fijo es opcional.
            for variant_id in active:
                items[variant_id] = fixed.get(variant_id)
        else:
            # En toda la tienda el porcentaje ya toca todo: solo se guardan los precios fijos.
            if not fixed and not any(k.startswith(f"{key}.") for k in errors):
                errors[key] = "Pon al menos un precio fijo o quita el producto: en toda la tienda ya le toca el porcentaje."
            items.update(fixed)
    return items


def _price_reach(scope, discount_percent, items):
    """Productos cuyos precios cambia una campaña: "all" para toda la tienda con
    porcentaje, o un conjunto de ids de variante. Las que solo descuentan el
    envío devuelven un conjunto vacío: no cuentan para "no coincidir"."""
    if scope == "store" and discount_percent is not None:
        return "all"
    if discount_percent is not None:
        return set(items)
    return {variant_id for variant_id, fixed in items.items() if fixed is not None}


def _product_ids(variant_ids):
    if not variant_ids:
        return set()
    return set(db.session.scalars(
        select(ProductVariant.product_id).where(ProductVariant.id.in_(variant_ids)).distinct()
    ))


def _check_overlap(fields, items, campaign, errors):
    """Otra campaña activa con fechas en común y productos en común."""
    reach = _price_reach(fields["scope"], fields["discount_percent"], items)
    if reach != "all" and not reach:
        return
    query = (
        select(Campaign)
        .where(
            Campaign.is_active.is_(True),
            Campaign.start_date <= fields["end_date"],
            Campaign.end_date >= fields["start_date"],
        )
        .options(selectinload(Campaign.items))
        .order_by(Campaign.start_date, Campaign.id)
    )
    if campaign is not None:
        query = query.where(Campaign.id != campaign.id)
    mine = None if reach == "all" else _product_ids(reach)
    for other in db.session.scalars(query):
        other_items = {item.variant_id: item.fixed_price for item in other.items}
        other_reach = _price_reach(other.scope, other.discount_percent, other_items)
        if other_reach != "all" and not other_reach:
            continue
        if reach == "all" or other_reach == "all" or mine & _product_ids(other_reach):
            errors["overlap"] = (
                f"Coincide en fechas con «{other.name}» ({_date_range_text(other.start_date, other.end_date)}) "
                "y comparten productos. Cambia las fechas o los productos, o pausa una de las dos."
            )
            return


def _validated(data, campaign=None):
    """Campos de la campaña y {variant_id: precio fijo o None}. 400 con errors
    por campo si algo no cumple."""
    errors = {}
    name = data.get("name")
    if not isinstance(name, str):
        name = ""
    name = name.strip()
    if not name:
        errors["name"] = "Escribe el nombre."
    elif len(name) > NAME_MAX:
        errors["name"] = f"Usa como máximo {NAME_MAX} caracteres."

    start_date = _date(data, "start_date", errors)
    end_date = _date(data, "end_date", errors)
    if start_date and end_date:
        if end_date < start_date:
            errors["end_date"] = "Tiene que ser igual o posterior a la fecha de inicio."
        else:
            dates_changed = campaign is None or (start_date, end_date) != (campaign.start_date, campaign.end_date)
            if dates_changed and end_date < today_in_mexico():
                errors["end_date"] = "Esta fecha ya pasó."

    audience = _choice(data, "audience", AUDIENCES, errors)
    scope = _choice(data, "scope", SCOPES, errors)
    discount_percent = _percent(data, "discount_percent", 99, errors)
    shipping_discount_percent = _percent(data, "shipping_discount_percent", 100, errors)
    is_active = data.get("is_active", True)
    if not isinstance(is_active, bool):
        errors["is_active"] = INVALID

    items = _validate_products(data.get("products"), scope, errors) if scope else {}

    # Que descuente algo.
    if scope and "discount_percent" not in errors and "shipping_discount_percent" not in errors:
        has_fixed = any(price is not None for price in items.values())
        if scope == "store" and discount_percent is None and shipping_discount_percent is None:
            errors["discount_percent"] = "En toda la tienda, pon un porcentaje o un descuento en el envío."
        elif scope == "selected" and discount_percent is None and shipping_discount_percent is None and not has_fixed:
            # Si un producto o un precio fijo ya tiene error, primero se corrige eso:
            # el precio fijo que falló quizá era el descuento.
            if not any(key == "products" or key.startswith("products.") for key in errors):
                errors["discount_percent"] = "Pon un porcentaje, un descuento en el envío o al menos un precio fijo."

    fields = {
        "name": name,
        "start_date": start_date,
        "end_date": end_date,
        "audience": audience,
        "scope": scope,
        "discount_percent": discount_percent,
        "shipping_discount_percent": shipping_discount_percent,
        "is_active": is_active,
    }
    if not errors and is_active:
        _check_overlap(fields, items, campaign, errors)
    if errors:
        raise APIException(INVALID_DATA, status_code=400, payload={"errors": errors})
    return fields, items


def _save(campaign, fields, items):
    """Guarda los campos y deja en la campaña exactamente las variantes de items:
    cambia el precio de las que siguen, quita las que ya no y agrega las nuevas
    (así no se borra y se vuelve a crear la misma fila en una sola operación)."""
    for key, value in fields.items():
        setattr(campaign, key, value)
    current = {item.variant_id: item for item in campaign.items}
    for variant_id, item in current.items():
        if variant_id not in items:
            campaign.items.remove(item)
        else:
            item.fixed_price = items[variant_id]
    for variant_id, fixed_price in items.items():
        if variant_id not in current:
            campaign.items.append(CampaignVariant(variant_id=variant_id, fixed_price=fixed_price))


# ---------------------------------------------------------------------------
# Rutas
# ---------------------------------------------------------------------------

@admin_campaigns.route("/campaigns", methods=["GET"])
@admin_required
def list_campaigns():
    """Todas las campañas, de la que empieza más tarde a la más vieja."""
    campaigns = db.session.scalars(
        select(Campaign)
        .options(selectinload(Campaign.items).selectinload(CampaignVariant.variant))
        .order_by(Campaign.start_date.desc(), Campaign.id.desc())
    ).all()
    used = _used_ids([c.id for c in campaigns]) if campaigns else set()
    today = today_in_mexico()
    return jsonify({"campaigns": [_summary(c, used, today) for c in campaigns], "today": today.isoformat()})


@admin_campaigns.route("/campaigns/products", methods=["GET"])
@admin_required
def search_products():
    """Buscador del formulario: por nombre o SKU, hasta 20 productos con
    variantes activas. Incluye los ocultos (para preparar una campaña antes de
    mostrarlos), marcados con su estado; nunca los archivados."""
    q = (request.args.get("q") or "").strip()
    if len(q) > SEARCH_MAX:
        raise APIException(f"Busca con {SEARCH_MAX} caracteres como máximo.", status_code=400)
    if not q:
        return jsonify({"items": []})
    pattern = _like_pattern(q)
    products = db.session.scalars(
        select(Product)
        .where(
            Product.archived_at.is_(None),
            exists().where(ProductVariant.product_id == Product.id, ProductVariant.is_active.is_(True)),
            or_(
                Product.name.ilike(pattern),
                exists().where(ProductVariant.product_id == Product.id, ProductVariant.sku.ilike(pattern)),
            ),
        )
        .options(selectinload(Product.options), selectinload(Product.variants).selectinload(ProductVariant.option_values))
        .order_by(Product.name, Product.id)
        .limit(SEARCH_LIMIT)
    ).all()
    items = []
    for product in products:
        variants = sorted((v for v in product.variants if v.is_active), key=lambda v: (v.position, v.id))
        items.append({
            "id": product.id,
            "name": product.name,
            "status": _status(product),
            "variants": [_variant_json(product, v, None) for v in variants],
        })
    return jsonify({"items": items})


@admin_campaigns.route("/campaigns/<int:campaign_id>", methods=["GET"])
@admin_required
def get_campaign(campaign_id):
    return _detail_response(campaign_id)


@admin_campaigns.route("/campaigns", methods=["POST"])
@admin_required
def create_campaign():
    fields, items = _validated(_json_body())
    campaign = Campaign()
    _save(campaign, fields, items)
    db.session.add(campaign)
    _commit()
    return _detail_response(campaign.id, f"Campaña «{campaign.name}» creada.", 201)


@admin_campaigns.route("/campaigns/<int:campaign_id>", methods=["PUT"])
@admin_required
def update_campaign(campaign_id):
    """También pausa y reactiva (is_active): al reactivar se vuelve a comprobar
    que no coincida con otra. Una campaña usada en pedidos se puede editar: los
    pedidos guardan su copia de los precios."""
    campaign = _campaign_or_404(campaign_id)
    fields, items = _validated(_json_body(), campaign)
    _save(campaign, fields, items)
    _commit()
    return _detail_response(campaign.id, "Cambios guardados.")


@admin_campaigns.route("/campaigns/<int:campaign_id>", methods=["DELETE"])
@admin_required
def delete_campaign(campaign_id):
    """Solo se borra si nunca se usó en un pedido; si no, se desactiva."""
    campaign = _campaign_or_404(campaign_id)
    if _is_used(campaign.id):
        raise APIException(
            "No se puede borrar: ya se usó en pedidos. Desactívala para que deje de aplicarse.",
            status_code=409,
        )
    name = campaign.name
    db.session.delete(campaign)
    _commit()
    return jsonify({"message": f"Campaña «{name}» borrada."}), 200
