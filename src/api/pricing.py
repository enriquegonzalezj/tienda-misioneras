"""
Precios con campañas de descuento (tarea 4.8).

Un solo cálculo para todo lo que muestra o cobra un precio: catálogo, ficha,
carrito, /pago, el pedido (checkout.py) y el HTML para buscadores y redes
(seo.py). Si cada uno calculara a su manera, el total del carrito y el del
pedido podrían no coincidir.

Reglas (CLAUDE.md, Reglas de negocio, "Campañas de descuento"):
- Una campaña vale los días completos de start_date a end_date, ambos
  incluidos, en hora de México (America/Mexico_City), aunque el servidor
  cuente en UTC. Solo cuentan las activas (is_active).
- Público: "everyone" para todas; "customers" solo con sesión de cliente
  (auth.optional_customer). Google y las redes ven solo las de "everyone".
- En cada variante se cobra el precio más bajo entre el normal, el del
  porcentaje y el fijo de todas las campañas que le tocan: nunca se suman.
  El porcentaje se redondea al centavo (decisión de Enrique, 13 nov).
- Envío: cada campaña puede llevar su propio porcentaje de envío (100 = gratis).
  Una de toda la tienda lo descuenta siempre; una de productos seleccionados,
  solo si el pedido lleva alguno de sus productos. Si dos lo descuentan, el
  mayor. Nunca se suman.
- A igualdad de precio o de descuento gana la campaña con el id menor, para
  que el resultado no cambie entre una petición y otra.

Uso:
    book = PriceBook.for_request()   # según la sesión de quien pide
    book = PriceBook.for_public()    # solo campañas para todas (seo.py)
    price, campaign = book.variant_price(variant)
    discount, campaign = book.shipping_discount(shipping_cost, variant_ids)
"""
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from api.auth import optional_customer
from api.models import Campaign, db

# En Windows, zoneinfo necesita el paquete tzdata (está en el Pipfile).
MEXICO_TZ = ZoneInfo("America/Mexico_City")
CENT = Decimal("0.01")


def today_in_mexico(now=None):
    """La fecha de hoy en México. Las campañas se guardan por días, sin hora."""
    now = now or datetime.now(timezone.utc)
    return now.astimezone(MEXICO_TZ).date()


def percent_off(amount, percent):
    """amount con percent % de descuento, redondeado al centavo."""
    return (amount * (100 - percent) / 100).quantize(CENT, rounding=ROUND_HALF_UP)


def active_campaigns(include_customers, today=None):
    """Campañas activas que valen hoy, con sus variantes, de menor a mayor id.
    include_customers: True si quien pide tiene sesión de cliente."""
    today = today or today_in_mexico()
    query = (
        select(Campaign)
        .where(
            Campaign.is_active.is_(True),
            Campaign.start_date <= today,
            Campaign.end_date >= today,
        )
        .options(selectinload(Campaign.items))
        .order_by(Campaign.id)
    )
    if not include_customers:
        query = query.where(Campaign.audience == "everyone")
    return db.session.scalars(query).all()


class PriceBook:
    """Las campañas que valen para una petición, listas para preguntar el
    precio de cualquier variante sin volver a la base."""

    def __init__(self, campaigns):
        self.campaigns = list(campaigns)
        # variant_id -> [(campaña, precio fijo o None)], de las campañas que la nombran.
        self._listed = {}
        for campaign in self.campaigns:
            for item in campaign.items:
                self._listed.setdefault(item.variant_id, []).append((campaign, item.fixed_price))

    @classmethod
    def for_request(cls, today=None):
        """Según la sesión: con cuenta de cliente, también "Solo clientas con cuenta"."""
        return cls(active_campaigns(optional_customer() is not None, today))

    @classmethod
    def for_public(cls, today=None):
        """Solo las campañas para todas: lo que ve quien no tiene sesión."""
        return cls(active_campaigns(False, today))

    def _candidates(self, variant):
        """(precio, campaña) que cada campaña le daría a la variante."""
        normal = variant.price
        listed = {campaign.id: fixed for campaign, fixed in self._listed.get(variant.id, [])}
        for campaign in self.campaigns:
            in_campaign = campaign.scope == "store" or campaign.id in listed
            if not in_campaign:
                continue
            if campaign.discount_percent is not None:
                yield percent_off(normal, campaign.discount_percent), campaign
            fixed = listed.get(campaign.id)
            if fixed is not None:
                yield fixed, campaign

    def variant_price(self, variant):
        """(precio que se cobra, campaña que lo puso). Sin rebaja: (precio normal, None).
        Nunca más que el normal ni menos de un centavo."""
        best_price, best_campaign = variant.price, None
        for price, campaign in self._candidates(variant):
            price = max(price, CENT)
            if price < best_price:  # el primero gana los empates: id menor
                best_price, best_campaign = price, campaign
        return best_price, best_campaign

    def sale_price(self, variant):
        """El precio rebajado como texto para la API, o None si no hay rebaja."""
        price, campaign = self.variant_price(variant)
        return f"{price:.2f}" if campaign is not None else None

    def shipping_discount(self, shipping_cost, variant_ids):
        """(descuento del envío, campaña), o (0, None). variant_ids: las variantes
        que van en el pedido (las disponibles), para las campañas de productos
        seleccionados."""
        variant_ids = set(variant_ids)
        best_amount, best_campaign = Decimal("0"), None
        if shipping_cost <= 0:
            return best_amount, best_campaign
        for campaign in self.campaigns:
            percent = campaign.shipping_discount_percent
            if percent is None:
                continue
            if campaign.scope == "selected" and not variant_ids & {i.variant_id for i in campaign.items}:
                continue
            amount = shipping_cost - percent_off(shipping_cost, percent)
            if amount > best_amount:
                best_amount, best_campaign = amount, campaign
        return best_amount, best_campaign
