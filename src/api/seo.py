"""
Etiquetas de cada página para buscadores y vistas previas (tarea 3.5).

Flask entrega el mismo index.html para todas las pantallas de React, pero antes
cambia el bloque entre <!-- seo:inicio --> y <!-- seo:fin --> por el título, la
descripción, la dirección canónica y las etiquetas Open Graph de esa página.
Así Google, WhatsApp y Facebook ven los datos del producto o la categoría sin
ejecutar JavaScript. Después React funciona como siempre. En la ficha va además
el bloque de datos estructurados de schema.org (JSON-LD, tarea 5.7) que Google
usa para mostrar precio y disponibilidad en sus resultados.

Las pantallas públicas deben coincidir con src/front/routes.jsx: si se agrega
una en React (por ejemplo /donaciones), se agrega también en page_for().
"""
import json
import logging
import re

from cloudinary.utils import cloudinary_url
from flask import current_app
from markupsafe import escape
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import selectinload

from api.catalog import _complete_variants, _visible_conditions
from api.models import Category, Product, ProductOption, ProductVariant, db

logger = logging.getLogger(__name__)

SITE_NAME = "Vocaciones MHPVM"
STORE_NAME = "Tienda Vocaciones MHPVM"
DEFAULT_DESCRIPTION = (
    "Tienda en línea de Vocaciones MHPVM: playeras, papelería y accesorios con envío a todo México."
)
# Imagen por defecto (public/og-imagen.jpg, paso 3). Vite la copia tal cual a dist/.
DEFAULT_IMAGE_PATH = "/og-imagen.jpg"
DEFAULT_IMAGE_SIZE = (1200, 630)
DEFAULT_IMAGE_ALT = "Logo de Vocaciones MHPVM, Amar y consolar"
# Google corta la descripción hacia los 155 caracteres.
DESCRIPTION_LIMIT = 155
OG_IMAGE_WIDTH = 1200

SEO_BLOCK = re.compile(r"<!-- seo:inicio -->.*?<!-- seo:fin -->", re.DOTALL)
PRODUCT_PATH = re.compile(r"producto/([^/]+)")
CATEGORY_PATH = re.compile(r"categoria/([^/]+)")


def _title(page_name):
    """Título de la pestaña y de Google: "Libretas | Vocaciones MHPVM".
    Inicio lleva solo "Tienda Vocaciones MHPVM"."""
    return f"{page_name} | {SITE_NAME}"


def _short_text(text):
    """Texto plano en una línea y de 155 caracteres como máximo, cortado en un
    espacio para no partir palabras."""
    text = " ".join((text or "").split())
    if len(text) <= DESCRIPTION_LIMIT:
        return text
    cut = text[: DESCRIPTION_LIMIT - 1].rsplit(" ", 1)[0].rstrip(" ,.;:")
    return cut + "…"


def _absolute(path):
    return current_app.config["PUBLIC_BASE_URL"] + path


def _og_image_url(public_id):
    """Foto de Cloudinary en JPG de 1200 px. En JPG y no en formato automático
    porque algunos lectores de vistas previas no aceptan WebP ni AVIF. Si
    Cloudinary no está configurado, se usa la imagen por defecto en vez de
    dar un error 500: una página sin foto en la vista previa es mejor que
    una página que no carga."""
    try:
        url, _options = cloudinary_url(
            public_id, secure=True, fetch_format="jpg", quality="auto", crop="limit", width=OG_IMAGE_WIDTH
        )
        return url
    except Exception:  # noqa: BLE001 (cualquier fallo de configuración)
        logger.warning("No se pudo armar la URL de Cloudinary para la vista previa", exc_info=True)
        return None


def _page(status, title, description=DEFAULT_DESCRIPTION, path=None, og=None, json_ld=None):
    return {
        "status": status,
        "title": title,
        "description": description,
        "path": path,
        "og": og,
        "json_ld": json_ld,
    }


def _default_image():
    return {
        "url": _absolute(DEFAULT_IMAGE_PATH),
        "alt": DEFAULT_IMAGE_ALT,
        "width": DEFAULT_IMAGE_SIZE[0],
        "height": DEFAULT_IMAGE_SIZE[1],
    }


def _website_page(title, og_title, description, path):
    og = {"type": "website", "title": og_title, "image": _default_image()}
    return _page(200, title, description, path, og)


def _product_page(slug):
    """Las mismas reglas que GET /api/products/<slug>: si la API responde 404,
    la página también."""
    product = db.session.scalars(
        select(Product)
        .where(Product.slug == slug, *_visible_conditions())
        .options(
            selectinload(Product.images),
            selectinload(Product.options).selectinload(ProductOption.values),
            selectinload(Product.variants).selectinload(ProductVariant.option_values),
        )
    ).first()
    variants = _complete_variants(product) if product else []
    if not variants:
        return None

    description = _short_text(product.seo_description or product.subtitle or product.description)
    image = None
    if product.images:
        first = product.images[0]  # ya vienen ordenadas; la primera es la principal
        url = _og_image_url(first.public_id)
        if url:
            image = {"url": url, "alt": first.alt_text}
    # Precio más bajo, igual que el "Desde" de la tienda. Con campañas (4.8) se revisa.
    price = min(variant.price for variant, _values in variants)
    available = any(variant.stock > 0 for variant, _values in variants)
    og = {
        "type": "product",
        "title": product.name,
        "image": image or _default_image(),
        "price": f"{price:.2f}",
        "availability": "in stock" if available else "out of stock",
    }
    path = f"/producto/{product.slug}"
    json_ld = _product_json_ld(product, variants, description, path)
    return _page(200, _title(product.name), description or DEFAULT_DESCRIPTION, path, og, json_ld)


def _product_json_ld(product, variants, description, path):
    """Datos estructurados schema.org de Product (tarea 5.7), según la guía de
    Google para fragmentos de producto: nombre y al menos una oferta con precio,
    moneda y disponibilidad.

    Una oferta por cada precio distinto: "disponible" si alguna variante con ese
    precio tiene existencias. No se usa AggregateOffer porque Google la reserva
    para un producto que venden varias tiendas, no para variantes. Nunca va el
    SKU ni la cantidad (CLAUDE.md, Seguridad). Sin fotos del producto no se pone
    imagen: el logo no es una foto del producto."""
    url = _absolute(path)
    by_price = {}
    for variant, _values in variants:
        by_price[variant.price] = by_price.get(variant.price, False) or variant.stock > 0
    offers = [
        {
            "@type": "Offer",
            "price": f"{price:.2f}",
            "priceCurrency": "MXN",
            "availability": "https://schema.org/InStock" if in_stock else "https://schema.org/OutOfStock",
            "itemCondition": "https://schema.org/NewCondition",
            "url": url,
        }
        for price, in_stock in sorted(by_price.items())
    ]
    data = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": product.name,
        "url": url,
        "brand": {"@type": "Brand", "name": SITE_NAME},
        "offers": offers[0] if len(offers) == 1 else offers,
    }
    if description:
        data["description"] = description
    images = [image_url for image_url in (_og_image_url(image.public_id) for image in product.images) if image_url]
    if images:
        data["image"] = images
    return data


def _json_ld_script(data):
    """El JSON va dentro de <script>, donde escape() no sirve: un nombre con
    "</script>" cerraría la etiqueta y lo que siga se ejecutaría. Por eso <, >
    y & se escriben como \\u003c, \\u003e y \\u0026, que JSON lee igual."""
    text = json.dumps(data, ensure_ascii=False)
    text = text.replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
    return f'<script type="application/ld+json">{text}</script>'


def _category_page(slug):
    """Igual que la Tienda: una categoría sin productos visibles (contando sus
    subcategorías) no aparece en el menú y muestra "Página no encontrada"."""
    category = db.session.scalars(
        select(Category).where(Category.slug == slug).options(selectinload(Category.children))
    ).first()
    if category is None:
        return None
    ids = [category.id] + [child.id for child in category.children]
    visible = db.session.scalar(
        select(func.count(Product.id)).where(Product.category_id.in_(ids), *_visible_conditions())
    )
    if not visible:
        return None
    description = _short_text(category.seo_description or category.card_text) or _short_text(
        f"{category.name} de Vocaciones MHPVM, con envío a todo México."
    )
    return _website_page(_title(category.name), category.name, description, f"/categoria/{category.slug}")


def page_for(path):
    """Datos de la página para una dirección sin la barra inicial ni la final
    ("", "tienda", "producto/playera-modelo-3"). status 404 si no existe."""
    if path == "":
        return _website_page(STORE_NAME, STORE_NAME, DEFAULT_DESCRIPTION, "/")
    if path == "tienda":
        return _website_page(_title("Tienda"), "Tienda", DEFAULT_DESCRIPTION, "/tienda")
    if path == "admin" or path.startswith("admin/"):
        # El panel decide dentro de React (sesión y "Página no encontrada").
        return _page(200, _title("Panel de administración"))

    match = PRODUCT_PATH.fullmatch(path) or CATEGORY_PATH.fullmatch(path)
    if match:
        find = _product_page if path.startswith("producto/") else _category_page
        try:
            page = find(match.group(1))
        except SQLAlchemyError:
            # Si la base falla, se entrega la página con los datos generales y
            # React muestra su aviso de error al pedir la API.
            db.session.rollback()
            logger.exception("No se pudieron leer los datos de la página %s", path)
            return _page(200, STORE_NAME)
        if page:
            return page

    return _page(404, _title("Página no encontrada"))


def _meta(attribute, key, value):
    return f'<meta {attribute}="{key}" content="{escape(value)}" />'


def head_html(page):
    """Etiquetas del bloque SEO. Todo lo que viene de la base pasa por escape():
    un nombre con comillas o con <script> se muestra como texto y nunca se
    ejecuta en el navegador de quien visita."""
    tags = [f"<title>{escape(page['title'])}</title>", _meta("name", "description", page["description"])]
    if page["path"]:
        tags.append(f'<link rel="canonical" href="{escape(_absolute(page["path"]))}" />')
    og = page["og"]
    if og:
        image = og["image"]
        tags += [
            _meta("property", "og:site_name", SITE_NAME),
            _meta("property", "og:locale", "es_MX"),
            _meta("property", "og:type", og["type"]),
            _meta("property", "og:title", og["title"]),
            _meta("property", "og:description", page["description"]),
            _meta("property", "og:url", _absolute(page["path"])),
            _meta("property", "og:image", image["url"]),
            _meta("property", "og:image:alt", image["alt"]),
        ]
        if "width" in image:
            tags += [
                _meta("property", "og:image:width", str(image["width"])),
                _meta("property", "og:image:height", str(image["height"])),
            ]
        if og["type"] == "product":
            tags += [
                _meta("property", "product:price:amount", og["price"]),
                _meta("property", "product:price:currency", "MXN"),
                _meta("property", "product:availability", og["availability"]),
            ]
        tags.append(_meta("name", "twitter:card", "summary_large_image"))
    if page["json_ld"]:
        tags.append(_json_ld_script(page["json_ld"]))
    return "\n    ".join(tags)


def render_index(html, page):
    """Cambia el bloque SEO del index.html compilado. Si no encuentra las marcas
    (un dist/ compilado antes del paso 1), lo deja igual y lo anota."""
    new_html, count = SEO_BLOCK.subn(lambda _match: head_html(page), html, count=1)
    if count == 0:
        logger.warning("index.html no tiene las marcas <!-- seo:inicio --> y <!-- seo:fin -->")
    return new_html
