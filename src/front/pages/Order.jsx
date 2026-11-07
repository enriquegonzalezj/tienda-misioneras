import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { getOrder } from "../api/orders";
import { Button } from "../components/Button";
import { usePageTitle } from "../hooks/usePageTitle";
import { formatPrice } from "../utils/formatPrice";

// Página del pedido (tarea 4.2), en /pedido/<token>. Sin maqueta: mismos tokens
// y estilo que el carrito. La ve quien tiene el enlace (el token es la llave);
// Flask la sirve con noindex y Referrer-Policy: no-referrer (app.py).
//
// - Pendiente: muestra hasta qué hora está apartado. Al llegar esa hora pide el
//   pedido otra vez; el servidor libera la reserva y responde "cancelado".
// - Pagar con Mercado Pago llega en la tarea 4.6: hasta entonces, desactivado.
// - Hasta que existan los correos (5.2), el enlace es la única forma de volver
//   al pedido: por eso se pide guardarlo y hay un botón para copiarlo.

const CONTAINER = "mx-auto max-w-6xl px-4 sm:px-6";
const COLUMNS = "grid gap-10 lg:grid-cols-[2fr_1fr] lg:items-start lg:gap-x-16";
// setTimeout no admite esperas de más de unos 24 días; una reserva de OXXO dura 3.
const MAX_TIMEOUT_MS = 2_147_000_000;

const timeText = (iso) => new Date(iso).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" });
const dateText = (iso) => new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
const phoneText = (phone) => (phone?.length === 10 ? `${phone.slice(0, 3)} ${phone.slice(3, 6)} ${phone.slice(6)}` : phone);
const articles = (count) => `${count} ${count === 1 ? "artículo" : "artículos"}`;

// Franja de estado: título y texto según cómo está el pedido.
const statusInfo = (order) => {
    if (order.status === "pending") {
        return {
            tone: "highlight",
            title: "Pendiente de pago",
            text: `Tus piezas están apartadas. Tienes hasta las ${timeText(order.reserved_until)} para pagar; después, vuelven a la tienda.`,
        };
    }
    if (order.status === "cancelled") {
        if (order.expired) {
            return {
                tone: "alert",
                title: "Pedido cancelado",
                text: "El tiempo para pagar terminó y el pedido se canceló. Tus productos siguen en tu carrito.",
                cart: true,
            };
        }
        if (order.replaced) {
            return { tone: "alert", title: "Pedido sustituido", text: "Este pedido se sustituyó por uno más reciente." };
        }
        return { tone: "alert", title: "Pedido cancelado", text: "Este pedido se canceló." };
    }
    const done = {
        paid: { title: "Pago recibido", text: "Estamos preparando tu pedido." },
        shipped: { title: "Pedido enviado", text: "Tu pedido va en camino." },
        delivered: { title: "Pedido entregado", text: "Tu pedido ya se entregó." },
    };
    return { tone: "accent", ...(done[order.status] ?? { title: "Pedido", text: "" }) };
};

const TONES = {
    highlight: "border-highlight bg-highlight-soft",
    alert: "border-alert bg-alert-soft",
    accent: "border-accent bg-surface-alt",
};

const StatusBanner = ({ order }) => {
    const info = statusInfo(order);
    return (
        <section aria-labelledby="order-status" className={`mt-6 rounded-2xl border-l-4 px-5 py-4 ${TONES[info.tone]}`}>
            <h2 id="order-status" className="text-lg font-semibold uppercase tracking-wide">
                {info.title}
            </h2>
            <p className="mt-1 text-primary">{info.text}</p>
            {info.cart && (
                <Button to="/carrito" className="mt-4">
                    Volver al carrito
                </Button>
            )}
        </section>
    );
};

const CopyLink = () => {
    const [result, setResult] = useState(null); // { text, id }
    const copy = async () => {
        let text = "Enlace copiado.";
        try {
            await navigator.clipboard.writeText(window.location.href);
        } catch {
            text = "No se pudo copiar: copia la dirección de la barra del navegador.";
        }
        setResult((previous) => ({ text, id: (previous?.id ?? 0) + 1 }));
    };
    return (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line px-4 py-3">
            <p className="min-w-0 flex-1 basis-60 text-sm text-primary">
                <span className="font-semibold">Guarda este enlace</span> para consultar tu pedido más tarde.
            </p>
            <button
                type="button"
                onClick={copy}
                className="inline-flex min-h-10 items-center gap-2 rounded-full border-2 border-primary px-4 text-sm font-semibold text-primary hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
                <LinkIcon />
                Copiar enlace
            </button>
            {/* Siempre existe, para que el lector de pantalla lea el resultado. */}
            <p role="status" className="basis-full text-sm text-muted empty:hidden">
                {result && <span key={result.id}>{result.text}</span>}
            </p>
        </div>
    );
};

const OrderLine = ({ item }) => {
    const discounted = item.unit_price !== item.list_unit_price;
    return (
        <li className="flex items-start justify-between gap-4 border-b border-line py-4 first:pt-0">
            <div className="min-w-0">
                <p className="font-semibold text-primary wrap-break-word">{item.name}</p>
                {item.variant_label && <p className="text-sm text-muted">{item.variant_label}</p>}
                <p className="mt-1 text-sm text-muted">
                    {item.quantity} ×{" "}
                    {discounted && (
                        <>
                            <s>{formatPrice(item.list_unit_price)}</s>{" "}
                        </>
                    )}
                    {formatPrice(item.unit_price)}
                </p>
            </div>
            <p className="shrink-0 font-semibold text-primary">{formatPrice(item.line_total)}</p>
        </li>
    );
};

const Row = ({ label, value, strong = false }) => (
    <div className={`flex items-baseline justify-between gap-4 ${strong ? "border-t border-line pt-4" : ""}`}>
        <dt className={strong ? "font-semibold text-primary" : "text-muted"}>{label}</dt>
        <dd className={strong ? "text-2xl font-bold text-primary" : "text-primary"}>{value}</dd>
    </div>
);

const Summary = ({ order, count, children }) => (
    <section
        aria-labelledby="order-summary"
        className="rounded-2xl bg-surface-alt p-5 lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:p-6"
    >
        <h2 id="order-summary" className="text-xl font-semibold uppercase tracking-wide">
            Resumen
        </h2>
        <dl className="mt-5 space-y-3">
            <Row label={`Subtotal (${articles(count)})`} value={formatPrice(order.subtotal)} />
            {Number(order.discount_amount) > 0 && (
                <Row label="Descuentos" value={`−${formatPrice(order.discount_amount)}`} />
            )}
            <Row label={`Envío: ${order.shipping.method}`} value={Number(order.shipping.cost) === 0 ? "Gratis" : formatPrice(order.shipping.cost)} />
            {Number(order.shipping.discount) > 0 && (
                <Row label="Descuento en el envío" value={`−${formatPrice(order.shipping.discount)}`} />
            )}
            <Row label="Total" value={formatPrice(order.total)} strong />
        </dl>
        {children}
    </section>
);

const Block = ({ title, children }) => (
    <section className="rounded-2xl border border-line p-5">
        <h2 className="text-lg font-semibold uppercase tracking-wide">{title}</h2>
        <div className="mt-3 space-y-1 text-primary">{children}</div>
    </section>
);

const Address = ({ address }) => (
    <Block title="Envío a">
        <p className="font-semibold wrap-break-word">{address.recipient_name}</p>
        <p className="wrap-break-word">
            {address.street} {address.exterior_number}
            {address.interior_number ? `, int. ${address.interior_number}` : ""}
        </p>
        <p className="wrap-break-word">Col. {address.neighborhood}</p>
        <p className="wrap-break-word">
            {address.postal_code} {address.municipality}, {address.state}
        </p>
        <p>Tel. {phoneText(address.phone)}</p>
        {address.references && <p className="pt-1 text-sm text-muted wrap-break-word">Referencias: {address.references}</p>}
    </Block>
);

const Contact = ({ contact }) => (
    <Block title="Contacto">
        <p className="font-semibold wrap-break-word">
            {contact.first_name} {contact.last_name}
        </p>
        <p className="break-all">{contact.email}</p>
        <p>Tel. {phoneText(contact.phone)}</p>
    </Block>
);

const PULSE = "rounded-lg bg-surface-alt motion-safe:animate-pulse";
const Loading = () => (
    <div className={`mt-8 ${COLUMNS}`} aria-busy="true">
        <span className="sr-only">Cargando el pedido…</span>
        <div className="space-y-4">
            <div className={`h-24 ${PULSE}`} />
            <div className={`h-16 ${PULSE}`} />
            <div className={`h-16 ${PULSE}`} />
        </div>
        <div className={`h-56 rounded-2xl ${PULSE}`} />
    </div>
);

const NotFoundOrder = () => (
    <div className="py-10 text-center">
        <p className="text-lg font-semibold text-primary">No encontramos este pedido</p>
        <p className="mt-2 text-muted">Revisa que el enlace esté completo: es largo y se corta fácil al copiarlo.</p>
        <Button to="/tienda" className="mt-6">
            Ver la tienda
        </Button>
    </div>
);

export const Order = () => {
    usePageTitle("Tu pedido");
    const { token } = useParams();
    const [state, setState] = useState({ status: "loading", order: null, error: null });
    const [reload, setReload] = useState(0);
    const timer = useRef(null);

    const load = useCallback(
        (signal) =>
            getOrder(token, { signal })
                .then((order) => {
                    if (!signal.aborted) setState({ status: "ready", order, error: null });
                })
                .catch((error) => {
                    if (!signal.aborted) setState((current) => ({ ...current, status: "error", error }));
                }),
        [token]
    );

    useEffect(() => {
        const controller = new AbortController();
        load(controller.signal);
        return () => controller.abort();
    }, [load, reload]);

    // Al vencer la reserva, se pide otra vez (2 s después, con margen para el
    // reloj del servidor): así la página pasa sola a "cancelado".
    const reservedUntil = state.order?.status === "pending" ? state.order.reserved_until : null;
    useEffect(() => {
        if (!reservedUntil) return undefined;
        const wait = Math.min(Math.max(new Date(reservedUntil).getTime() - Date.now() + 2000, 0), MAX_TIMEOUT_MS);
        timer.current = setTimeout(() => setReload((n) => n + 1), wait);
        return () => clearTimeout(timer.current);
    }, [reservedUntil]);

    const { status, order, error } = state;
    let content;
    if (status === "loading" && !order) {
        content = <Loading />;
    } else if (!order) {
        content =
            error?.status === 404 ? (
                <NotFoundOrder />
            ) : (
                <div role="alert" className="mt-8 rounded-xl border border-alert bg-alert-soft px-4 py-3 text-sm text-primary">
                    <p>{error?.message ?? "No pudimos cargar el pedido."}</p>
                    <button
                        type="button"
                        onClick={() => setReload((n) => n + 1)}
                        className="mt-2 rounded-sm font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                        Reintentar
                    </button>
                </div>
            );
    } else {
        const count = order.items.reduce((sum, item) => sum + item.quantity, 0);
        content = (
            <>
                <p className="mt-2 text-muted">Hecho el {dateText(order.created_at)}</p>
                <StatusBanner order={order} />
                <CopyLink />
                {/* Orden en móvil: productos, resumen (con el botón de pagar) y datos.
                    En escritorio, el resumen ocupa la columna derecha de arriba abajo. */}
                <div className={`mt-8 ${COLUMNS}`}>
                    <section aria-labelledby="order-items" className="lg:col-start-1">
                        <h2 id="order-items" className="text-xl font-semibold uppercase tracking-wide">
                            Productos
                        </h2>
                        <ul className="mt-4">
                            {order.items.map((item, index) => (
                                <OrderLine key={index} item={item} />
                            ))}
                        </ul>
                    </section>
                    <Summary order={order} count={count}>
                        {order.status === "pending" && (
                            <>
                                <Button disabled aria-describedby="pay-soon" className="mt-6 w-full">
                                    Pagar con Mercado Pago
                                </Button>
                                <p id="pay-soon" className="mt-3 text-center text-sm text-muted">
                                    Muy pronto podrás pagar desde aquí.
                                </p>
                            </>
                        )}
                    </Summary>
                    <div className="grid gap-6 sm:grid-cols-2 lg:col-start-1">
                        <Address address={order.shipping_address} />
                        <Contact contact={order.contact} />
                    </div>
                </div>
            </>
        );
    }

    return (
        <main className={`${CONTAINER} pb-16 pt-8 lg:pb-20 lg:pt-10`}>
            <h1 className="text-3xl font-semibold uppercase tracking-wide lg:text-4xl">
                {order ? `Pedido ${order.folio}` : "Tu pedido"}
            </h1>
            {content}
        </main>
    );
};

const LinkIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
        <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
        <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </svg>
);
