"""
Modelo de datos de la tienda (tarea 1.3).
Cada clase es una tabla de PostgreSQL. Las migraciones se generan a partir
de este archivo con: pipenv run migrate
"""
from datetime import date, datetime
from decimal import Decimal

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
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


# ---------------------------------------------------------------------------
# Personas
# ---------------------------------------------------------------------------

class User(TimestampMixin, db.Model):
    """Cuenta de administradora o de clienta. El registro público siempre crea
    role="customer"; las administradoras solo se crean con un comando (1.5)."""
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('admin', 'customer')", name="role_valid"),
        # El correo se guarda siempre en minúsculas: así Ana@x.com y ana@x.com
        # no pueden ser dos cuentas distintas.
        CheckConstraint("email = lower(email)", name="email_lowercase"),
        # Teléfono de México: 10 dígitos, sin espacios ni guiones.
        CheckConstraint("phone ~ '^[0-9]{10}$'", name="phone_format"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, nullable=False)
    # Nunca la contraseña: solo su hash (se calcula en la tarea 1.5).
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(
        String(20), nullable=False, default="customer", server_default="customer"
    )
    first_name: Mapped[str] = mapped_column(String(80), nullable=False)
    last_name: Mapped[str] = mapped_column(String(80), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(10))
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=true()
    )
    # Cuándo aceptó el aviso de privacidad. Vacío en administradoras.
    privacy_accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Una sola dirección por clienta en la Etapa 1 (uselist=False).
    address: Mapped["Address | None"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan", passive_deletes=True
    )
    orders: Mapped[list["Order"]] = relationship(back_populates="user")
    donations: Mapped[list["Donation"]] = relationship(back_populates="user")


class Address(TimestampMixin, db.Model):
    """Dirección de envío guardada de una clienta. Los pedidos no apuntan aquí:
    copian la dirección al pagar, para que cambiarla no altere pedidos viejos."""
    __tablename__ = "addresses"
    __table_args__ = (
        CheckConstraint("phone ~ '^[0-9]{10}$'", name="phone_format"),
        CheckConstraint("postal_code ~ '^[0-9]{5}$'", name="postal_code_format"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # unique: una dirección por usuaria. Para permitir varias, se quita el unique.
    # CASCADE: si se borra la cuenta, se borra su dirección.
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    recipient_name: Mapped[str] = mapped_column(String(150), nullable=False)
    phone: Mapped[str] = mapped_column(String(10), nullable=False)
    street: Mapped[str] = mapped_column(String(150), nullable=False)
    exterior_number: Mapped[str] = mapped_column(String(20), nullable=False)
    interior_number: Mapped[str | None] = mapped_column(String(20))
    neighborhood: Mapped[str] = mapped_column(String(100), nullable=False)
    postal_code: Mapped[str] = mapped_column(String(5), nullable=False)
    municipality: Mapped[str] = mapped_column(String(100), nullable=False)
    # Uno de los 32 estados: la lista se valida en el servidor, no en la base.
    state: Mapped[str] = mapped_column(String(40), nullable=False)
    # "references" es palabra reservada de SQL; por eso este nombre.
    delivery_references: Mapped[str | None] = mapped_column(String(255))

    user: Mapped["User"] = relationship(back_populates="address")


class PasswordResetToken(db.Model):
    """Enlace para recuperar la contraseña (tarea 1.5). Se guarda solo el hash
    del token, nunca el token: quien llegue a leer la base no puede usar los
    enlaces. Sirve una sola vez (used_at) y caduca a la hora (expires_at)."""
    __tablename__ = "password_reset_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    # CASCADE: si se borra la cuenta, se borran sus enlaces.
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    # SHA-256 en hexadecimal: siempre 64 caracteres.
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


# ---------------------------------------------------------------------------
# Campañas
# ---------------------------------------------------------------------------

class Campaign(TimestampMixin, db.Model):
    """Campaña de descuento con fechas. Puede llevar un porcentaje, precios fijos
    por variante (CampaignVariant) o las dos cosas. En cada variante se cobra el
    precio más bajo entre el normal, el del porcentaje y el fijo: nunca se suman.
    Que no coincidan en fechas dos campañas con productos en común se valida en
    el panel; si aun así coinciden, el servidor aplica el precio más bajo.
    Como un pedido puede mezclar productos de dos campañas, cada renglón guarda
    la suya (OrderItem.campaign_id) y el pedido guarda la que descontó el envío
    (Order.shipping_campaign_id). Si dos descuentan el envío, se aplica el mayor."""
    __tablename__ = "campaigns"
    __table_args__ = (
        # customers: solo clientas con sesión iniciada. everyone: todas.
        CheckConstraint("audience IN ('customers', 'everyone')", name="audience_valid"),
        # store: el porcentaje vale para toda la tienda.
        # selected: solo para las variantes de CampaignVariant.
        CheckConstraint("scope IN ('store', 'selected')", name="scope_valid"),
        CheckConstraint("discount_percent BETWEEN 1 AND 100", name="discount_percent_range"),
        CheckConstraint("end_date >= start_date", name="dates_order"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    audience: Mapped[str] = mapped_column(
        String(20), nullable=False, default="customers", server_default="customers"
    )
    scope: Mapped[str] = mapped_column(
        String(20), nullable=False, default="store", server_default="store"
    )
    # Opcional: una campaña puede tener solo precios fijos.
    discount_percent: Mapped[int | None] = mapped_column(Integer)
    # El porcentaje también se aplica al envío (apagado por defecto).
    applies_to_shipping: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    # Días completos en hora de México, ambos incluidos (hasta las 23:59 del último).
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    # Para pausarla sin borrarla.
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=true()
    )

    items: Mapped[list["CampaignVariant"]] = relationship(
        back_populates="campaign", cascade="all, delete-orphan", passive_deletes=True
    )


class CampaignVariant(db.Model):
    """Variante incluida en una campaña. Con fixed_price, ese es su precio durante
    la campaña; sin fixed_price (solo en campañas "selected"), le toca el porcentaje."""
    __tablename__ = "campaign_variants"
    __table_args__ = (CheckConstraint("fixed_price > 0", name="fixed_price_positive"),)

    campaign_id: Mapped[int] = mapped_column(
        ForeignKey("campaigns.id", ondelete="CASCADE"), primary_key=True
    )
    variant_id: Mapped[int] = mapped_column(
        ForeignKey("product_variants.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    fixed_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))

    campaign: Mapped["Campaign"] = relationship(back_populates="items")
    variant: Mapped["ProductVariant"] = relationship()


# ---------------------------------------------------------------------------
# Pedidos
# ---------------------------------------------------------------------------

class Order(TimestampMixin, db.Model):
    """Pedido. Guarda una copia de los datos de la compradora, la dirección y los
    importes al momento de comprar: si después cambian, el pedido no cambia.
    El folio visible (MHP-000123) se calcula con el id; no se guarda."""
    __tablename__ = "orders"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled')",
            name="status_valid",
        ),
        CheckConstraint("email = lower(email)", name="email_lowercase"),
        CheckConstraint("phone ~ '^[0-9]{10}$'", name="phone_format"),
        CheckConstraint("shipping_phone ~ '^[0-9]{10}$'", name="shipping_phone_format"),
        CheckConstraint("shipping_postal_code ~ '^[0-9]{5}$'", name="shipping_postal_code_format"),
        CheckConstraint("subtotal >= 0", name="subtotal_not_negative"),
        CheckConstraint("discount_amount >= 0", name="discount_not_negative"),
        CheckConstraint("shipping_cost >= 0", name="shipping_cost_not_negative"),
        CheckConstraint("shipping_discount_amount >= 0", name="shipping_discount_not_negative"),
        CheckConstraint("total >= 0", name="total_not_negative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # Código largo y aleatorio para el enlace del pedido de una invitada
    # (/pedido/<access_token>). Con el id solo, cualquiera vería pedidos ajenos.
    access_token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending", server_default="pending"
    )

    # Compradora. user_id vacío = compró como invitada.
    # SET NULL: si borra su cuenta, el pedido se conserva sin enlace a ella.
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    first_name: Mapped[str] = mapped_column(String(80), nullable=False)
    last_name: Mapped[str] = mapped_column(String(80), nullable=False)
    email: Mapped[str] = mapped_column(String(254), nullable=False, index=True)
    phone: Mapped[str] = mapped_column(String(10), nullable=False)
    privacy_accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Copia de la dirección de envío.
    shipping_recipient_name: Mapped[str] = mapped_column(String(150), nullable=False)
    shipping_phone: Mapped[str] = mapped_column(String(10), nullable=False)
    shipping_street: Mapped[str] = mapped_column(String(150), nullable=False)
    shipping_exterior_number: Mapped[str] = mapped_column(String(20), nullable=False)
    shipping_interior_number: Mapped[str | None] = mapped_column(String(20))
    shipping_neighborhood: Mapped[str] = mapped_column(String(100), nullable=False)
    shipping_postal_code: Mapped[str] = mapped_column(String(5), nullable=False)
    shipping_municipality: Mapped[str] = mapped_column(String(100), nullable=False)
    shipping_state: Mapped[str] = mapped_column(String(40), nullable=False)
    shipping_references: Mapped[str | None] = mapped_column(String(255))
    shipping_method_name: Mapped[str] = mapped_column(String(100), nullable=False)

    # Importes, calculados siempre en el servidor.
    subtotal: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    # Suma de los descuentos de todos los renglones.
    discount_amount: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=0, server_default="0"
    )
    shipping_cost: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    # Campaña que descontó el envío. Vacío si el envío se cobró completo.
    # La campaña de cada producto va en OrderItem.campaign_id.
    # RESTRICT: una campaña usada en pedidos no se borra; se desactiva.
    shipping_campaign_id: Mapped[int | None] = mapped_column(
        ForeignKey("campaigns.id", ondelete="RESTRICT"), index=True
    )
    shipping_discount_amount: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=0, server_default="0"
    )
    total: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    # Reserva: las unidades se descuentan de stock al ir a pagar. Si el pedido
    # sigue pendiente después de esta hora, se cancela y las unidades vuelven.
    # 30 minutos; si se genera una ficha de OXXO, hasta que la ficha vence.
    reserved_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Mercado Pago. mp_payment_id único: si el webhook avisa dos veces del
    # mismo pago, la base rechaza procesarlo dos veces.
    mp_preference_id: Mapped[str | None] = mapped_column(String(100))
    mp_payment_id: Mapped[str | None] = mapped_column(String(50), unique=True)
    mp_status: Mapped[str | None] = mapped_column(String(30))
    mp_fee: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Cancelación (por ejemplo, reserva vencida) y reembolso si ya estaba pagado.
    cancel_reason: Mapped[str | None] = mapped_column(String(255))
    refunded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped["User | None"] = relationship(back_populates="orders")
    shipping_campaign: Mapped["Campaign | None"] = relationship()
    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", passive_deletes=True
    )


class OrderItem(db.Model):
    """Renglón de un pedido: una variante, cuántas y a qué precio. Copia nombre,
    SKU, precios y costo del momento de la compra, y la campaña que puso el precio."""
    __tablename__ = "order_items"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("unit_price > 0", name="unit_price_positive"),
        CheckConstraint("unit_price <= list_unit_price", name="unit_price_not_above_list"),
        # Un precio rebajado siempre tiene una campaña que lo explique.
        CheckConstraint(
            "campaign_id IS NOT NULL OR unit_price = list_unit_price",
            name="discount_needs_campaign",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # RESTRICT: la base impide borrar una variante que ya se vendió.
    variant_id: Mapped[int] = mapped_column(
        ForeignKey("product_variants.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    product_name: Mapped[str] = mapped_column(String(150), nullable=False)
    # "Beige / G". Vacío si el producto no tiene opciones.
    variant_label: Mapped[str | None] = mapped_column(String(100))
    sku: Mapped[str] = mapped_column(String(64), nullable=False)
    # Precio normal (el que sale tachado) y precio cobrado (con campaña, si hubo).
    list_unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    # Campaña que puso unit_price. Vacío = se cobró el precio normal.
    # RESTRICT: una campaña usada en pedidos no se borra; se desactiva.
    campaign_id: Mapped[int | None] = mapped_column(
        ForeignKey("campaigns.id", ondelete="RESTRICT"), index=True
    )
    # Costo de ese día, para el margen real de la Etapa 2.
    unit_cost: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)

    order: Mapped["Order"] = relationship(back_populates="items")
    variant: Mapped["ProductVariant"] = relationship()
    campaign: Mapped["Campaign | None"] = relationship()


# ---------------------------------------------------------------------------
# Donativos
# ---------------------------------------------------------------------------

class Donation(TimestampMixin, db.Model):
    """Donativo de monto libre. Va aparte del carrito: sin envío ni campañas."""
    __tablename__ = "donations"
    __table_args__ = (
        CheckConstraint("status IN ('pending', 'paid', 'cancelled')", name="status_valid"),
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint("email = lower(email)", name="email_lowercase"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    access_token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending", server_default="pending"
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    donor_name: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str] = mapped_column(String(254), nullable=False, index=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    privacy_accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    mp_preference_id: Mapped[str | None] = mapped_column(String(100))
    mp_payment_id: Mapped[str | None] = mapped_column(String(50), unique=True)
    mp_status: Mapped[str | None] = mapped_column(String(30))
    mp_fee: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped["User | None"] = relationship(back_populates="donations")
