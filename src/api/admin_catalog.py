"""
Catálogo en el panel de administración (tarea 2.1): categorías por ahora; los
productos llegan en el paso 5.

Todas las rutas llevan @admin_required: exigen sesión de administración y, en
POST, PUT y DELETE, la cabecera X-CSRF-TOKEN (tarea 1.5). A diferencia de la API
pública (catalog.py), aquí se cuentan también los productos ocultos y archivados.

Cada cambio responde con el árbol completo de categorías, para que la pantalla
se dibuje con lo que de verdad quedó guardado.
"""
from flask import Blueprint, jsonify, request
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from api.auth import admin_required
from api.models import Category, Product, db
from api.slugs import is_valid_slug, slugify, unique_slug
from api.utils import APIException

admin_catalog = Blueprint("admin_catalog", __name__)

# Los mismos límites que las columnas de models.py.
CATEGORY_NAME_MAX = 80
CATEGORY_SLUG_MAX = 100
CARD_TEXT_MAX = 80
SEO_DESCRIPTION_MAX = 160

INVALID_DATA = "Revisa los datos marcados."
SLUG_HELP = "Usa solo minúsculas sin acentos, números y guiones (por ejemplo, plumas-y-lapices)."


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------

def _json_body():
    # Solo JSON, como en auth.py: un formulario de otra web no puede mandarlo.
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise APIException("Faltan los datos de la petición.", status_code=400)
    return data


def _text(data, field, max_length, errors, required_message=None):
    """Texto limpio (sin espacios a los lados) o None si viene vacío. Anota en
    `errors` lo que no cumpla: obligatorio, tipo o largo máximo."""
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


def _category_or_404(category_id):
    category = db.session.get(Category, category_id)
    if category is None:
        raise APIException("Categoría no encontrada.", status_code=404)
    return category


def _product_counts():
    """Productos por categoría (solo los que van directamente en ella), contando
    también ocultos y archivados: todos impiden borrarla."""
    rows = db.session.execute(select(Product.category_id, func.count()).group_by(Product.category_id))
    return dict(rows.all())


def _plural(count, singular, plural):
    return f"{count} {singular if count == 1 else plural}"


def _siblings(parent_id):
    """Categorías del mismo grupo (principales, o subcategorías de una misma
    madre), en su orden."""
    return list(db.session.scalars(
        select(Category)
        .where(Category.parent_id.is_(None) if parent_id is None else Category.parent_id == parent_id)
        .order_by(Category.sort_order, Category.id)
    ))


def _next_position(parent_id):
    return max((c.sort_order for c in _siblings(parent_id)), default=-1) + 1


def _commit():
    """Guarda. Si dos personas guardan a la vez la misma dirección, la base lo
    impide (UNIQUE) y se avisa en lugar de dar un error 500."""
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        raise APIException(
            "No se pudo guardar porque otro cambio se hizo al mismo tiempo. Recarga la página e inténtalo de nuevo.",
            status_code=409,
        )


# ---------------------------------------------------------------------------
# Árbol de categorías
# ---------------------------------------------------------------------------

def _category_json(category, counts, children=None):
    own = counts.get(category.id, 0)
    data = {
        "id": category.id,
        "name": category.name,
        "slug": category.slug,
        "parent_id": category.parent_id,
        "card_text": category.card_text,
        "seo_description": category.seo_description,
        # Productos que van directamente en esta categoría.
        "own_product_count": own,
    }
    if children is None:
        data["product_count"] = own
    else:
        data["product_count"] = own + sum(child["product_count"] for child in children)
        data["children"] = children
    return data


def _tree():
    counts = _product_counts()
    categories = list(db.session.scalars(select(Category).order_by(Category.sort_order, Category.id)))
    children_of = {}
    for category in categories:
        if category.parent_id is not None:
            children_of.setdefault(category.parent_id, []).append(category)
    return [
        _category_json(
            category,
            counts,
            [_category_json(child, counts) for child in children_of.get(category.id, [])],
        )
        for category in categories
        if category.parent_id is None
    ]


def _tree_response(message=None, status=200):
    body = {"categories": _tree()}
    if message:
        body["message"] = message
    return jsonify(body), status


# ---------------------------------------------------------------------------
# Validación de una categoría (crear y editar)
# ---------------------------------------------------------------------------

def _validate_parent(data, errors, category=None):
    """Madre elegida, o None si es principal. Reglas: solo dos niveles; una
    categoría con subcategorías no puede ir dentro de otra; y no se crean
    subcategorías en una categoría que tiene productos directamente (decisión A
    del 31 oct: así ningún producto queda suelto junto a sus subcategorías)."""
    parent_id = data.get("parent_id")
    if parent_id is None:
        return None
    if isinstance(parent_id, bool) or not isinstance(parent_id, int):
        errors["parent_id"] = "Elige una categoría de la lista."
        return None
    if category is not None and parent_id == category.id:
        errors["parent_id"] = "Una categoría no puede ir dentro de sí misma."
        return None
    parent = db.session.get(Category, parent_id)
    if parent is None:
        errors["parent_id"] = "Esa categoría ya no existe. Recarga la página."
        return None
    if parent.parent_id is not None:
        errors["parent_id"] = "Solo hay dos niveles: elige una categoría principal."
        return None
    if category is not None and category.children:
        errors["parent_id"] = "Tiene subcategorías, así que no puede ir dentro de otra categoría."
        return None
    moving_in = category is None or category.parent_id != parent.id
    own_products = _product_counts().get(parent.id, 0)
    if moving_in and own_products:
        errors["parent_id"] = (
            f"{parent.name} tiene {_plural(own_products, 'producto', 'productos')} directamente. "
            "Para dividirla: crea la nueva categoría como principal, mueve ahí esos productos "
            f"y después ponla dentro de {parent.name}."
        )
        return None
    return parent


def _validate_slug(data, errors, name, category=None):
    """Dirección escrita por la administradora, o una nueva sacada del nombre si
    la deja vacía. Si choca con otra categoría se avisa (no se añade -2 a
    escondidas a lo que ella escribió)."""
    raw = data.get("slug")
    if raw is not None and not isinstance(raw, str):
        errors["slug"] = SLUG_HELP
        return None
    slug = (raw or "").strip()
    exclude_id = category.id if category is not None else None
    if not slug:
        if not name:
            return None
        base = slugify(name, CATEGORY_SLUG_MAX) or "categoria"
        return unique_slug(Category, base, CATEGORY_SLUG_MAX, exclude_id)
    if not is_valid_slug(slug, CATEGORY_SLUG_MAX):
        errors["slug"] = SLUG_HELP
        return None
    query = select(Category.id).where(Category.slug == slug)
    if exclude_id is not None:
        query = query.where(Category.id != exclude_id)
    if db.session.scalar(query) is not None:
        errors["slug"] = "Ya hay otra categoría con esta dirección."
        return None
    return slug


def _validate_name(data, errors, category=None):
    """Nombre obligatorio y sin repetir: dos categorías con el mismo nombre
    (aunque cambien mayúsculas) confundirían en la Tienda y en el panel."""
    name = _text(data, "name", CATEGORY_NAME_MAX, errors, "Escribe el nombre.")
    if not name:
        return name
    query = select(Category.id).where(func.lower(Category.name) == name.lower())
    if category is not None:
        query = query.where(Category.id != category.id)
    if db.session.scalar(query) is not None:
        errors["name"] = "Ya hay una categoría con este nombre."
    return name


def _validated_fields(data, category=None):
    errors = {}
    name = _validate_name(data, errors, category)
    card_text = _text(data, "card_text", CARD_TEXT_MAX, errors)
    seo_description = _text(data, "seo_description", SEO_DESCRIPTION_MAX, errors)
    parent = _validate_parent(data, errors, category)
    slug = _validate_slug(data, errors, name, category)
    if errors:
        raise APIException(INVALID_DATA, status_code=400, payload={"errors": errors})
    return {
        "name": name,
        "slug": slug,
        "card_text": card_text,
        "seo_description": seo_description,
        "parent": parent,
    }


# ---------------------------------------------------------------------------
# Rutas
# ---------------------------------------------------------------------------

@admin_catalog.route("/categories", methods=["GET"])
@admin_required
def list_categories():
    return _tree_response()


@admin_catalog.route("/categories", methods=["POST"])
@admin_required
def create_category():
    fields = _validated_fields(_json_body())
    parent = fields.pop("parent")
    parent_id = parent.id if parent else None
    category = Category(**fields, parent_id=parent_id, sort_order=_next_position(parent_id))
    db.session.add(category)
    _commit()
    return _tree_response(f"Categoría «{category.name}» creada.", 201)


@admin_catalog.route("/categories/<int:category_id>", methods=["PUT"])
@admin_required
def update_category(category_id):
    category = _category_or_404(category_id)
    fields = _validated_fields(_json_body(), category)
    parent = fields.pop("parent")
    new_parent_id = parent.id if parent else None
    if new_parent_id != category.parent_id:
        # Al cambiar de grupo, queda al final del grupo nuevo.
        category.sort_order = _next_position(new_parent_id)
        category.parent_id = new_parent_id
    for key, value in fields.items():
        setattr(category, key, value)
    _commit()
    return _tree_response("Cambios guardados.")


@admin_catalog.route("/categories/<int:category_id>/move", methods=["POST"])
@admin_required
def move_category(category_id):
    """Sube o baja una posición dentro de su grupo (las flechas del panel)."""
    category = _category_or_404(category_id)
    direction = _json_body().get("direction")
    if direction not in ("up", "down"):
        raise APIException("Indica si sube o baja.", status_code=400)
    siblings = _siblings(category.parent_id)
    index = siblings.index(category)
    target = index - 1 if direction == "up" else index + 1
    if target < 0 or target >= len(siblings):
        message = "Ya está en primer lugar." if direction == "up" else "Ya está en último lugar."
        raise APIException(message, status_code=400)
    siblings[index], siblings[target] = siblings[target], siblings[index]
    # Se renumera todo el grupo (0, 1, 2...) por si había posiciones repetidas.
    for position, sibling in enumerate(siblings):
        sibling.sort_order = position
    _commit()
    return _tree_response()


@admin_catalog.route("/categories/<int:category_id>", methods=["DELETE"])
@admin_required
def delete_category(category_id):
    """Solo se borra una categoría vacía: sin subcategorías ni productos (aunque
    estén ocultos o archivados). La base también lo impide (RESTRICT)."""
    category = _category_or_404(category_id)
    if category.children:
        count = len(category.children)
        raise APIException(
            f"No se puede borrar: tiene {_plural(count, 'subcategoría', 'subcategorías')}. "
            "Solo se borra una categoría vacía.",
            status_code=409,
        )
    products = _product_counts().get(category.id, 0)
    if products:
        raise APIException(
            f"No se puede borrar: tiene {_plural(products, 'producto', 'productos')} "
            "(contando ocultos y archivados). Muévelos antes a otra categoría.",
            status_code=409,
        )
    name = category.name
    db.session.delete(category)
    _commit()
    return _tree_response(f"Categoría «{name}» borrada.")
