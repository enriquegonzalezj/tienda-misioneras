"""
Reservas de existencias (tarea 4.5).

Al ir a pagar, el servidor crea un pedido pendiente y descuenta las unidades
de cada variante (tarea 4.2). Así nadie más puede comprarlas mientras se paga.
La reserva dura hasta orders.reserved_until. Si vence sin pago, el pedido se
cancela y las unidades vuelven a la variante.

Render no tiene tareas programadas en el plan que usamos, así que las reservas
vencidas se liberan cuando alguien consulta existencias o va a pagar: catálogo,
ficha, carrito, página del producto (seo.py) e Inventario del panel. Es una
consulta pequeña gracias al índice ix_orders_status_reserved_until.

Orden de bloqueo: primero los pedidos y después las variantes, de menor a mayor
id. El pago y el webhook (4.2 y 4.6) deben seguir el mismo orden; si dos
procesos bloquean en orden distinto, PostgreSQL puede quedar en un abrazo
mortal (deadlock) y cancelar uno de ellos.
"""
import logging

from sqlalchemy import func, select, update
from sqlalchemy.exc import SQLAlchemyError

from api.models import Order, OrderItem, ProductVariant, db

logger = logging.getLogger(__name__)

EXPIRED_REASON = "Reserva vencida"
# Cuántos pedidos vencidos se liberan por petición. Con la tienda normal habrá
# muy pocos; el tope solo evita que una visita tarde si se acumularon muchos.
BATCH_SIZE = 50


def release_expired_reservations():
    """Cancela los pedidos pendientes con la reserva vencida y devuelve sus
    unidades. Todo en una transacción: o se libera el pedido completo, o nada.
    Devuelve cuántos pedidos se cancelaron.

    Si la base falla, se anota en el registro y se sigue: quien consultaba el
    catálogo ve las existencias sin liberar, y la siguiente visita lo reintenta.
    """
    try:
        # FOR UPDATE: bloquea esos pedidos hasta el commit. SKIP LOCKED: si otra
        # petición ya los está liberando (o el webhook los está marcando como
        # pagados), esta se los salta en vez de esperar o devolver las unidades
        # dos veces. PostgreSQL vuelve a comprobar el WHERE al bloquear, así que
        # un pedido que se pagó justo antes ya no entra.
        orders = db.session.scalars(
            select(Order)
            .where(
                Order.status == "pending",
                Order.reserved_until.is_not(None),
                Order.reserved_until < func.now(),
            )
            .order_by(Order.id)
            .limit(BATCH_SIZE)
            .with_for_update(skip_locked=True)
        ).all()
        if not orders:
            return 0

        order_ids = [order.id for order in orders]
        # Unidades por variante, sumando los pedidos, de menor a mayor id.
        quantities = db.session.execute(
            select(OrderItem.variant_id, func.sum(OrderItem.quantity))
            .where(OrderItem.order_id.in_(order_ids))
            .group_by(OrderItem.variant_id)
            .order_by(OrderItem.variant_id)
        ).all()
        for variant_id, quantity in quantities:
            # Suma en la base (stock = stock + n), no en Python: si a la vez se
            # vende otra unidad, ninguna de las dos cuentas se pierde.
            db.session.execute(
                update(ProductVariant)
                .where(ProductVariant.id == variant_id)
                .values(stock=ProductVariant.stock + quantity)
            )
        for order in orders:
            order.status = "cancelled"
            order.cancel_reason = EXPIRED_REASON
        db.session.commit()
        return len(orders)
    except SQLAlchemyError:
        db.session.rollback()
        logger.exception("No se pudieron liberar las reservas vencidas")
        return 0
