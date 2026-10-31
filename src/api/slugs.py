"""
Direcciones (slugs) de categorías y productos: /categoria/<slug> y /producto/<slug>.

Se generan con el nombre al crear y no cambian solas al renombrar, para no romper
enlaces ya compartidos (CLAUDE.md, Producto). Si la dirección ya existe, se le
añade -2, -3...
"""
import re
import unicodedata

from sqlalchemy import select

from api.models import db

# Minúsculas sin acentos y números, separados por un solo guion: "plumas-y-lapices".
SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def slugify(text, max_length):
    """"Plumas y lápices" -> "plumas-y-lapices". Quita acentos (la ñ queda en n)
    y cambia cualquier otro signo o espacio por un guion."""
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")
    return slug[:max_length].rstrip("-")


def is_valid_slug(slug, max_length):
    return len(slug) <= max_length and bool(SLUG_PATTERN.match(slug))


def unique_slug(model, base, max_length, exclude_id=None):
    """Devuelve `base` si está libre en la tabla de `model`; si no, base-2, base-3...
    `exclude_id` deja fuera el propio registro al editarlo."""
    query = select(model.slug).where(model.slug.startswith(base))
    if exclude_id is not None:
        query = query.where(model.id != exclude_id)
    taken = set(db.session.scalars(query))
    if base not in taken:
        return base
    number = 2
    while True:
        suffix = f"-{number}"
        candidate = base[: max_length - len(suffix)].rstrip("-") + suffix
        if candidate not in taken:
            return candidate
        number += 1
