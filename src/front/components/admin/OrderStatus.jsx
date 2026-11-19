// Estado de un pedido en el panel (tarea 5.5), con su punto de color. Lo usan
// la lista de Pedidos y el detalle. El texto siempre acompaña al color: el
// color solo no basta para leerlo.
//
// También están aquí los textos y fechas que comparten las dos pantallas, para
// que digan lo mismo. Los estados vienen del servidor (admin_orders.py):
// pending, paid, shipped, delivered y cancelled (con expired, replaced o
// cancelled_by_store, y refunded si se devolvió el pago).

const STATUSES = {
    pending: { label: "Pendiente de pago", dot: "bg-highlight ring-1 ring-primary" },
    // Pagado y sin enviar: lo que la congregación tiene que atender.
    paid: { label: "Por enviar", dot: "bg-alert" },
    shipped: { label: "Enviado", dot: "bg-primary" },
    delivered: { label: "Entregado", dot: "bg-accent" },
    cancelled: { label: "Cancelado", dot: "bg-muted" },
};

// Palabra del estado para los botones y las confirmaciones ("marcar como enviado").
export const STATUS_WORDS = {
    paid: "pagado",
    shipped: "enviado",
    delivered: "entregado",
};

// "Cancelado: venció el tiempo para pagar", como en el historial de la cuenta.
export const statusText = (order) => {
    if (order.status === "cancelled") {
        if (order.cancelled_by_store) return order.refunded ? "Cancelado y reembolsado" : "Cancelado por la tienda";
        if (order.refunded) return "Cancelado: pago tardío reembolsado";
        if (order.expired) return "Cancelado: venció el tiempo para pagar";
        if (order.replaced) return "Cancelado: se hizo un pedido nuevo";
    }
    return (STATUSES[order.status] ?? STATUSES.cancelled).label;
};

export const OrderStatus = ({ order }) => {
    const { dot } = STATUSES[order.status] ?? STATUSES.cancelled;
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-alt px-2.5 py-0.5 text-sm font-semibold">
            <span className={`size-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
            {statusText(order)}
        </span>
    );
};

// Fechas en la hora del dispositivo, como la página del pedido de la tienda.
export const dateText = (iso) =>
    new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });

export const dateTimeText = (iso) =>
    new Date(iso).toLocaleString("es-MX", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });

// Corta, para la lista de pasos del Estado: "14 nov 2026, 7:56 p.m.".
export const shortDateTimeText = (iso) =>
    new Date(iso).toLocaleString("es-MX", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });

export const plural = (count, singular, pluralForm) => `${count} ${count === 1 ? singular : pluralForm}`;
