"""
Qué correo sale en cada momento de un pedido o un donativo (tarea 5.2).

emails.py sabe mandar un correo; este archivo decide cuál toca y con qué datos.
Lo llaman:
- order_payments.py (webhook de Mercado Pago) y flask mark-paid (solo en
  local): order_paid(order), cuando un pedido pasa a pagado;
  order_refunded_late(order, charge), cuando un pago llega de un pedido ya
  cancelado y se devuelve; order_refunded_duplicate(order, charge), cuando un
  pedido ya pagado recibe otro pago y se devuelve.
- donations.py (webhook): donation_paid(donation), cuando un donativo pasa a
  pagado; donation_refunded_duplicate(donation, charge), cuando un donativo ya
  pagado recibe otro pago y se devuelve.
- admin_orders.py (panel): order_shipped(order) al marcarlo como enviado,
  order_tracking(order) al poner o cambiar la guía de un pedido ya enviado,
  order_delivered(order) al marcarlo como entregado y order_cancelled(order)
  al cancelarlo.

Reglas (decisiones de Enrique, 20 nov):
- Se llama después del commit de la base: un correo nunca anuncia algo que no
  quedó guardado. Y solo en el cambio que lo provoca: un aviso repetido de
  Mercado Pago responde already_done y no vuelve a llamar aquí. Además, cada
  correo lleva su clave de idempotencia (<evento>/<id>...): si aun así se
  pidiera dos veces en 24 h, Resend lo manda una sola vez. En el envío, la
  entrega y la guía, la clave lleva también la hora del cambio: si la
  congregación se equivoca, lo regresa y lo vuelve a marcar, sale un correo
  nuevo con los datos buenos (con la misma clave y otro contenido, Resend lo
  rechazaría).
- Nunca lanza errores: un correo que no sale no puede hacer fallar el webhook
  (Mercado Pago reintentaría un pago que ya quedó guardado) ni un cambio del
  panel que ya quedó guardado.
- A quien paga le llega cada correo (si responde, le llega a la tienda). A la
  tienda (emails.STORE_EMAIL) le llega un aviso de cada pago y de cada
  reembolso automático, porque ahí el dinero se mueve sin que nadie haga nada
  (si la tienda responde, le llega a quien pagó). De lo que la congregación
  hace en el panel no le llega aviso: lo hizo ella.
- El enlace con el token va solo en los correos de quien paga: es la llave de
  su pedido, la misma que ya tiene en pantalla. Los avisos a la tienda llevan
  el enlace al panel, que pide sesión, y no llevan la dirección de envío (está
  en el panel).
- Los enlaces salen de PUBLIC_BASE_URL, nunca de la petición.
- Las horas, en la del centro de México: la ven igual la congregación y quien
  compra.
- En el registro, solo el tipo de correo y el id (nunca correo ni nombre).
"""
import logging
from datetime import datetime, timezone

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


# ---------------------------------------------------------------------------
# Datos comunes de los correos que siguen
# ---------------------------------------------------------------------------

def _stamp(moment):
    """Hora del cambio en segundos, para la clave de idempotencia."""
    return int(moment.timestamp())


def _order_basics(order):
    return {
        "folio": f"MHP-{order.id:06d}",
        "first_name": order.first_name,
        "link": _link(f"/pedido/{order.access_token}"),
    }


def _send_order(order, subject, template, context, *, event, key):
    """Correo a quien compró. event va al registro; key, a Resend."""
    data = _order_basics(order)
    data.update(context)
    emails.send(
        order.email,
        f"{subject} {data['folio']}",
        template,
        data,
        log_ref=f"{event}, pedido {order.id}",
        idempotency_key=key,
    )


def _store_refund(*, kind, record_id, folio, name, email, amount, reason, link, key):
    """Aviso a la tienda de un reembolso automático (pedido o donativo)."""
    emails.send(
        emails.STORE_EMAIL,
        f"Reembolso automático {folio}",
        "store_refund",
        {
            "folio": folio,
            "name": name,
            "email": email,
            "amount": amount,
            "reason": reason,
            "link": link,
        },
        log_ref=f"aviso a la tienda, reembolso, {kind} {record_id}",
        idempotency_key=key,
        reply_to=email,
    )


# ---------------------------------------------------------------------------
# Eventos del panel (admin_orders.py)
# ---------------------------------------------------------------------------

def order_shipped(order):
    """Marcado como enviado: "Tu pedido va en camino", con la guía si la hay."""
    try:
        _send_order(
            order,
            "Tu pedido va en camino",
            "order_shipped",
            {
                "shipped_at": mexico_datetime(order.shipped_at),
                "shipping_method": order.shipping_method_name,
                "tracking_number": order.tracking_number or "",
                "address_lines": _address_lines(order),
            },
            event="envío",
            key=f"order-shipped/{order.id}/{_stamp(order.shipped_at)}",
        )
    except Exception:  # noqa: BLE001 - un correo nunca debe romper el panel
        logger.exception("No se pudo preparar el correo de envío del pedido %s", getattr(order, "id", "?"))


def order_tracking(order):
    """Guía puesta o cambiada en un pedido ya enviado o entregado."""
    try:
        _send_order(
            order,
            "Número de guía de tu pedido",
            "order_tracking",
            {
                "shipping_method": order.shipping_method_name,
                "tracking_number": order.tracking_number,
            },
            event="guía",
            key=f"order-tracking/{order.id}/{_stamp(datetime.now(timezone.utc))}",
        )
    except Exception:  # noqa: BLE001
        logger.exception("No se pudo preparar el correo de la guía del pedido %s", getattr(order, "id", "?"))


def order_delivered(order):
    """Marcado como entregado: confirma la entrega y recuerda cómo devolver."""
    try:
        _send_order(
            order,
            "Tu pedido se entregó",
            "order_delivered",
            {
                "delivered_at": mexico_datetime(order.delivered_at),
                "returns_link": _link("/envios-y-devoluciones"),
            },
            event="entrega",
            key=f"order-delivered/{order.id}/{_stamp(order.delivered_at)}",
        )
    except Exception:  # noqa: BLE001
        logger.exception("No se pudo preparar el correo de entrega del pedido %s", getattr(order, "id", "?"))


def order_cancelled(order):
    """Cancelado desde el panel. refunded: se devolvió el pago (ahora o antes,
    desde Mercado Pago); sin pago de Mercado Pago (pedido de flask mark-paid,
    solo en local), el correo solo dice que se canceló."""
    try:
        _send_order(
            order,
            "Cancelamos tu pedido",
            "order_cancelled",
            {
                "refunded": order.refunded_at is not None,
                "total": money(order.total),
            },
            event="cancelación",
            key=f"order-cancelled/{order.id}",
        )
    except Exception:  # noqa: BLE001
        logger.exception("No se pudo preparar el correo de cancelación del pedido %s", getattr(order, "id", "?"))


# ---------------------------------------------------------------------------
# Reembolsos automáticos (webhook de Mercado Pago)
# ---------------------------------------------------------------------------

LATE_REASON = "El pago llegó cuando el pedido ya estaba cancelado."
DUPLICATE_ORDER_REASON = "El pedido ya estaba pagado y llegó un segundo pago."
DUPLICATE_DONATION_REASON = "El donativo ya estaba pagado y llegó un segundo pago."


def _order_refund(order, charge, *, late):
    folio = f"MHP-{order.id:06d}"
    amount = money(charge.amount)
    event = "reembolso tardío" if late else "reembolso repetido"
    # La orden de Mercado Pago reembolsada identifica el reembolso: un pedido
    # puede recibir más de un pago repetido.
    _send_order(
        order,
        "Te devolvimos tu pago del pedido",
        "order_refunded",
        {"late": late, "amount": amount},
        event=event,
        key=f"order-refund/{charge.order_id}",
    )
    _store_refund(
        kind="pedido",
        record_id=order.id,
        folio=folio,
        name=f"{order.first_name} {order.last_name}",
        email=order.email,
        amount=amount,
        reason=LATE_REASON if late else DUPLICATE_ORDER_REASON,
        link=_link(f"/admin/pedidos/{order.id}"),
        key=f"order-refund-store/{charge.order_id}",
    )


def order_refunded_late(order, charge):
    """Pago que llegó de un pedido cancelado (vencido sin unidades o
    sustituido) y se devolvió completo."""
    try:
        _order_refund(order, charge, late=True)
    except Exception:  # noqa: BLE001
        logger.exception("No se pudieron preparar los correos del reembolso del pedido %s", getattr(order, "id", "?"))


def order_refunded_duplicate(order, charge):
    """Segundo pago de un pedido que ya estaba pagado, devuelto completo."""
    try:
        _order_refund(order, charge, late=False)
    except Exception:  # noqa: BLE001
        logger.exception("No se pudieron preparar los correos del reembolso del pedido %s", getattr(order, "id", "?"))


def donation_refunded_duplicate(donation, charge):
    """Segundo pago de un donativo que ya estaba pagado, devuelto completo."""
    try:
        folio = f"DON-{donation.id:06d}"
        amount = money(charge.amount)
        emails.send(
            donation.email,
            f"Te devolvimos un pago repetido del donativo {folio}",
            "donation_refunded",
            {
                "folio": folio,
                "donor_name": donation.donor_name,
                "amount": amount,
                "link": _link(f"/donativo/{donation.access_token}"),
            },
            log_ref=f"reembolso repetido, donativo {donation.id}",
            idempotency_key=f"donation-refund/{charge.order_id}",
        )
        _store_refund(
            kind="donativo",
            record_id=donation.id,
            folio=folio,
            name=donation.donor_name,
            email=donation.email,
            amount=amount,
            reason=DUPLICATE_DONATION_REASON,
            link=_link(f"/admin/donativos?q={folio}"),
            key=f"donation-refund-store/{charge.order_id}",
        )
    except Exception:  # noqa: BLE001
        logger.exception("No se pudieron preparar los correos del reembolso del donativo %s", getattr(donation, "id", "?"))
