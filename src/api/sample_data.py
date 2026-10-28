"""
Datos de ejemplo para desarrollar en local (tarea 3.2): las categorías y los
17 productos de las maquetas aprobadas, sin fotos. Los carga el comando
"flask seed-sample" (ver commands.py), que se niega a ejecutarse fuera de local.

No son productos reales: los nombres, precios y existencias salen de las
maquetas o son inventados. Los productos reales los suben las hermanas desde
el panel. Todos los SKU empiezan por MUESTRA- para reconocerlos.
"""
from decimal import Decimal

from sqlalchemy import select

from api.models import (
    Category,
    Product,
    ProductOption,
    ProductOptionValue,
    ProductVariant,
    db,
)

# Categorías: (slug, nombre, texto de la tarjeta de Inicio, slug de la madre).
CATEGORIES = [
    ("ropa", "Ropa", "Playeras", None),
    ("papeleria", "Papelería", "Libretas, plumas y lápices", None),
    ("libretas", "Libretas", None, "papeleria"),
    ("plumas-y-lapices", "Plumas y lápices", None, "papeleria"),
    ("accesorios", "Accesorios", "Stickers, botones y más", None),
]

BEIGE = ("Beige", "#EDE3D1")
ARENA = ("Arena", "#D2BF9B")
BLANCO = ("Blanco", "#FFFFFF")
GRIS = ("Gris", "#D9D9D9")


def _shirt(slug, name, model_code, colors, sold_out=()):
    """Playera con 2 colores y 3 tallas. sold_out: pares (color, talla) en cero."""
    variants = []
    for color, _hex in colors:
        for size in ("M", "G", "EG"):
            stock = 0 if (color, size) in sold_out else 5
            variants.append({
                "sku": f"MUESTRA-{model_code}-{color[:3].upper()}-{size}",
                "price": "250.00",
                "stock": stock,
                "values": {"Color": color, "Talla": size},
            })
    return {
        "slug": slug,
        "name": name,
        "category": "ropa",
        "options": [("Color", colors), ("Talla", [("M", None), ("G", None), ("EG", None)])],
        "variants": variants,
    }


def _single(slug, name, category, price, stock=10, card_subtitle=None, option=None):
    """Producto con una sola variante. option: (nombre, valor) si se quiere
    que la tarjeta diga, por ejemplo, "Color negro"."""
    values = {}
    options = []
    if option:
        options = [(option[0], [(option[1], None)])]
        values = {option[0]: option[1]}
    return {
        "slug": slug,
        "name": name,
        "category": category,
        "card_subtitle": card_subtitle,
        "options": options,
        "variants": [{
            "sku": f"MUESTRA-{slug.upper()}"[:64],
            "price": price,
            "stock": stock,
            "values": values,
        }],
    }


def _designs(slug, name, category, price, designs, card_subtitle=None):
    """Producto con una opción "Diseño" y el mismo precio en todos."""
    return {
        "slug": slug,
        "name": name,
        "category": category,
        "card_subtitle": card_subtitle,
        "options": [("Diseño", [(d, None) for d in designs])],
        "variants": [{
            "sku": f"MUESTRA-{slug.upper()}-{i + 1}"[:64],
            "price": price,
            "stock": 10,
            "values": {"Diseño": design},
        } for i, design in enumerate(designs)],
    }


# En el orden en que salen en la maqueta de Tienda (los más recientes primero).
# Se crean al revés para que el primero de la lista sea el más reciente.
PRODUCTS = [
    {
        **_shirt("playera-modelo-3", "Playera Modelo 3", "P3", [BEIGE, ARENA], sold_out={("Beige", "EG")}),
        "featured": True,
        "subtitle": "Amar y consolar: es mi vocación",
        "description": (
            "Playera de algodón. Al frente lleva el escudo de Vocaciones MHPVM "
            "y en la espalda la frase «Amar y consolar: es mi vocación»."
        ),
    },
    _shirt("playera-modelo-2", "Playera Modelo 2", "P2", [BEIGE, ARENA]),
    _shirt("playera-modelo-1", "Playera Modelo 1", "P1", [BLANCO, GRIS]),
    {
        "slug": "boton-amar-y-consolar",
        "name": "Botón Amar y consolar",
        "category": "accesorios",
        "featured": True,
        "options": [
            ("Tamaño", [("Chico", None), ("Grande", None)]),
            ("Diseño", [("Logo", None), ("Corazón", None), ("Lema", None)]),
        ],
        "variants": [
            {
                "sku": f"MUESTRA-BOTON-{size[0]}-{design[:3].upper()}",
                "price": price,
                "stock": 20,
                "values": {"Tamaño": size, "Diseño": design},
            }
            for size, price in (("Chico", "15.00"), ("Grande", "20.00"))
            for design in ("Logo", "Corazón", "Lema")
        ],
    },
    {
        **_designs("libreta-de-raya-con-monograma", "Libreta de raya con monograma", "libretas",
                   "60.00", ["Rombos", "Triángulos", "Cuadros"], card_subtitle="Varios diseños"),
        "featured": True,
    },
    _single("libreta-de-hoja-negra-grande", "Libreta de hoja negra grande", "libretas",
            "60.00", stock=0, option=("Tamaño", "Grande")),
    _single("libreta-de-hoja-negra-mini", "Libreta de hoja negra mini", "libretas",
            "20.00", option=("Tamaño", "Mini")),
    {
        **_single("stickers-de-vinil", "Stickers de vinil", "accesorios", "5.00", stock=100,
                  card_subtitle="Más de 30 diseños"),
        "featured": True,
    },
    _designs("plumas-decoradas", "Plumas decoradas", "plumas-y-lapices", "20.00",
             ["Panda", "Oso", "Fresa"], card_subtitle="Varios diseños"),
    {
        "slug": "plumas-de-gel",
        "name": "Plumas de gel",
        "category": "plumas-y-lapices",
        "card_subtitle": "Blanca, dorada o plateada",
        "options": [("Color", [("Blanca", "#FFFFFF"), ("Dorada", "#D4AF37"), ("Plateada", "#C0C0C0")])],
        "variants": [
            {"sku": f"MUESTRA-GEL-{color[:3].upper()}", "price": "15.00", "stock": 30, "values": {"Color": color}}
            for color in ("Blanca", "Dorada", "Plateada")
        ],
    },
    _designs("plumas-multicolor", "Plumas multicolor", "plumas-y-lapices", "30.00",
             ["Pastel", "Brillos", "Clásica"], card_subtitle="Varios diseños"),
    _single("cubre-webcam", "Cubre webcam", "accesorios", "20.00", option=("Color", "Negro")),
    # Los cinco siguientes no salen en la maqueta (que muestra 12 de 17): inventados.
    _designs("libreta-de-puntos", "Libreta de puntos", "libretas", "60.00", ["Azul", "Verde"]),
    _single("libreta-de-bolsillo", "Libreta de bolsillo", "libretas", "25.00", option=("Tamaño", "Bolsillo")),
    _single("lapices-de-colores", "Lápices de colores", "plumas-y-lapices", "35.00"),
    _designs("lapiz-con-borrador", "Lápiz con borrador", "plumas-y-lapices", "8.00",
             ["Liso", "Rayas", "Estrellas"]),
    _single("llavero-amar-y-consolar", "Llavero Amar y consolar", "accesorios", "40.00",
            option=("Color", "Azul")),
]


def load_sample_data():
    """Crea lo que falte y no toca lo que ya existe (busca por slug).
    Devuelve (categorías creadas, productos creados, productos que ya estaban)."""
    categories = {c.slug: c for c in db.session.scalars(select(Category))}
    created_categories = 0
    for position, (slug, name, card_text, parent_slug) in enumerate(CATEGORIES):
        if slug in categories:
            continue
        category = Category(
            slug=slug,
            name=name,
            card_text=card_text,
            parent=categories.get(parent_slug),
            sort_order=position,
        )
        db.session.add(category)
        categories[slug] = category
        created_categories += 1
    db.session.flush()

    existing = set(db.session.scalars(select(Product.slug)))
    created_products = 0
    skipped_products = 0
    for data in reversed(PRODUCTS):
        if data["slug"] in existing:
            skipped_products += 1
            continue
        product = Product(
            slug=data["slug"],
            name=data["name"],
            category=categories[data["category"]],
            subtitle=data.get("subtitle"),
            card_subtitle=data.get("card_subtitle"),
            description=data.get("description"),
            is_active=True,
            is_featured=data.get("featured", False),
        )
        db.session.add(product)

        values_by_option = {}
        for option_position, (option_name, values) in enumerate(data["options"]):
            option = ProductOption(product=product, name=option_name, position=option_position)
            db.session.add(option)
            values_by_option[option_name] = {}
            for value_position, (value, swatch_hex) in enumerate(values):
                option_value = ProductOptionValue(
                    option=option, value=value, swatch_hex=swatch_hex, position=value_position
                )
                db.session.add(option_value)
                values_by_option[option_name][value] = option_value

        for variant_position, variant in enumerate(data["variants"]):
            db.session.add(ProductVariant(
                product=product,
                sku=variant["sku"],
                price=Decimal(variant["price"]),
                stock=variant["stock"],
                position=variant_position,
                option_values=[
                    values_by_option[name][value] for name, value in variant["values"].items()
                ],
            ))
        # flush tras cada producto: el id sigue el orden de creación y, como
        # todos comparten la misma hora (una sola transacción), decide el orden.
        db.session.flush()
        created_products += 1

    db.session.commit()
    return created_categories, created_products, skipped_products
