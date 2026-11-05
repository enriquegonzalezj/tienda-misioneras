"""
Fotos en el panel de administración (tarea 2.1, paso 8: lo mínimo de la 2.2).

Cada acción se guarda en el momento, aparte del botón "Guardar cambios" del
formulario (opción A del 5 nov): subir, cambiar el texto alternativo, mover y
quitar. Por eso un producto tiene que existir antes de tener fotos.

Productos (hasta 10 fotos; la primera es la que se ve en la tienda):
  POST   /products/<id>/images                  subir (formulario con el campo "file")
  PATCH  /products/<id>/images/<image_id>       texto alternativo ({"alt_text": "..."})
  POST   /products/<id>/images/<image_id>/move  {"direction": "up" | "down"}
  DELETE /products/<id>/images/<image_id>       quitar
  Responden { images: [...], message } con las fotos tal como quedaron.

Categorías (imagen de la tarjeta en Inicio, solo en las principales; su texto
alternativo es el nombre de la categoría):
  PUT    /categories/<id>/image                 poner o cambiar (campo "file")
  DELETE /categories/<id>/image                 quitar
  Responden { categories: [...], message }, igual que admin_catalog.py.

Orden de las cosas para no dejar nada roto:
  - Al subir: primero Cloudinary y después la base. Si la base falla, se borra
    en Cloudinary lo que se acaba de subir.
  - Al quitar o cambiar: primero la base y después Cloudinary. Si Cloudinary
    falla, la foto ya no se usa en ningún sitio (solo ocupa espacio).

Todas llevan @admin_required (sesión de administración y cabecera X-CSRF-TOKEN).
"""
from flask import Blueprint, jsonify, request
from sqlalchemy import select

from api.admin_catalog import _tree_response
from api.admin_products import FORM_IMAGE_WIDTH
from api.auth import admin_required
from api.catalog import _image_url
from api.images import destroy_image, upload_from_request
from api.models import Category, Product, ProductImage, db
from api.utils import APIException

admin_images = Blueprint("admin_images", __name__)

MAX_PRODUCT_IMAGES = 10
ALT_TEXT_MAX = 150  # el mismo largo que la columna alt_text de models.py

TOO_MANY = f"Ya tiene {MAX_PRODUCT_IMAGES} fotos, el máximo. Quita una para agregar otra."


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------

def _json_body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise APIException("Faltan los datos de la petición.", status_code=400)
    return data


def _product_or_404(product_id, lock=False):
    """El producto. Con lock, bloquea su fila hasta el commit: así dos subidas a
    la vez no pasan juntas del máximo de fotos ni se reparten la misma posición."""
    query = select(Product).where(Product.id == product_id)
    if lock:
        query = query.with_for_update()
    product = db.session.scalar(query)
    if product is None:
        raise APIException("Producto no encontrado.", status_code=404)
    return product


def _image_or_404(product, image_id):
    image = db.session.get(ProductImage, image_id)
    if image is None or image.product_id != product.id:
        raise APIException("Esa foto ya no existe. Recarga la página.", status_code=404)
    return image


def _images(product_id):
    return list(db.session.scalars(
        select(ProductImage)
        .where(ProductImage.product_id == product_id)
        .order_by(ProductImage.sort_order, ProductImage.id)
    ))


def _images_response(product_id, message=None, status=200):
    """Las fotos tal como quedaron guardadas (el mismo formato que la ficha del
    producto en admin_products.py)."""
    db.session.expire_all()
    body = {
        "images": [
            {"id": image.id, "url": _image_url(image.public_id, FORM_IMAGE_WIDTH), "alt_text": image.alt_text}
            for image in _images(product_id)
        ]
    }
    if message:
        body["message"] = message
    return jsonify(body), status


def _commit_or_destroy(public_id):
    """Guarda; si la base falla, borra en Cloudinary la foto recién subida para
    que no quede suelta, y avisa."""
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        destroy_image(public_id)
        raise APIException("No se pudo guardar la foto. Recarga la página e inténtalo de nuevo.", status_code=409)


def _main_category_or_error(category_id, lock=False):
    query = select(Category).where(Category.id == category_id)
    if lock:
        query = query.with_for_update()
    category = db.session.scalar(query)
    if category is None:
        raise APIException("Categoría no encontrada.", status_code=404)
    if category.parent_id is not None:
        raise APIException("Solo las categorías principales tienen tarjeta en Inicio.", status_code=409)
    return category


# ---------------------------------------------------------------------------
# Fotos de producto
# ---------------------------------------------------------------------------

@admin_images.route("/products/<int:product_id>/images", methods=["POST"])
@admin_required
def add_product_image(product_id):
    # Comprobación rápida antes de subir nada (se repite con la fila bloqueada).
    product = _product_or_404(product_id)
    if len(_images(product.id)) >= MAX_PRODUCT_IMAGES:
        raise APIException(TOO_MANY, status_code=409)
    # El nombre en Cloudinary sale de la dirección del producto (ver images.py).
    # Se lee antes del rollback: después habría que volver a consultar la base.
    name = product.slug
    db.session.rollback()  # no dejar una transacción abierta mientras se sube

    public_id = upload_from_request(request, name)

    try:
        product = _product_or_404(product_id, lock=True)
    except APIException:
        # Lo borraron mientras se subía.
        db.session.rollback()
        destroy_image(public_id)
        raise
    images = _images(product.id)
    if len(images) >= MAX_PRODUCT_IMAGES:
        db.session.rollback()
        destroy_image(public_id)
        raise APIException(TOO_MANY, status_code=409)
    # Texto alternativo provisional: el nombre del producto. Se cambia en el panel.
    db.session.add(ProductImage(
        product_id=product.id,
        public_id=public_id,
        alt_text=product.name[:ALT_TEXT_MAX],
        sort_order=max((image.sort_order for image in images), default=-1) + 1,
    ))
    _commit_or_destroy(public_id)
    return _images_response(product_id, "Foto agregada.", 201)


@admin_images.route("/products/<int:product_id>/images/<int:image_id>", methods=["PATCH"])
@admin_required
def update_product_image(product_id, image_id):
    image = _image_or_404(_product_or_404(product_id), image_id)
    value = _json_body().get("alt_text")
    if not isinstance(value, str):
        value = ""
    value = value.strip()
    if not value:
        raise APIException(
            "Revisa los datos marcados.", status_code=400,
            payload={"errors": {"alt_text": "Escribe el texto alternativo."}},
        )
    if len(value) > ALT_TEXT_MAX:
        raise APIException(
            "Revisa los datos marcados.", status_code=400,
            payload={"errors": {"alt_text": f"Usa como máximo {ALT_TEXT_MAX} caracteres."}},
        )
    image.alt_text = value
    db.session.commit()
    return _images_response(product_id, "Texto alternativo guardado.")


@admin_images.route("/products/<int:product_id>/images/<int:image_id>/move", methods=["POST"])
@admin_required
def move_product_image(product_id, image_id):
    """Una posición antes o después (las flechas del panel). La primera es la principal."""
    product = _product_or_404(product_id, lock=True)
    image = _image_or_404(product, image_id)
    direction = _json_body().get("direction")
    if direction not in ("up", "down"):
        raise APIException("Indica si va antes o después.", status_code=400)
    images = _images(product.id)
    index = images.index(image)
    target = index - 1 if direction == "up" else index + 1
    if target < 0 or target >= len(images):
        message = "Ya es la primera." if direction == "up" else "Ya es la última."
        raise APIException(message, status_code=400)
    images[index], images[target] = images[target], images[index]
    # Se renumeran todas (0, 1, 2...) por si había posiciones repetidas.
    for position, each in enumerate(images):
        each.sort_order = position
    db.session.commit()
    message = "Ahora es la foto principal." if target == 0 else None
    return _images_response(product_id, message)


@admin_images.route("/products/<int:product_id>/images/<int:image_id>", methods=["DELETE"])
@admin_required
def delete_product_image(product_id, image_id):
    product = _product_or_404(product_id, lock=True)
    image = _image_or_404(product, image_id)
    public_id = image.public_id
    db.session.delete(image)
    db.session.commit()
    destroy_image(public_id)
    return _images_response(product_id, "Foto quitada.")


# ---------------------------------------------------------------------------
# Imagen de la tarjeta de una categoría principal
# ---------------------------------------------------------------------------

@admin_images.route("/categories/<int:category_id>/image", methods=["PUT"])
@admin_required
def set_category_image(category_id):
    category = _main_category_or_error(category_id)
    name = f"categoria-{category.slug}"
    db.session.rollback()

    public_id = upload_from_request(request, name)

    try:
        category = _main_category_or_error(category_id, lock=True)
    except APIException:
        # La borraron o la pasaron a subcategoría mientras se subía.
        db.session.rollback()
        destroy_image(public_id)
        raise
    old_public_id = category.image_public_id
    category.image_public_id = public_id
    _commit_or_destroy(public_id)
    destroy_image(old_public_id)
    return _tree_response("Imagen de la tarjeta guardada.")


@admin_images.route("/categories/<int:category_id>/image", methods=["DELETE"])
@admin_required
def delete_category_image(category_id):
    category = _main_category_or_error(category_id, lock=True)
    public_id = category.image_public_id
    if not public_id:
        raise APIException("No tiene imagen propia.", status_code=400)
    category.image_public_id = None
    db.session.commit()
    destroy_image(public_id)
    return _tree_response("Imagen de la tarjeta quitada.")
