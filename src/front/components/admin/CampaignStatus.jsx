// Estado de una campaña en el panel (tarea 4.8), con su punto de color:
// Programada, En curso, Terminada o Pausada. Lo usan la lista de Campañas y su
// formulario. El estado lo calcula el servidor con la fecha de hoy en México
// (status: "scheduled", "running", "ended" o "paused"); aquí solo se dibuja.
// El texto siempre acompaña al color: el color solo no basta para leerlo.
//
// También están aquí los textos que comparten la lista y el formulario
// (fechas, público, alcance y descuento), para que digan lo mismo en los dos.

const STATUSES = {
    scheduled: { label: "Programada", dot: "bg-highlight ring-1 ring-primary" },
    running: { label: "En curso", dot: "bg-accent" },
    ended: { label: "Terminada", dot: "bg-muted" },
    paused: { label: "Pausada", dot: "bg-field" },
};

export const CampaignStatus = ({ status }) => {
    const { label, dot } = STATUSES[status] ?? STATUSES.paused;
    return (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-surface-alt px-2.5 py-0.5 text-sm font-semibold">
            <span className={`size-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
            {label}
        </span>
    );
};

const MONTHS = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// "2026-11-14", "2026-11-30" -> "Del 14 al 30 de noviembre de 2026".
// Se lee el texto tal cual, sin pasar por Date: la zona horaria del
// dispositivo nunca mueve el día (las campañas van en hora de México).
export const dateRangeText = (start, end) => {
    const [sy, sm, sd] = start.split("-").map(Number);
    const [ey, em, ed] = end.split("-").map(Number);
    if (start === end) return `${sd} de ${MONTHS[sm - 1]} de ${sy}`;
    if (sy !== ey) return `Del ${sd} de ${MONTHS[sm - 1]} de ${sy} al ${ed} de ${MONTHS[em - 1]} de ${ey}`;
    if (sm !== em) return `Del ${sd} de ${MONTHS[sm - 1]} al ${ed} de ${MONTHS[em - 1]} de ${ey}`;
    return `Del ${sd} al ${ed} de ${MONTHS[em - 1]} de ${ey}`;
};

// Sin marcar género (CLAUDE.md, "Textos sin género").
export const AUDIENCE_LABELS = {
    customers: "Solo con cuenta",
    everyone: "Todo el público",
};

const plural = (count, singular, pluralForm) => `${count} ${count === 1 ? singular : pluralForm}`;

export const scopeText = (campaign) =>
    campaign.scope === "store" ? "Toda la tienda" : plural(campaign.product_count, "producto", "productos");

// "15 % · Envío gratis · 2 precios fijos". Espacio que no se parte antes del %.
export const discountText = (campaign) => {
    const parts = [];
    if (campaign.discount_percent !== null) parts.push(`${campaign.discount_percent} %`);
    if (campaign.fixed_count > 0) parts.push(plural(campaign.fixed_count, "precio fijo", "precios fijos"));
    if (campaign.shipping_discount_percent === 100) parts.push("Envío gratis");
    else if (campaign.shipping_discount_percent !== null) parts.push(`Envío −${campaign.shipping_discount_percent} %`);
    return parts.join(" · ");
};
