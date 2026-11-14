import { useCallback, useEffect, useId, useState } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { getAdminOrder, setOrderStatus, setOrderTracking } from "../../api/admin";
import { Button } from "../../components/Button";
import { AlertIcon, FIELD, FormField } from "../../components/FormField";
import { LoadError } from "../../components/LoadError";
import { FormSection } from "../../components/admin/ProductDetails";
import { OrderStatus, STATUS_WORDS, dateTimeText, shortDateTimeText, statusText } from "../../components/admin/OrderStatus";
import { formatPrice } from "../../utils/formatPrice";
import { AdminNotFound } from "./AdminLayout";

// Detalle de un pedido en el panel (/admin/pedidos/<id>), tarea 5.5.
//
// Escritorio (xl): productos y resumen a la izquierda; Estado, Número de guía,
// Envío a y Contacto a la derecha. Móvil: una columna con Estado, Productos
// (lo que hay que empacar) y después Envío a y Contacto.
//
// Estado (decisiones de Enrique del 14 nov): pagado -> enviado -> entregado, y
// un paso atrás por si hubo un error. Los dos piden confirmación. Ir atrás
// borra la fecha de ese paso; la guía se conserva. El servidor dice qué se
// puede hacer (next_status, previous_status): la pantalla no repite las reglas.
// Pendiente y cancelado no se cambian aquí (la tienda y Mercado Pago, 4.6).
//
// Cada cambio manda el estado que se veía. Si otra persona lo cambió mientras
// tanto, el servidor responde 409 sin tocar nada: se muestra el aviso y se
// vuelve a pedir el pedido para ver su estado actual.
//
// Número de guía opcional, hasta 60 caracteres: se puede escribir al marcar
// como enviado o después. Si se escribe, la clienta lo ve en su pedido.

const TRACKING_MAX = 60;

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export const OrderDetail = () => {
    const { id } = useParams();
    const location = useLocation();
    const validId = /^\d+$/.test(id);
    // Para volver a la lista con los mismos filtros (los manda la lista al abrir).
    const backTo = `/admin/pedidos${location.state?.from ?? ""}`;

    const [loaded, setLoaded] = useState({ status: "loading" });
    const [order, setOrder] = useState(null);
    const [notice, setNotice] = useState(null); // { kind: "success" | "error", text }
    const [busy, setBusy] = useState(null); // "next", "previous" o "tracking"
    const [tracking, setTracking] = useState("");
    const [trackingError, setTrackingError] = useState("");

    const showOrder = useCallback((data) => {
        setOrder(data);
        setTracking(data.tracking_number ?? "");
        setTrackingError("");
    }, []);

    useEffect(() => {
        if (!validId) return undefined;
        const controller = new AbortController();
        getAdminOrder(id, controller.signal)
            .then((data) => {
                showOrder(data.order);
                setLoaded({ status: "ready" });
            })
            .catch((error) => {
                if (!controller.signal.aborted) setLoaded({ status: "error", error });
            });
        return () => controller.abort();
    }, [id, validId, showOrder]);

    if (!validId) return <AdminNotFound />;
    if (loaded.status === "error" && loaded.error?.status === 401) return <Navigate to="/admin/entrar" replace />;
    if (loaded.status === "error" && loaded.error?.status === 404) return <OrderNotFound backTo={backTo} />;

    // Tras un 409 (otra persona lo cambió), se vuelve a pedir el pedido.
    const reload = () =>
        getAdminOrder(id)
            .then((data) => showOrder(data.order))
            .catch(() => {});

    const handleError = (error, field) => {
        if (error.status === 401) {
            setLoaded({ status: "error", error });
            return;
        }
        if (field && error.errors?.tracking_number) {
            setTrackingError(error.errors.tracking_number);
            setNotice(null);
            return;
        }
        setNotice({ kind: "error", text: error.message });
        if (error.status === 409) reload();
    };

    const changeStatus = async (direction) => {
        const target = direction === "next" ? order.next_status : order.previous_status;
        const question =
            direction === "next"
                ? `¿Marcar el pedido ${order.folio} como ${STATUS_WORDS[target]}?`
                : `¿Volver el pedido ${order.folio} a ${STATUS_WORDS[target]}? Se borra la fecha en que se marcó como ${STATUS_WORDS[order.status]}.`;
        if (!window.confirm(question)) return;
        setBusy(direction);
        setNotice(null);
        try {
            // La guía va solo al marcar como enviado; después se cambia aparte.
            const guide = target === "shipped" ? tracking : undefined;
            const data = await setOrderStatus(order.id, target, order.status, guide);
            showOrder(data.order);
            setNotice({ kind: "success", text: data.message });
        } catch (error) {
            handleError(error, target === "shipped");
        }
        setBusy(null);
    };

    const saveTracking = async (event) => {
        event.preventDefault();
        setBusy("tracking");
        setNotice(null);
        try {
            const data = await setOrderTracking(order.id, tracking);
            showOrder(data.order);
            setNotice({ kind: "success", text: data.message });
        } catch (error) {
            handleError(error, true);
        }
        setBusy(null);
    };

    const title = order?.folio ?? "Pedido";

    return (
        <div>
            <nav aria-label="Migas" className="text-sm text-muted">
                <ol className="flex flex-wrap items-center gap-x-1.5">
                    <li>
                        <Link to={backTo} className={`rounded-sm font-semibold text-primary hover:underline ${FOCUS}`}>
                            Pedidos
                        </Link>
                    </li>
                    <li aria-hidden="true">»</li>
                    <li aria-current="page">{title}</li>
                </ol>
            </nav>

            <div className="mt-3 flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-semibold uppercase lg:text-4xl">{title}</h1>
                {order && <OrderStatus order={order} />}
            </div>
            {order && <p className="mt-1 text-muted">Hecho el {dateTimeText(order.created_at)}</p>}

            <div role="status" className="empty:hidden">
                {notice?.kind === "success" && (
                    <p className="mt-4 flex items-start gap-2.5 rounded-lg border border-line bg-surface px-3.5 py-3 text-sm font-semibold">
                        <CheckIcon />
                        <span>{notice.text}</span>
                    </p>
                )}
            </div>
            {notice?.kind === "error" && (
                <p
                    role="alert"
                    className="mt-4 flex items-start gap-2 rounded-lg border border-alert bg-alert-soft px-3.5 py-3 text-sm font-semibold"
                >
                    <AlertIcon />
                    <span>{notice.text}</span>
                </p>
            )}

            {loaded.status === "loading" && (
                <p role="status" className="mt-6 text-muted">
                    Cargando el pedido…
                </p>
            )}
            {loaded.status === "error" && <LoadError what="el pedido" />}

            {order && (
                <div className="mt-6 grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
                    <div className="flex min-w-0 flex-col gap-5 xl:col-start-2 xl:row-start-1">
                        <StatusSection
                            order={order}
                            busy={busy}
                            tracking={tracking}
                            trackingError={trackingError}
                            onTracking={(value) => {
                                setTracking(value);
                                setTrackingError("");
                            }}
                            onChange={changeStatus}
                        />
                        {/* Con el pedido ya enviado (o pagado, si se quiere apuntar
                            antes), la guía se cambia aparte. */}
                        {order.status in STATUS_WORDS && order.next_status !== "shipped" && (
                            <TrackingSection
                                order={order}
                                busy={busy}
                                tracking={tracking}
                                error={trackingError}
                                onTracking={(value) => {
                                    setTracking(value);
                                    setTrackingError("");
                                }}
                                onSave={saveTracking}
                            />
                        )}
                    </div>

                    <div className="flex min-w-0 flex-col gap-5 xl:col-start-1 xl:row-span-2 xl:row-start-1">
                        <ItemsSection order={order} />
                    </div>

                    <div className="flex min-w-0 flex-col gap-5 xl:col-start-2 xl:row-start-2">
                        <AddressSection address={order.shipping_address} />
                        <ContactSection order={order} />
                    </div>
                </div>
            )}
        </div>
    );
};

const StatusSection = ({ order, busy, tracking, trackingError, onTracking, onChange }) => {
    const steps = [
        { label: "Hecho", date: order.created_at },
        { label: "Pagado", date: order.paid_at },
        { label: "Enviado", date: order.shipped_at },
        { label: "Entregado", date: order.delivered_at },
    ];
    const disabled = busy !== null;
    return (
        <FormSection title="Estado">
            <p className="font-semibold">{statusText(order)}</p>

            {order.status === "pending" && order.reserved_until && (
                <p className="text-sm text-muted">
                    Sin pagar. Si no se paga antes del {dateTimeText(order.reserved_until)}, se cancela solo y las
                    unidades vuelven a estar disponibles.
                </p>
            )}
            {order.status === "cancelled" && (
                <p className="text-sm text-muted">
                    {order.expired
                        ? "No se pagó a tiempo: las unidades volvieron a estar disponibles."
                        : order.replaced
                          ? "La misma persona hizo un pedido nuevo desde su navegador: las unidades de este volvieron a estar disponibles."
                          : order.cancel_reason}
                </p>
            )}

            <ol className="flex flex-col gap-2 text-sm">
                {steps.map((step) => (
                    <li key={step.label} className="flex items-baseline justify-between gap-3">
                        <span className={step.date ? "font-semibold" : "text-muted"}>{step.label}</span>
                        <span className={`text-right ${step.date ? "" : "text-muted"}`}>
                            {step.date ? shortDateTimeText(step.date) : "—"}
                        </span>
                    </li>
                ))}
            </ol>

            {order.next_status === "shipped" && (
                <TrackingField value={tracking} error={trackingError} onChange={onTracking} disabled={disabled} />
            )}

            {(order.next_status || order.previous_status) && (
                <div className="flex flex-col gap-2">
                    {order.next_status && (
                        <Button onClick={() => onChange("next")} disabled={disabled} className="w-full">
                            {busy === "next" ? "Guardando…" : `Marcar como ${STATUS_WORDS[order.next_status]}`}
                        </Button>
                    )}
                    {order.previous_status && (
                        <Button variant="outline" onClick={() => onChange("previous")} disabled={disabled} className="w-full">
                            {busy === "previous" ? "Guardando…" : `Volver a ${STATUS_WORDS[order.previous_status]}`}
                        </Button>
                    )}
                </div>
            )}
            {order.status === "paid" && (
                <p className="text-sm text-muted">
                    Por ahora no se manda ningún correo al marcarlo como enviado: avisa a la persona por otro medio si
                    hace falta.
                </p>
            )}
        </FormSection>
    );
};

const TrackingField = ({ value, error, onChange, disabled }) => (
    <FormField
        label="Número de guía"
        optional
        help="Si lo escribes, la persona lo ve en la página de su pedido."
        error={error}
        length={value.length}
        maxLength={TRACKING_MAX}
    >
        {(field) => (
            <input
                {...field}
                type="text"
                autoComplete="off"
                value={value}
                disabled={disabled}
                onChange={(event) => onChange(event.target.value)}
                className={FIELD}
            />
        )}
    </FormField>
);

const TrackingSection = ({ order, busy, tracking, error, onTracking, onSave }) => {
    const changed = tracking.trim() !== (order.tracking_number ?? "");
    return (
        <FormSection title="Número de guía">
            <form noValidate onSubmit={onSave} className="flex flex-col gap-4">
                <TrackingField value={tracking} error={error} onChange={onTracking} disabled={busy !== null} />
                <Button type="submit" variant="outline" disabled={busy !== null || !changed} className="w-full">
                    {busy === "tracking" ? "Guardando…" : tracking.trim() ? "Guardar guía" : "Quitar guía"}
                </Button>
            </form>
        </FormSection>
    );
};

const ItemsSection = ({ order }) => {
    const pieces = order.items.reduce((sum, item) => sum + item.quantity, 0);
    const discount = Number(order.discount_amount) > 0;
    const shippingDiscount = Number(order.shipping.discount) > 0;
    return (
        <FormSection title="Productos" description={`${pieces} ${pieces === 1 ? "pieza" : "piezas"}`}>
            <ul className="divide-y divide-line">
                {order.items.map((item, index) => {
                    const onSale = item.unit_price !== item.list_unit_price;
                    return (
                        <li key={`${item.sku}-${index}`} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3 first:pt-0">
                            <div className="min-w-0 flex-1">
                                <p className="font-semibold wrap-break-word">{item.name}</p>
                                {item.variant_label && <p className="text-sm">{item.variant_label}</p>}
                                <p className="text-sm text-muted">
                                    SKU {item.sku} · {item.quantity} × {formatPrice(item.unit_price)}
                                    {onSale && (
                                        <>
                                            {" "}
                                            <span className="sr-only">Precio normal: </span>
                                            <s>{formatPrice(item.list_unit_price)}</s>
                                        </>
                                    )}
                                </p>
                                {item.campaign && <CampaignTag name={item.campaign.name} />}
                            </div>
                            <p className="font-semibold">{formatPrice(item.line_total)}</p>
                        </li>
                    );
                })}
            </ul>

            <dl className="flex flex-col gap-2 border-t border-line pt-4 text-sm">
                <Row label="Subtotal" value={formatPrice(order.subtotal)} />
                {discount && <Row label="Descuentos" value={`−${formatPrice(order.discount_amount)}`} />}
                <Row label={`Envío: ${order.shipping.method}`} value={formatPrice(order.shipping.cost)} />
                {shippingDiscount && (
                    <Row
                        label="Descuento en el envío"
                        value={`−${formatPrice(order.shipping.discount)}`}
                        note={order.shipping.campaign && <CampaignTag name={order.shipping.campaign.name} />}
                    />
                )}
                <div className="flex items-baseline justify-between gap-4 border-t border-line pt-3">
                    <dt className="font-semibold">Total</dt>
                    <dd className="text-xl font-bold">{formatPrice(order.total)}</dd>
                </div>
            </dl>
        </FormSection>
    );
};

const Row = ({ label, value, note }) => (
    <div className="flex items-baseline justify-between gap-4">
        <dt className="min-w-0 text-muted">
            <span className="wrap-break-word">{label}</span>
            {note}
        </dt>
        <dd className="shrink-0">{value}</dd>
    </div>
);

// La campaña que puso el precio: así se sabe de dónde salió cada descuento.
const CampaignTag = ({ name }) => (
    <span className="mt-1 flex items-center gap-1.5 text-sm text-muted">
        <TagIcon />
        <span className="wrap-break-word">Campaña: {name}</span>
    </span>
);

const AddressSection = ({ address }) => {
    const id = useId();
    const interior = address.interior_number ? `, int. ${address.interior_number}` : "";
    return (
        <section aria-labelledby={id} className="rounded-xl border border-line bg-surface p-5 sm:p-6">
            <h2 id={id} className="text-xl font-semibold uppercase tracking-wide">
                Envío a
            </h2>
            <address className="mt-4 flex flex-col gap-0.5 text-sm not-italic wrap-break-word">
                <span className="font-semibold">{address.recipient_name}</span>
                <span>Tel. {address.phone}</span>
                <span className="mt-2">
                    {address.street} {address.exterior_number}
                    {interior}
                </span>
                <span>Col. {address.neighborhood}</span>
                <span>
                    C.P. {address.postal_code}, {address.municipality}, {address.state}
                </span>
                {address.references && <span className="mt-2 text-muted">Referencias: {address.references}</span>}
            </address>
        </section>
    );
};

const ContactSection = ({ order }) => {
    const id = useId();
    const { contact } = order;
    return (
        <section aria-labelledby={id} className="rounded-xl border border-line bg-surface p-5 sm:p-6">
            <h2 id={id} className="text-xl font-semibold uppercase tracking-wide">
                Contacto
            </h2>
            <div className="mt-4 flex flex-col gap-0.5 text-sm">
                <span className="font-semibold wrap-break-word">
                    {contact.first_name} {contact.last_name}
                </span>
                <a href={`mailto:${contact.email}`} className={`rounded-sm underline wrap-break-word ${FOCUS}`}>
                    {contact.email}
                </a>
                <a href={`tel:+52${contact.phone}`} className={`rounded-sm underline ${FOCUS}`}>
                    {contact.phone}
                </a>
                <span className="mt-2 text-muted">
                    {order.has_account ? "Compró con su cuenta." : "Compró sin cuenta."}
                </span>
            </div>
        </section>
    );
};

const OrderNotFound = ({ backTo }) => (
    <>
        <h1 className="text-3xl font-semibold uppercase lg:text-4xl">Pedido no encontrado</h1>
        <p className="mt-2 text-muted">Revisa el folio en la lista de pedidos.</p>
        <Button to={backTo} className="mt-6">
            Ir a Pedidos
        </Button>
    </>
);

// Iconos dibujados aquí mismo (SVG), sin librerías.
const iconProps = (size, strokeWidth) => ({
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
});

const CheckIcon = () => (
    <svg {...iconProps(20, 2.2)} className="shrink-0 text-accent">
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12.5l2.5 2.5L16 9.5" />
    </svg>
);

const TagIcon = () => (
    <svg {...iconProps(16, 1.8)} className="shrink-0">
        <path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" />
        <circle cx="8" cy="8" r="1.5" />
    </svg>
);
