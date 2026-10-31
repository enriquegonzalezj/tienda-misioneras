// Estado de un producto en el panel, con su punto de color: Visible, Oculto o
// Archivado. Lo usan el Inventario y el formulario de producto.
// El estado viene del servidor (status: "visible", "hidden" o "archived").
// El texto siempre acompaña al color: el color solo no basta para leerlo.

const STATUSES = {
    visible: { label: "Visible", dot: "bg-accent" },
    hidden: { label: "Oculto", dot: "bg-field" },
    archived: { label: "Archivado", dot: "bg-muted" },
};

export const StatusDot = ({ status }) => {
    const { label, dot } = STATUSES[status] ?? STATUSES.hidden;
    return (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-surface-alt px-2.5 py-0.5 text-sm font-semibold">
            <span className={`size-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
            {label}
        </span>
    );
};
