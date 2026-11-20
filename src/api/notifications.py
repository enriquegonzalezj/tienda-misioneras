"""
Qué correo sale en cada momento de un pedido o un donativo (tarea 5.2).

emails.py sabe mandar un correo; este archivo decide cuál toca y con qué datos.
Lo llaman:
- order_payments.py (webhook de Mercado Pago) y flask mark-paid (solo en
  local): order_paid(order), cuando un pedido pasa a pagado.
- donations.py (webhook): donation_paid(donation), cuando un donativo pasa a
  pagado.

Reglas (decisiones de Enrique, 20 nov):
- Se llama después del commit de la base: un correo nunca anuncia algo que no
  quedó guardado. Y solo en el paso a pagado: un aviso repetido de Mercado
  Pago responde already_done y no vuelve a llamar aquí. Además, cada correo
  lleva su clave de idempotencia (<evento>/<id>): si aun así se pidiera dos
  veces en 24 h, Resend lo manda una sola vez.
- Nunca lanza errores: un correo que no sale no puede hacer fallar el webhook
  (Mercado Pago reintentaría un pago que ya quedó guardado).
- Dos correos por evento: uno a quien paga (si responde, le llega a la tienda)
  y un aviso a la tienda (emails.STORE_EMAIL; si la tienda responde, le llega
  a quien pagó).
- El enlace con el token va solo en el correo de quien paga: es la llave de su
  pedido, la misma que ya tiene en pantalla. El aviso a la tienda lleva el
  enlace al panel, que pide sesión, y no lleva la dirección de envío (está en
  el panel).
- Los enlaces salen de PUBLIC_BASE_URL, nunca de la petición.
- Las horas, en la del centro de México: la ven igual la congregación y quien
  compra.
- En el registro, solo el tipo de correo y el id (nunca correo ni nombre).
"""
import logging

from flask import current_app

from api import emails
from api.admin_campaigns import MONTHS
from api.pricing import MEXICO_TZ

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Formatos para los correos
# ---------------------------------------------------------------------------

def money(amount):
    """$1,250.00, como formatPrice del frontend."""
    return f"${amount:,.2f}"


def mexico_datetime(moment):
    """20 de noviembre de 2026, 14:05 (hora del centro de México)."""
    local = moment.astimezone(MEXICO_TZ)
    return (
        f"{local.day} de {MONTHS[local.month - 1]} de {local.year}, "
        f"{local:%H:%M} (hora del centro de México)"
    )


def _phone(phone):
    """449 915 1459, como en la página del pedido."""
    if phone and len(phone) == 10:
        return f"{phone[:3]} {phone[3:6]} {phone[6:]}"
    return phone


def _link(path):
    return f"{current_app.config['PUBLIC_BASE_URL']}{path}"


# ---------------------------------------------------------------------------
# Datos de un pedido
# ---------------------------------------------------------------------------

def _order_items(order):
    items = []
    for item in order.items:
        line_total = item.unit_price * item.quantity
        list_total = item.list_unit_price * item.quantity
        items.append({
            "name": item.product_name,
            "variant_label": item.variant_label or "",
            "quantity": item.quantity,
            "line_total": money(line_total),
            # El precio normal tachado, solo si se cobró menos (campaña).
            "list_total": money(list_total) if list_total > line_total else None,
        })
    return items


def _order_totals(order):
    return {
        "subtotal": money(order.subtotal),
        "discount": money(order.discount_amount) if order.discount_amount > 0 else None,
        "shipping_method": order.shipping_method_name,
        "shipping_cost": "Gratis" if order.shipping_cost == 0 else money(order.shipping_cost),
        "shipping_discount": money(order.shipping_discount_amount) if order.shipping_discount_amount > 0 else None,
        "total": money(order.total),
    }


def _address_lines(order):
    """La dirección en renglones, como el bloque "Envío a" de /pedido/<token>."""
    street = f"{order.shipping_street} {order.shipping_exterior_number}"
    if order.shipping_interior_number:
        street += f", int. {order.shipping_interior_number}"
    lines = [
        order.shipping_recipient_name,
        street,
        f"Col. {order.shipping_neighborhood}",
        f"{order.shipping_postal_code} {order.shipping_municipality}, {order.shipping_state}",
        f"Tel. {_phone(order.shipping_phone)}",
    ]
    if order.shipping_references:
        lines.append(f"Referencias: {order.shipping_references}")
    return lines


# ---------------------------------------------------------------------------
# Eventos
# ---------------------------------------------------------------------------

def order_paid(order):
    """Pedido pagado: confirmación a quien compró y aviso a la tienda.
    Con el pedido ya guardado como pagado (después del commit)."""
    try:
        folio = f"MHP-{order.id:06d}"
        paid_at = mexico_datetime(order.paid_at)
        piece_count = sum(item.quantity for item in order.items)
        emails.send(
            order.email,
            f"Recibimos tu pago del pedido {folio}",
            "order_paid",
            {
                "folio": folio,
                "first_name": order.first_name,
                "paid_at": paid_at,
                "items": _order_items(order),
                **_order_totals(order),
                "address_lines": _address_lines(order),
                "link": _link(f"/pedido/{order.access_token}"),
            },
            log_ref=f"pago, pedido {order.id}",
            idempotency_key=f"order-paid/{order.id}",
        )
        emails.send(
            emails.STORE_EMAIL,
            f"Pedido pagado {folio}",
            "store_order_paid",
            {
                "folio": folio,
                "customer_name": f"{order.first_name} {order.last_name}",
                "customer_email": order.email,
                "paid_at": paid_at,
                "pieces": piece_count,
                "total": money(order.total),
                "shipping_method": order.shipping_method_name,
                "link": _link(f"/admin/pedidos/{order.id}"),
            },
            log_ref=f"aviso a la tienda, pedido {order.id}",
            idempotency_key=f"order-paid-store/{order.id}",
            reply_to=order.email,
        )
    except Exception:  # noqa: BLE001 - un correo nunca debe romper el pago
        logger.exception("No se pudieron preparar los correos del pedido %s", getattr(order, "id", "?"))


def donation_paid(donation):
    """Donativo pagado: agradecimiento a quien donó y aviso a la tienda.
    Con el donativo ya guardado como pagado (después del commit)."""
    try:
        folio = f"DON-{donation.id:06d}"
        paid_at = mexico_datetime(donation.paid_at)
        amount = money(donation.amount)
        emails.send(
            donation.email,
            f"Gracias por tu donativo {folio}",
            "donation_paid",
            {
                "folio": folio,
                "donor_name": donation.donor_name,
                "amount": amount,
                "paid_at": paid_at,
                "link": _link(f"/donativo/{donation.access_token}"),
            },
            log_ref=f"pago, donativo {donation.id}",
            idempotency_key=f"donation-paid/{donation.id}",
        )
        emails.send(
            emails.STORE_EMAIL,
            f"Donativo nuevo {folio}",
            "store_donation_paid",
            {
                "folio": folio,
                "donor_name": donation.donor_name,
                "donor_email": donation.email,
                "amount": amount,
                "paid_at": paid_at,
                "link": _link(f"/admin/donativos?q={folio}"),
            },
            log_ref=f"aviso a la tienda, donativo {donation.id}",
            idempotency_key=f"donation-paid-store/{donation.id}",
            reply_to=donation.email,
        )
    except Exception:  # noqa: BLE001
        logger.exception("No se pudieron preparar los correos del donativo %s", getattr(donation, "id", "?"))
