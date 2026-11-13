import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getAccountOrders } from "../api/account";
import { Button } from "./Button";
import { LoadError } from "./LoadError";
import { formatPrice } from "../utils/formatPrice";
import { apiErrorText } from "../utils/apiErrorText";

// "Tus pedidos" en /cuenta (tarea 4.7). Los pedidos enlazados a la cuenta, del
// más reciente al más viejo, en tandas de 10 con "Ver más pedidos"
// (GET /api/account/orders?offset=). Cada pedido enlaza a /pedido/<token>, que
// es donde se ve el detalle y, desde la 4.6, se paga.
// - Salen todos, también los cancelados: por vencer el tiempo para pagar o por
//   hacer un pedido nuevo (decisión de Enrique, 13 nov).
// - Los pedidos hechos sin sesión no salen: no se enlazan por coincidir el
//   correo (el correo no está verificado). Se consultan con su enlace.
// - Un 401 (la sesión se cerró) llama a `onSessionLost`.
//
//   <OrderHistory onSessionLost={() => navigate("/cuenta/entrar")} />

const SECTION = "rounded-2xl border border-line p-5 sm:p-6";
const SECTION_TITLE = "text-xl font-semibold uppercase tracking-wide";

const dateText = (iso) => new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });

const piecesText = (count) => (count === 1 ? "1 pieza" : `${count} piezas`);

// Texto y estilo del estado. Solo tokens del tema: pendiente resalta en amarillo
// suave; lo cancelado va apagado.
const statusOf = (order) => {
    switch (order.status) {
        case "pending":
            return { text: "Pendiente de pago", className: "bg-highlight-soft text-primary" };
        case "paid":
            return { text: "Pagado", className: "bg-surface-alt text-primary" };
        case "shipped":
            return { text: "Enviado", className: "bg-surface-alt text-primary" };
        case "delivered":
            return { text: "Entregado", className: "bg-surface-alt text-primary" };
        default:
            return {
                text: order.expired
                    ? "Cancelado: venció el tiempo para pagar"
                    : order.replaced
                      ? "Cancelado: se hizo un pedido nuevo"
                      : "Cancelado",
                className: "border border-line text-muted",
            };
    }
};

const OrderRow = ({ order, linkRef }) => {
    const status = statusOf(order);
    return (
        <li className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 py-4">
            <div className="min-w-0">
                <Link
                    ref={linkRef}
                    to={`/pedido/${order.token}`}
                    className="font-semibold text-primary underline decoration-line underline-offset-4 hover:decoration-primary"
                >
                    Pedido {order.folio}
                </Link>
                <p className="mt-1 text-sm text-muted">
                    {dateText(order.created_at)} · {piecesText(order.item_count)}
                </p>
            </div>
            <div className="flex flex-col items-end gap-1.5 text-right max-sm:w-full max-sm:flex-row-reverse max-sm:items-center max-sm:justify-between">
                <span className="font-semibold text-primary">{formatPrice(order.total)}</span>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status.className}`}>{status.text}</span>
            </div>
        </li>
    );
};

export const OrderHistory = ({ onSessionLost }) => {
    // loading | ready | error. `orders` crece con cada "Ver más".
    const [status, setStatus] = useState("loading");
    const [orders, setOrders] = useState([]);
    const [total, setTotal] = useState(0);
    const [loadingMore, setLoadingMore] = useState(false);
    const [moreError, setMoreError] = useState(null);
    const [focusIndex, setFocusIndex] = useState(null);
    const linkRefs = useRef([]);

    useEffect(() => {
        const controller = new AbortController();
        getAccountOrders(0, controller.signal)
            .then((data) => {
                setOrders(data.items);
                setTotal(data.total);
                setStatus("ready");
            })
            .catch((error) => {
                if (controller.signal.aborted) return;
                if (error.status === 401) onSessionLost();
                else setStatus("error");
            });
        return () => controller.abort();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Tras "Ver más", el foco pasa al primer pedido nuevo (si no, el teclado se
    // queda en el botón, que se mueve o desaparece).
    useEffect(() => {
        if (focusIndex === null) return;
        linkRefs.current[focusIndex]?.focus();
        setFocusIndex(null);
    }, [focusIndex]);

    const loadMore = async () => {
        setLoadingMore(true);
        setMoreError(null);
        try {
            const data = await getAccountOrders(orders.length);
            // Si mientras tanto se hizo un pedido nuevo, la tanda llega corrida
            // un lugar: se quitan los repetidos por token.
            const known = new Set(orders.map((order) => order.token));
            const fresh = data.items.filter((order) => !known.has(order.token));
            setOrders((current) => [...current, ...fresh]);
            setTotal(data.total);
            if (fresh.length > 0) setFocusIndex(orders.length);
        } catch (error) {
            if (error.status === 401) {
                onSessionLost();
                return;
            }
            setMoreError(apiErrorText(error));
        } finally {
            setLoadingMore(false);
        }
    };

    let content;
    if (status === "loading") {
        content = (
            <p role="status" className="mt-4 text-muted">
                Cargando tus pedidos…
            </p>
        );
    } else if (status === "error") {
        content = <LoadError what="tus pedidos" className="mt-4" />;
    } else if (orders.length === 0) {
        content = (
            <p className="mt-4 text-primary">
                Aún no tienes pedidos en tu cuenta. Los pedidos hechos sin iniciar sesión se consultan con su enlace.
            </p>
        );
    } else {
        content = (
            <>
                <ul className="mt-2 divide-y divide-line">
                    {orders.map((order, index) => (
                        <OrderRow key={order.token} order={order} linkRef={(element) => (linkRefs.current[index] = element)} />
                    ))}
                </ul>
                <div role="alert" className="empty:hidden">
                    {moreError && <p className="mt-2 text-sm font-semibold text-primary">{moreError}</p>}
                </div>
                {orders.length < total && (
                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4">
                        <Button variant="outline" onClick={loadMore} disabled={loadingMore} aria-busy={loadingMore}>
                            {loadingMore ? "Cargando…" : "Ver más pedidos"}
                        </Button>
                        <p className="text-sm text-muted">
                            {orders.length} de {total}
                        </p>
                    </div>
                )}
            </>
        );
    }

    return (
        <section aria-labelledby="account-orders" className={SECTION}>
            <h2 id="account-orders" className={SECTION_TITLE}>
                Tus pedidos
            </h2>
            {content}
        </section>
    );
};
