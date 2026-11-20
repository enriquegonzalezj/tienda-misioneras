"""
Pedidos en el panel de administración (tarea 5.5, commit 102).

La congregación ve aquí todos los pedidos, /admin/pedidos (lista) y
/admin/pedidos/<id> (detalle), y los marca como enviados y entregados.

Reglas (decisiones de Enrique del 14 nov):
- La lista muestra todos los pedidos, también los pendientes y los cancelados
  (vencidos y sustituidos), para ver los carritos abandonados. Filtros por
  estado: to_ship (pagados, "Por enviar"), pending, shipped, delivered,
  cancelled y all (por defecto). Buscador por folio (MHP-000123 o 123), nombre o
  correo. 25 por página, más recientes primero, como el Inventario.
- Estados que cambia la congregación: pagado -> enviado -> entregado, y un paso
  atrás por si se equivocó (entregado -> enviado, enviado -> pagado). Ir atrás
  borra la fecha de ese paso; el número de guía se conserva.
- Pendiente y cancelado no se tocan aquí: pendiente -> cancelado lo hace la
  tienda sola y pendiente -> pagado, el webhook de Mercado Pago (4.6).
- Cancelar un pedido pagado (tarea 4.6, decisiones de Enrique del 18 y 19 nov):
  solo pagado y sin enviar (uno enviado vuelve antes a pagado con "Volver a"),
  reembolso total por Mercado Pago (sin parciales), las unidades vuelven a las
  existencias y el pedido queda cancelado con refunded_at. Ver cancel_order.
- Número de guía opcional (hasta 60 caracteres). Si se escribe, la clienta lo
  ve en /pedido/<token> (commit 104).
- Cada cambio de estado manda el estado que se veía en pantalla
  (current_status). Si otra persona lo cambió mientras tanto, 409 sin tocar
  nada, como el Inventario con "previous". La fila del pedido se bloquea
  (FOR UPDATE) mientras cambia.
- Correos (tarea 5.2, notifications.py), después de guardar: al marcarlo como
  enviado (con la guía si la hay), al poner o cambiar la guía de un pedido ya
  enviado o entregado, al marcarlo como entregado y al cancelarlo. Ir un paso
  atrás no manda nada.

Aquí sí salen SKU, ids y datos completos de la compradora: solo con sesión de
administración. Nunca el costo (unit_cost, para la Etapa 2) ni datos de pago.

Todas las rutas llevan @admin_required (sesión de administración y, en POST y
PUT, la cabecera X-CSRF-TOKEN).
"""
import logging
import re
from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request
from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import selectinload

from api import notifications
from api.admin_products import _like_pattern, _money
from api.auth import admin_required
from api.checkout import REPLACED_REASON, STORE_CANCEL_REASON, _folio
from api.models import Order, OrderItem, ProductVariant, db
from api.payments import refund_order
from api.reservations import EXPIRED_REASON, release_expired_reservations
from api.utils import APIException

logger = logging.getLogger(__name__)

admin_orders = Blueprint("admin_orders", __name__)

PAGE_SIZE = 25  # como el Inventario
MAX_OFFSET = 100_000
SEARCH_MAX = 100
TRACKING_MAX = 60  # como la columna de models.py
# Mercado Pago solo reembolsa dentro de los 180 días posteriores a la
# aprobación del pago (documentación de reembolsos, verificada el 19 nov).
REFUND_WINDOW = timedelta(days=180)
REFUND_FAILED = (
    "Mercado Pago no pudo hacer el reembolso y el pedido no se canceló. Revisa que la cuenta de "
    "Mercado Pago tenga saldo disponible para devolver el importe e intenta de nuevo en unos minutos."
)

# Filtro de la lista -> estado guardado (None = todos).
FILTERS = {
    "all": None,
    "to_ship": "paid",
    "pending": "pending",
    "shipped": "shipped",
    "delivered": "delivered",
    "cancelled": "cancelled",
}
# Folio como sale en la tienda (MHP-000123) o solo el número (123).
FOLIO_PATTERN = re.compile(r"^(?:MHP-?)?0*([0-9]{1,9})$", re.IGNORECASE)
# Caracteres de control (saltos de línea, tabuladores...): no van en una guía.
CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")

# Pasos que puede dar la congregación: (estado actual, estado nuevo).
FORWARD = {"paid": "shipped", "shipped": "delivered"}
BACKWARD = {"delivered": "shipped", "shipped": "paid"}
STATUS_WORDS = {
    "paid": "pagado",
    "shipped": "enviado",
    "delivered": "entregado",
}


# ---------------------------------------------------------------------------
# Respuestas
# ---------------------------------------------------------------------------

def _iso(value):
    return value.isoformat() if value else None


def _cancel_flags(order):
    cancelled = order.status == "cancelled"
    return {
        "cancel_reason": order.cancel_reason if cancelled else None,
        "expired": cancelled and order.cancel_reason == EXPIRED_REASON,
        "replaced": cancelled and order.cancel_reason == REPLACED_REASON,
        "cancelled_by_store": cancelled and order.cancel_reason == STORE_CANCEL_REASON,
        # Pago devuelto: cancelado desde el panel, pago tardío o reembolso
        # hecho directamente en Mercado Pago (lo anota el webhook).
        "refunded": order.refunded_at is not None,
    }


def _refund_needed(order):
    """True si al cancelar hay que pedir el reembolso a Mercado Pago: el pedido
    tiene un pago de Mercado Pago que aún no se devolvió. Sin pago guardado (un
    pedido de flask mark-paid, solo en local) se cancela sin reembolso."""
    return order.mp_payment_id is not None and order.refunded_at is None


def _summary(order):
    return {
        "id": order.id,
        "folio": _folio(order),
        "status": order.status,
        **_cancel_flags(order),
        "created_at": _iso(order.created_at),
        "customer_name": f"{order.first_name} {order.last_name}",
        "email": order.email,
        "has_account": order.user_id is not None,
        "item_count": sum(item.quantity for item in order.items),
        "total": _money(order.total),
        "shipping_method": order.shipping_method_name,
        "tracking_number": order.tracking_number,
    }


def _campaign_json(campaign):
    return {"id": campaign.id, "name": campaign.name} if campaign is not None else None


def _detail(order):
    return {
        "id": order.id,
        "folio": _folio(order),
        "status": order.status,
        **_cancel_flags(order),
        "created_at": _iso(order.created_at),
        "reserved_until": _iso(order.reserved_until) if order.status == "pending" else None,
        "paid_at": _iso(order.paid_at),
        "shipped_at": _iso(order.shipped_at),
        "delivered_at": _iso(order.delivered_at),
        "refunded_at": _iso(order.refunded_at),
        "tracking_number": order.tracking_number,
        "has_account": order.user_id is not None,
        # Lo que se puede hacer desde el panel (None = nada).
        "next_status": FORWARD.get(order.status),
        "previous_status": BACKWARD.get(order.status),
        # Cancelar (tarea 4.6): solo un pedido pagado sin enviar; refund_on_cancel
        # dice si al cancelarlo se devuelve el dinero por Mercado Pago.
        "can_cancel": order.status == "paid",
        "refund_on_cancel": order.status == "paid" and _refund_needed(order),
        "items": [
            {
                "name": item.product_name,
                "variant_label": item.variant_label,
                "sku": item.sku,
                "quantity": item.quantity,
                "list_unit_price": _money(item.list_unit_price),
                "unit_price": _money(item.unit_price),
                "line_total": _money(item.unit_price * item.quantity),
                "campaign": _campaign_json(item.campaign),
            }
            for item in order.items
        ],
        "subtotal": _money(order.subtotal),
        "discount_amount": _money(order.discount_amount),
        "shipping": {
            "method": order.shipping_method_name,
            "cost": _money(order.shipping_cost),
            "discount": _money(order.shipping_discount_amount),
            "campaign": _campaign_json(order.shipping_campaign),
        },
        "total": _money(order.total),
        "contact": {
            "first_name": order.first_name,
            "last_name": order.last_name,
            "email": order.email,
            "phone": order.phone,
        },
        "shipping_address": {
            "recipient_name": order.shipping_recipient_name,
            "phone": order.shipping_phone,
            "street": order.shipping_street,
            "exterior_number": order.shipping_exterior_number,
            "interior_number": order.shipping_interior_number,
            "neighborhood": order.shipping_neighborhood,
            "postal_code": order.shipping_postal_code,
            "municipality": order.shipping_municipality,
            "state": order.shipping_state,
            "references": order.shipping_references,
        },
    }


def _load(order_id, lock=False):
    query = select(Order).where(Order.id == order_id)
    if lock:
        # Solo la fila del pedido (no sus renglones): of=Order evita que
        # PostgreSQL intente bloquear también las tablas de selectinload.
        query = query.with_for_update(of=Order)
    order = db.session.scalar(query)
    if order is None:
        raise APIException("Pedido no encontrado.", status_code=404)
    return order


def _detail_response(order_id, message=None):
    db.session.expire_all()  # que la respuesta lea lo que de verdad quedó guardado
    order = db.session.scalar(
        select(Order)
        .where(Order.id == order_id)
        .options(
            selectinload(Order.items).selectinload(OrderItem.campaign),
            selectinload(Order.shipping_campaign),
        )
    )
    body = {"order": _detail(order)}
    if message:
        body["message"] = message
    return jsonify(body), 200


# ---------------------------------------------------------------------------
# Validación
# ---------------------------------------------------------------------------

def _json_body():
    # Solo JSON, como en el resto del panel: un formulario de otra web no puede mandarlo.
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise APIException("Faltan los datos de la petición.", status_code=400)
    return data


def _offset():
    raw = request.args.get("offset")
    if raw is None or raw == "":
        return 0
    if not raw.isdigit() or int(raw) > MAX_OFFSET:
        raise APIException("El parámetro offset no es válido.", status_code=400)
    return int(raw)


def _tracking_number(data):
    """La guía como se guarda: texto limpio o None. Lanza 400 con el error bajo el campo."""
    raw = data.get("tracking_number")
    if raw is None:
        return None
    if not isinstance(raw, str):
        raise APIException(
            "Revisa los datos marcados.", status_code=400,
            payload={"errors": {"tracking_number": "Escribe el número de guía como texto."}},
        )
    value = raw.strip()
    if CONTROL_CHARS.search(value):
        raise APIException(
            "Revisa los datos marcados.", status_code=400,
            payload={"errors": {"tracking_number": "El número de guía no puede llevar saltos de línea."}},
        )
    if len(value) > TRACKING_MAX:
        raise APIException(
            "Revisa los datos marcados.", status_code=400,
            payload={"errors": {"tracking_number": f"Escribe {TRACKING_MAX} caracteres como máximo."}},
        )
    return value or None


def _check_current_status(order, data):
    """El estado que se veía en pantalla tiene que ser el de la base: si otra
    persona lo cambió mientras tanto, no se toca nada."""
    current = data.get("current_status")
    if not isinstance(current, str) or current not in ("pending", "paid", "shipped", "delivered", "cancelled"):
        raise APIException("Falta el estado del pedido que estabas viendo. Recarga la página.", status_code=400)
    if current != order.status:
        db.session.rollback()
        raise APIException(
            "El pedido cambió mientras lo veías. Revisa su estado actual.",
            status_code=409,
            payload={"code": "status_changed", "status": order.status},
        )


# ---------------------------------------------------------------------------
# Rutas
# ---------------------------------------------------------------------------

@admin_orders.route("/orders", methods=["GET"])
@admin_required
def list_orders():
    """Lista de pedidos, 25 por página, más recientes primero.

    Filtros (todos opcionales):
      status   all (por defecto), to_ship, pending, shipped, delivered o cancelled
      q        folio (MHP-000123 o 123), nombre o correo
      offset   desde dónde (0, 25, 50...)
    """
    release_expired_reservations()  # un pedido vencido sale ya cancelado
    conditions = []

    status_filter = request.args.get("status") or "all"
    if status_filter not in FILTERS:
        raise APIException("El estado pedido no es válido.", status_code=400)
    if FILTERS[status_filter] is not None:
        conditions.append(Order.status == FILTERS[status_filter])

    search = (request.args.get("q") or "").strip()
    if len(search) > SEARCH_MAX:
        raise APIException("La búsqueda es demasiado larga.", status_code=400)
    if search:
        pattern = _like_pattern(search)
        matches = [
            func.concat(Order.first_name, " ", Order.last_name).ilike(pattern, escape="\\"),
            Order.email.ilike(pattern, escape="\\"),
        ]
        folio = FOLIO_PATTERN.match(search)
        if folio:
            matches.append(Order.id == int(folio.group(1)))
        conditions.append(or_(*matches))

    offset = _offset()

    total = db.session.scalar(select(func.count()).select_from(Order).where(*conditions))
    orders = db.session.scalars(
        select(Order)
        .where(*conditions)
        .options(selectinload(Order.items))
        .order_by(Order.created_at.desc(), Order.id.desc())
        .limit(PAGE_SIZE)
        .offset(offset)
    ).all()

    # Cuántos hay en cada filtro, sin buscador: para los números de las pestañas.
    by_status = dict(db.session.execute(select(Order.status, func.count()).group_by(Order.status)).all())
    counts = {
        name: (sum(by_status.values()) if status is None else by_status.get(status, 0))
        for name, status in FILTERS.items()
    }

    return jsonify({
        "total": total,
        "limit": PAGE_SIZE,
        "offset": offset,
        "counts": counts,
        "items": [_summary(order) for order in orders],
    })


@admin_orders.route("/orders/<int:order_id>", methods=["GET"])
@admin_required
def get_order(order_id):
    release_expired_reservations()
    _load(order_id)  # 404 si no existe
    return _detail_response(order_id)


@admin_orders.route("/orders/<int:order_id>/status", methods=["POST"])
@admin_required
def set_status(order_id):
    """Un paso adelante (pagado -> enviado -> entregado) o uno atrás.

    Cuerpo: {"status": nuevo, "current_status": el que se veía en pantalla,
    "tracking_number": opcional, solo al marcar como enviado}.
    """
    data = _json_body()
    target = data.get("status")
    if not isinstance(target, str) or target not in STATUS_WORDS:
        raise APIException("El estado nuevo no es válido.", status_code=400)
    tracking = _tracking_number(data) if target == "shipped" else None

    order = _load(order_id, lock=True)
    _check_current_status(order, data)

    now = datetime.now(timezone.utc)
    forward = FORWARD.get(order.status) == target
    if forward:
        if target == "shipped":
            order.shipped_at = now
            if tracking is not None:
                order.tracking_number = tracking
        else:
            order.delivered_at = now
    elif BACKWARD.get(order.status) == target:
        # Corregir un error: se borra la fecha del paso que se deshace.
        if order.status == "delivered":
            order.delivered_at = None
        else:
            order.shipped_at = None
    else:
        db.session.rollback()
        raise APIException(
            "Ese cambio de estado no se puede hacer desde el panel.",
            status_code=409,
            payload={"code": "not_allowed", "status": order.status},
        )

    order.status = target
    db.session.commit()
    # Después de guardar (tarea 5.2): "Tu pedido va en camino" o "Tu pedido se
    # entregó". Ir un paso atrás no manda nada.
    if forward and target == "shipped":
        notifications.order_shipped(order)
    elif forward:
        notifications.order_delivered(order)
    return _detail_response(order_id, f"Pedido {_folio(order)} marcado como {STATUS_WORDS[target]}.")


@admin_orders.route("/orders/<int:order_id>/tracking", methods=["PUT"])
@admin_required
def set_tracking(order_id):
    """Escribe, cambia o quita (vacío) el número de guía de un pedido pagado,
    enviado o entregado. Cuerpo: {"tracking_number": texto o ""}."""
    data = _json_body()
    if "tracking_number" not in data:
        raise APIException("Falta el número de guía.", status_code=400)
    tracking = _tracking_number(data)

    order = _load(order_id, lock=True)
    if order.status not in STATUS_WORDS:
        db.session.rollback()
        raise APIException(
            "Solo se pone número de guía a un pedido pagado.",
            status_code=409,
            payload={"code": "not_allowed", "status": order.status},
        )
    changed = tracking is not None and tracking != order.tracking_number
    order.tracking_number = tracking
    db.session.commit()
    # Guía nueva o distinta en un pedido que ya salió (tarea 5.2): le llega a la
    # persona. En uno pagado no: la guía va en el correo de "va en camino".
    if changed and order.status in ("shipped", "delivered"):
        notifications.order_tracking(order)
    message = "Número de guía guardado." if tracking else "Número de guía quitado."
    return _detail_response(order_id, message)


@admin_orders.route("/orders/<int:order_id>/cancel", methods=["POST"])
@admin_required
def cancel_order(order_id):
    """Cancela un pedido pagado y sin enviar, con reembolso total.

    Cuerpo: {"current_status": el estado que se veía en pantalla}.

    1. Bloquea la fila del pedido y comprueba que sigue pagado (si otra persona
       lo cambió, 409 sin tocar nada).
    2. Pide a Mercado Pago el reembolso completo con la fila bloqueada: si a la
       vez llega un aviso del webhook de ese pedido, espera a que esto termine.
       Se reembolsa la orden de Mercado Pago que pagó el pedido (mp_order_id).
       refund_order lleva la clave de idempotencia refund-<orden>: si se
       repite (un error de red, un segundo clic), Mercado Pago reembolsa una
       sola vez. Si Mercado Pago no lo acepta, no se cancela nada.
    3. Devuelve las unidades sumando en la base (stock = stock + n), con las
       variantes bloqueadas de menor a mayor id (orden de bloqueo: primero el
       pedido, después las variantes).
    4. Cancelado, con cancel_reason, refunded_at y mp_status "refunded". Se
       conservan paid_at y la guía: es la historia del pedido.

    Si Mercado Pago devolvió el dinero pero la base fallara al guardar, el
    pedido seguiría pagado: al reintentar, la clave de idempotencia evita un
    segundo reembolso.
    """
    data = _json_body()
    order = db.session.scalar(
        select(Order)
        .where(Order.id == order_id)
        .options(selectinload(Order.items))
        .with_for_update(of=Order)
        .execution_options(populate_existing=True)
    )
    if order is None:
        raise APIException("Pedido no encontrado.", status_code=404)
    _check_current_status(order, data)
    if order.status != "paid":
        db.session.rollback()
        message = (
            "Un pedido enviado o entregado no se cancela: vuélvelo antes a pagado."
            if order.status in ("shipped", "delivered")
            else "Este pedido no se puede cancelar desde el panel."
        )
        raise APIException(message, status_code=409, payload={"code": "not_allowed", "status": order.status})

    now = datetime.now(timezone.utc)
    folio = _folio(order)
    refund = _refund_needed(order)
    if refund:
        if order.paid_at is not None and now - order.paid_at > REFUND_WINDOW:
            db.session.rollback()
            raise APIException(
                "Pasaron más de 180 días desde el pago y Mercado Pago ya no permite reembolsarlo.",
                status_code=409,
                payload={"code": "refund_expired", "status": order.status},
            )
        try:
            refunded = refund_order(order.mp_order_id)
        except APIException as error:
            db.session.rollback()
            if error.status_code != 503:
                raise
            # 503: el servidor no tiene MP_ACCESS_TOKEN (el texto de get_sdk es el de la tienda).
            raise APIException(
                "El servidor no tiene las credenciales de Mercado Pago: por ahora no se puede reembolsar "
                "ni cancelar este pedido.",
                status_code=503,
                payload={"code": "payments_unavailable"},
            ) from None
        if not refunded:
            db.session.rollback()
            raise APIException(REFUND_FAILED, status_code=502, payload={"code": "refund_failed"})

    quantities = {}
    for item in order.items:
        quantities[item.variant_id] = quantities.get(item.variant_id, 0) + item.quantity
    # Bloquear las variantes en orden y después sumar en la base.
    db.session.execute(
        select(ProductVariant.id)
        .where(ProductVariant.id.in_(sorted(quantities)))
        .order_by(ProductVariant.id)
        .with_for_update()
    ).all()
    for variant_id in sorted(quantities):
        db.session.execute(
            update(ProductVariant)
            .where(ProductVariant.id == variant_id)
            .values(stock=ProductVariant.stock + quantities[variant_id])
        )

    order.status = "cancelled"
    order.cancel_reason = STORE_CANCEL_REASON
    if refund:
        order.refunded_at = now
        order.mp_status = "refunded"
    db.session.commit()
    notifications.order_cancelled(order)  # después de guardar (tarea 5.2)
    if refund:
        message = f"Pedido {folio} cancelado. Mercado Pago está devolviendo el pago completo."
    elif order.refunded_at is not None:
        message = f"Pedido {folio} cancelado. El pago ya se había reembolsado desde Mercado Pago."
    else:
        message = f"Pedido {folio} cancelado sin reembolso: no tenía un pago de Mercado Pago."
    logger.info("Pedido %s cancelado desde el panel (reembolso: %s)", folio, refund)
    return _detail_response(order_id, message)
