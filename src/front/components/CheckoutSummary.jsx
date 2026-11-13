import { useId, useState } from "react";
import { formatPrice } from "../utils/formatPrice";
import { ImagePlaceholder } from "./ImagePlaceholder";

// Resumen de la página de pago (tarea 4.2): productos que entran en el pedido,
// subtotal, envío y total. Todos los importes vienen del servidor (POST
// /api/cart con la paquetería elegida); aquí solo se les da formato.
// Con campañas (4.8), como la página del pedido: subtotal a precio normal,
// "Descuentos" y "Descuento en el envío" (solo si los hay), y en cada producto
// su total rebajado con el normal tachado.
//
// Escritorio: columna derecha fija, siempre abierta. Móvil: arriba del
// formulario y plegada, con el total a la vista ("Ver resumen · $665.00").
//
//   lines        líneas disponibles de la respuesta del servidor
//   quantities   Map variant_id -> cantidad del navegador
//   quote        respuesta completa (subtotal, discount, shipping, total)
//   stale        true mientras recalcula: importes atenuados y aria-busy
//   insufficient ids marcados por el servidor con "No hay suficientes unidades"

const articles = (count) => `${count} ${count === 1 ? "artículo" : "artículos"}`;
const optionsText = (values) => values.map(({ option, value }) => `${option}: ${value}`).join(" · ");

const Line = ({ line, quantity, short }) => (
    <li className="flex gap-3 py-3 first:pt-0">
        <div className="size-14 shrink-0 overflow-hidden rounded-lg border border-line bg-surface">
            {line.image ? (
                <img src={line.image.url} alt={line.image.alt} loading="lazy" className="size-full object-cover" />
            ) : (
                <ImagePlaceholder />
            )}
        </div>
        <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-primary wrap-break-word">{line.name}</p>
            {line.values.length > 0 && <p className="text-xs text-muted">{optionsText(line.values)}</p>}
            <p className="text-xs text-muted">Cantidad: {quantity}</p>
            {short && <p className="mt-1 text-xs font-semibold text-primary">No hay suficientes unidades</p>}
        </div>
        <p className="shrink-0 text-right text-sm font-semibold text-primary">
            {line.list_line_total !== line.line_total && (
                <s className="block text-xs font-normal text-muted">
                    <span className="sr-only">Precio normal: </span>
                    {formatPrice(line.list_line_total)}
                </s>
            )}
            {line.list_line_total !== line.line_total && <span className="sr-only">Con descuento: </span>}
            {formatPrice(line.line_total)}
        </p>
    </li>
);

const Row = ({ label, value, strong = false, stale = false }) => (
    <div className={`flex items-baseline justify-between gap-4 ${strong ? "border-t border-line pt-4" : ""}`}>
        <dt className={strong ? "font-semibold text-primary" : "text-muted"}>{label}</dt>
        <dd
            className={`text-right transition-opacity ${strong ? "text-2xl font-bold text-primary" : "text-primary"} ${stale ? "opacity-50" : ""}`}
        >
            {value}
        </dd>
    </div>
);

const shippingValue = (shipping) => {
    if (!shipping) return "Por elegir";
    return Number(shipping.price) === 0 ? "Gratis" : formatPrice(shipping.price);
};

export const CheckoutSummary = ({ lines, quantities, quote, stale, insufficient }) => {
    const [open, setOpen] = useState(false);
    const contentId = useId();
    const count = lines.reduce((sum, line) => sum + quantities.get(line.variant_id), 0);
    const total = quote.total ? formatPrice(quote.total) : "Por calcular";

    return (
        <section
            aria-labelledby={`${contentId}-title`}
            aria-busy={stale}
            className="rounded-2xl bg-surface-alt p-5 lg:sticky lg:top-6 lg:p-6"
        >
            {/* Móvil: el título es un botón que pliega el resumen. */}
            <h2 id={`${contentId}-title`} className="text-xl font-semibold uppercase tracking-wide">
                <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={contentId}
                    onClick={() => setOpen((value) => !value)}
                    className="flex w-full items-center justify-between gap-4 rounded-sm text-left uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:hidden"
                >
                    <span>
                        {open ? "Ocultar resumen" : "Ver resumen"}
                        <span className="block font-sans text-sm font-medium normal-case tracking-normal text-muted">
                            {articles(count)}
                        </span>
                    </span>
                    <span className="flex items-center gap-2">
                        <span className={`font-sans text-lg font-bold normal-case tracking-normal transition-opacity ${stale ? "opacity-50" : ""}`}>
                            {total}
                        </span>
                        <Chevron open={open} />
                    </span>
                </button>
                <span className="hidden lg:inline">Resumen</span>
            </h2>

            <div id={contentId} className={`${open ? "block" : "hidden"} lg:block`}>
                <ul className="mt-5 divide-y divide-line border-b border-line pb-2">
                    {lines.map((line) => (
                        <Line
                            key={line.variant_id}
                            line={line}
                            quantity={quantities.get(line.variant_id)}
                            short={insufficient.includes(line.variant_id)}
                        />
                    ))}
                </ul>
                <dl className="mt-4 space-y-3">
                    <Row label={`Subtotal (${articles(count)})`} value={formatPrice(quote.subtotal)} stale={stale} />
                    {Number(quote.discount) > 0 && (
                        <Row label="Descuentos" value={`−${formatPrice(quote.discount)}`} stale={stale} />
                    )}
                    <Row
                        label={quote.shipping ? `Envío: ${quote.shipping.name}` : "Envío"}
                        value={shippingValue(quote.shipping)}
                        stale={stale}
                    />
                    {quote.shipping && Number(quote.shipping.discount) > 0 && (
                        <Row
                            label="Descuento en el envío"
                            value={`−${formatPrice(quote.shipping.discount)}`}
                            stale={stale}
                        />
                    )}
                    <Row label="Total" value={total} strong stale={stale} />
                </dl>
            </div>
        </section>
    );
};

const Chevron = ({ open }) => (
    <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
    >
        <path d="m6 9 6 6 6-6" />
    </svg>
);
