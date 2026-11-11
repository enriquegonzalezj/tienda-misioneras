import { useEffect, useRef, useState } from "react";
import { priceCart } from "../api/cart";
import { useCart } from "../cart/CartContext";
import { Button } from "../components/Button";
import { CartLine } from "../components/CartLine";
import { usePageTitle } from "../hooks/usePageTitle";
import { formatPrice } from "../utils/formatPrice";

// Página del carrito (tarea 4.1), en /carrito. Sin maqueta (decisión de Enrique,
// 6 nov): mismos tokens y estilo que la ficha. Escritorio: líneas a la izquierda y
// resumen fijo a la derecha; móvil: líneas y debajo el resumen.
//
// El carrito del navegador solo sabe qué variante y cuántas (cart/CartContext.jsx).
// Cada vez que cambia, se pregunta al servidor (POST /api/cart) por nombres, fotos,
// precios, disponibilidad y subtotal. El navegador nunca calcula un precio.
//
// - Al cambiar una cantidad, el número cambia al momento y el servidor recalcula
//   300 ms después de la última pulsación; la petición anterior se cancela. Así diez
//   clics seguidos en "+" son una sola petición (el límite es 120 por minuto).
// - Mientras recalcula, totales y subtotal se ven atenuados y el resumen lleva
//   aria-busy: nadie lee un total viejo como si fuera el bueno.
// - Lo que el servidor devuelve en `removed` (borrado, oculto o variante
//   desactivada) se quita solo del carrito, con un aviso.
// - Lo agotado se queda a la vista, sin total y fuera del subtotal (CartLine).
// - "Continuar al pago" lleva a /pago (tarea 4.2). Se desactiva mientras carga,
//   recalcula o falla, y si no hay nada disponible: el total tiene que estar al día.

const CONTAINER = "mx-auto max-w-6xl px-4 sm:px-6";
const COLUMNS = "grid gap-10 lg:grid-cols-[2fr_1fr] lg:items-start lg:gap-16";
const RECALC_DELAY_MS = 300;

const articles = (count) => `${count} ${count === 1 ? "artículo" : "artículos"}`;
const removedText = (count) =>
    count === 1
        ? "Quitamos 1 producto que ya no está disponible."
        : `Quitamos ${count} productos que ya no están disponibles.`;

const BagIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-12 text-muted" aria-hidden="true">
        <path d="M6 8h12l-1 12H7L6 8z" />
        <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
);

const EmptyCart = () => (
    <div className="mt-8 flex flex-col items-center rounded-2xl border border-line px-6 py-14 text-center">
        <BagIcon />
        <p className="mt-4 text-lg font-semibold text-primary">Tu carrito está vacío</p>
        <p className="mt-2 text-muted">Agrega productos desde la tienda y aquí los verás.</p>
        <Button to="/tienda" className="mt-6">
            Ver la tienda
        </Button>
    </div>
);

const PULSE = "rounded-lg bg-surface-alt motion-safe:animate-pulse";
const Loading = () => (
    <div className={`mt-8 ${COLUMNS}`} aria-busy="true">
        <span className="sr-only">Cargando el carrito…</span>
        <div className="space-y-6">
            {[0, 1].map((key) => (
                <div key={key} className="flex gap-4">
                    <div className={`size-20 shrink-0 sm:size-28 ${PULSE}`} />
                    <div className="flex-1 space-y-3">
                        <div className={`h-5 w-1/2 ${PULSE}`} />
                        <div className={`h-4 w-1/3 ${PULSE}`} />
                    </div>
                </div>
            ))}
        </div>
        <div className={`h-48 rounded-2xl ${PULSE}`} />
    </div>
);

// Fallo de red o del servidor: se dice y se ofrece reintentar.
const RetryError = ({ onRetry, message }) => (
    <div role="alert" className="rounded-xl border border-alert bg-alert-soft px-4 py-3 text-sm text-primary">
        <p>{message}</p>
        <button
            type="button"
            onClick={onRetry}
            className="mt-2 rounded-sm font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
            Reintentar
        </button>
    </div>
);

const Summary = ({ count, subtotal, stale, failed, canCheckout }) => (
    <section
        aria-labelledby="cart-summary"
        aria-busy={stale}
        className="rounded-2xl bg-surface-alt p-5 lg:sticky lg:top-6 lg:p-6"
    >
        <h2 id="cart-summary" className="text-xl font-semibold uppercase tracking-wide">
            Resumen
        </h2>
        <div className="mt-5 flex items-baseline justify-between gap-4 border-b border-line pb-5">
            <p className="text-muted">Subtotal ({articles(count)})</p>
            <p className={`text-2xl font-bold text-primary transition-opacity ${stale ? "opacity-50" : ""}`}>
                {failed ? "Sin calcular" : formatPrice(subtotal)}
            </p>
        </div>
        <p className="mt-4 text-sm text-muted">El envío se calcula en el siguiente paso.</p>
        {/* Un enlace no se puede desactivar: si no se puede pagar, es un botón desactivado. */}
        {canCheckout ? (
            <Button to="/pago" className="mt-6 w-full">
                Continuar al pago
            </Button>
        ) : (
            <Button disabled className="mt-6 w-full">
                Continuar al pago
            </Button>
        )}
        <div className="mt-4 text-center">
            <Button to="/tienda" variant="outline" className="w-full">
                Seguir comprando
            </Button>
        </div>
    </section>
);

export const Cart = () => {
    usePageTitle("Carrito");
    const { items, setQuantity, removeItems } = useCart();
    const headingRef = useRef(null);

    // Última respuesta del servidor y en qué punto está la petición:
    // "loading" (la primera), "updating" (recalculando), "ready" o "error".
    const [quote, setQuote] = useState(null);
    const [status, setStatus] = useState("loading");
    const [error, setError] = useState(null);
    const [retry, setRetry] = useState(0);
    // Aviso del contenedor role="status": lo quitado por el servidor o por "Quitar".
    // `id` cambia con cada aviso para que se vuelva a leer aunque el texto se repita.
    const [notice, setNotice] = useState(null);
    const showNotice = (text) => setNotice((previous) => ({ text, id: (previous?.id ?? 0) + 1 }));
    // La primera petición sale sin esperar; las siguientes, tras la pausa.
    const firstRequest = useRef(true);

    useEffect(() => {
        if (items.length === 0) {
            setQuote(null);
            setStatus("ready");
            return undefined;
        }
        const controller = new AbortController();
        const delay = firstRequest.current ? 0 : RECALC_DELAY_MS;
        firstRequest.current = false;
        setStatus((current) => (current === "loading" ? "loading" : "updating"));

        const timer = setTimeout(() => {
            priceCart(items, { signal: controller.signal })
                .then((data) => {
                    if (controller.signal.aborted) return;
                    setQuote(data);
                    setError(null);
                    setStatus("ready");
                    if (data.removed.length > 0) {
                        showNotice(removedText(data.removed.length));
                        // Cambia `items`: este efecto vuelve a pedir el carrito ya limpio.
                        removeItems(data.removed);
                    }
                })
                .catch((reason) => {
                    if (controller.signal.aborted) return;
                    setError(reason);
                    setStatus("error");
                });
        }, delay);

        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [items, retry, removeItems]);

    // Quitar una línea: desaparece al momento, se avisa y el foco vuelve al título
    // (el botón pulsado ya no existe; sin esto el foco se perdería).
    const handleRemove = (line) => {
        removeItems([line.variant_id]);
        showNotice(`Se quitó ${line.name} del carrito.`);
        headingRef.current?.focus();
    };

    const quantities = new Map(items.map((item) => [item.variant_id, item.quantity]));
    // Solo las líneas que siguen en el carrito del navegador (al pulsar "Quitar"
    // desaparecen sin esperar al servidor), con la cantidad del navegador.
    const lines = (quote?.items ?? []).filter((line) => quantities.has(line.variant_id));
    const stale = status === "updating";
    const count = lines.reduce((sum, line) => sum + (line.available ? quantities.get(line.variant_id) : 0), 0);

    let content;
    if (items.length === 0) {
        content = <EmptyCart />;
    } else if (!quote) {
        // Todavía sin respuesta del servidor: la primera carga o su error.
        content =
            status === "error" ? (
                <div className="mt-8">
                    <RetryError message={error?.message ?? "No pudimos cargar el carrito."} onRetry={() => setRetry((n) => n + 1)} />
                </div>
            ) : (
                <Loading />
            );
    } else {
        content = (
            <div className={`mt-8 ${COLUMNS}`}>
                <div>
                    {status === "error" && (
                        <div className="mb-6">
                            <RetryError
                                message={`${error?.message ?? "Algo salió mal."} Los precios pueden no estar al día.`}
                                onRetry={() => setRetry((n) => n + 1)}
                            />
                        </div>
                    )}
                    <ul>
                        {lines.map((line) => (
                            <CartLine
                                key={line.variant_id}
                                line={line}
                                quantity={quantities.get(line.variant_id)}
                                stale={stale}
                                onQuantityChange={(quantity) => setQuantity(line.variant_id, quantity)}
                                onRemove={() => handleRemove(line)}
                            />
                        ))}
                    </ul>
                </div>
                <Summary
                    count={count}
                    subtotal={quote.subtotal}
                    stale={stale}
                    failed={status === "error"}
                    canCheckout={status === "ready" && count > 0}
                />
            </div>
        );
    }

    return (
        <main className={`${CONTAINER} pb-16 pt-8 lg:pb-20 lg:pt-10`}>
            {/* El único h1. tabIndex -1: recibe el foco al quitar una línea. */}
            <h1
                ref={headingRef}
                tabIndex={-1}
                className="text-3xl font-semibold uppercase tracking-wide outline-none lg:text-4xl"
            >
                Carrito
            </h1>
            {/* Siempre existe, para que el lector de pantalla lea cada aviso nuevo. */}
            <div role="status" className="text-sm">
                {notice && <p key={notice.id} className="mt-4 rounded-xl bg-highlight-soft px-4 py-3 text-primary">{notice.text}</p>}
            </div>
            {content}
        </main>
    );
};
