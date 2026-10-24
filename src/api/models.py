"""
Modelo de datos de la tienda (tarea 1.3).
Cada clase es una tabla de PostgreSQL. Las migraciones se generan a partir
de este archivo con: pipenv run migrate
"""
from datetime import datetime
from decimal import Decimal

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    MetaData,
    Numeric,
    String,
    Table,
    Text,
    UniqueConstraint,
    false,
    func,
    true,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

# Nombres fijos para índices y restricciones. Sin esto, PostgreSQL inventa
# nombres distintos en cada base y Alembic no puede borrarlos ni cambiarlos
# después de forma fiable (por ejemplo, entre la base local y la de Render).
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


db = SQLAlchemy(model_class=Base)


class TimestampMixin:
    # Fechas con zona horaria. La base pone la hora sola (server_default),
    # así no depende de que el código se acuerde de rellenarla.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


# ---------------------------------------------------------------------------
# Catálogo
# ---------------------------------------------------------------------------

class Category(TimestampMixin, db.Model):
    """Categoría o subcategoría. Una subcategoría tiene parent_id; una principal no.
    Solo dos niveles: eso se valida en el panel, no en la base."""
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    seo_description: Mapped[str | None] = mapped_column(String(160))
    card_text: Mapped[str | None] = mapped_column(String(80))
    image_public_id: Mapped[str | None] = mapped_column(String(255))
    # RESTRICT: no se puede borrar una categoría que tenga subcategorías.
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT"), index=True
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    parent: Mapped["Category | None"] = relationship(back_populates="children", remote_side=[id])
    children: Mapped[list["Category"]] = relationship(
        back_populates="parent", order_by="Category.sort_order"
    )
    products: Mapped[list["Product"]] = relationship(back_populates="category")


class Product(TimestampMixin, db.Model):
    """Producto. No tiene precio ni existencias: eso vive en sus variantes."""
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    slug: Mapped[str] = mapped_column(String(170), unique=True, nullable=False)
    subtitle: Mapped[str | None] = mapped_column(String(150))
    description: Mapped[str | None] = mapped_column(Text)
    seo_description: Mapped[str | None] = mapped_column(String(160))
    # RESTRICT: no se puede borrar una categoría que tenga productos.
    category_id: Mapped[int] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    # Nace oculto (false). Se muestra cuando la administradora lo activa.
    # Archivar un producto vendido es volver a ponerlo en false.
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    is_featured: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )

    category: Mapped["Category"] = relationship(back_populates="products")
    # passive_deletes: deja que PostgreSQL borre en cascada (ondelete="CASCADE").
    images: Mapped[list["ProductImage"]] = relationship(
        back_populates="product", cascade="all, delete-orphan",
        passive_deletes=True, order_by="ProductImage.sort_order",
    )
    options: Mapped[list["ProductOption"]] = relationship(
        back_populates="product", cascade="all, delete-orphan",
        passive_deletes=True, order_by="ProductOption.position",
    )
    variants: Mapped[list["ProductVariant"]] = relationship(
        back_populates="product", cascade="all, delete-orphan",
        passive_deletes=True, order_by="ProductVariant.position",
    )


class ProductImage(db.Model):
    """Foto de un producto. Se guarda el public_id de Cloudinary, no la URL,
    para pedir a Cloudinary el tamaño y formato que necesite cada pantalla."""
    __tablename__ = "product_images"

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    public_id: Mapped[str] = mapped_column(String(255), nullable=False)
    alt_text: Mapped[str] = mapped_column(String(150), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    product: Mapped["Product"] = relationship(back_populates="images")


class ProductOption(db.Model):
    """Opción de un producto, por ejemplo "Color" o "Talla". Máximo dos por
    producto: se valida en el panel."""
    __tablename__ = "product_options"
    __table_args__ = (UniqueConstraint("product_id", "name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(40), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    product: Mapped["Product"] = relationship(back_populates="options")
    values: Mapped[list["ProductOptionValue"]] = relationship(
        back_populates="option", cascade="all, delete-orphan",
        passive_deletes=True, order_by="ProductOptionValue.position",
    )


class ProductOptionValue(db.Model):
    """Valor de una opción, por ejemplo "Beige" o "G". position fija el orden
    en pantalla (M, G, EG), que no es alfabético."""
    __tablename__ = "product_option_values"
    __table_args__ = (
        UniqueConstraint("option_id", "value"),
        # Color en formato #RRGGBB, o vacío si la opción no es de color.
        CheckConstraint("swatch_hex ~ '^#[0-9A-Fa-f]{6}$'", name="swatch_hex_format"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    option_id: Mapped[int] = mapped_column(
        ForeignKey("product_options.id", ondelete="CASCADE"), nullable=False, index=True
    )
    value: Mapped[str] = mapped_column(String(40), nullable=False)
    swatch_hex: Mapped[str | None] = mapped_column(String(7))
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    option: Mapped["ProductOption"] = relationship(back_populates="values")


# Tabla de unión: qué valores tiene cada variante ("Beige / G" apunta a
# "Beige" y a "G"). No necesita clase propia porque solo guarda las dos llaves.
# RESTRICT en el valor: no se puede borrar "G" mientras una variante la use.
variant_option_values = Table(
    "variant_option_values",
    db.metadata,
    Column("variant_id", ForeignKey("product_variants.id", ondelete="CASCADE"), primary_key=True),
    Column(
        "option_value_id",
        ForeignKey("product_option_values.id", ondelete="RESTRICT"),
        primary_key=True,
        index=True,
    ),
)


class ProductVariant(TimestampMixin, db.Model):
    """Lo que de verdad se vende: carrito, pedidos y existencias apuntan aquí.
    El costo (cost) es interno: nunca debe salir en respuestas públicas."""
    __tablename__ = "product_variants"
    __table_args__ = (
        CheckConstraint("price > 0", name="price_positive"),
        CheckConstraint("cost >= 0", name="cost_not_negative"),
        CheckConstraint("stock >= 0", name="stock_not_negative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sku: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    cost: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    stock: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=true()
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    product: Mapped["Product"] = relationship(back_populates="variants")
    option_values: Mapped[list["ProductOptionValue"]] = relationship(
        secondary=variant_option_values
    )
