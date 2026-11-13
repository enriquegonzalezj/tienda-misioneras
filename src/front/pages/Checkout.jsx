import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getAccount } from "../api/account";
import { priceCart } from "../api/cart";
import { createOrder, getCheckoutOptions } from "../api/checkout";
import { readPendingOrder, savePendingOrder } from "../cart/pendingOrder";
import { useCart } from "../cart/CartContext";
import { Button } from "../components/Button";
import { AddressFields, addressFromForm, addressToForm, EMPTY_ADDRESS } from "../components/AddressFields";
import { CheckoutSummary } from "../components/CheckoutSummary";
import { AlertIcon } from "../components/FormField";
import { TextField } from "../components/TextField";
import { usePageTitle } from "../hooks/usePageTitle";
import { formatPrice } from "../utils/formatPrice";
import { nextQuery } from "../utils/safeRedirect";

// Página de pago (tarea 4.2), en /pago. Sin maqueta (decisión de Enrique, 6 nov):
// mismos tokens y estilo que el carrito. Escritorio: formulario a la izquierda y
// resumen fijo a la derecha; móvil: resumen plegable arriba y el total junto al
// botón al final.
//
// - Con o sin cuenta (tarea 4.4). Con sesión de cliente (GET /api/account) el
//   formulario sale rellenado con sus datos y su dirección; el correo es el de
//   la cuenta y no se edita (el servidor responde 400 si llega otro, así el
//   límite de 5 pedidos por correo no se salta), y la casilla "Guardar esta
//   dirección en mi cuenta" (marcada) manda save_address. Sin sesión, enlace
//   "¿Tienes cuenta? Entrar" que vuelve aquí. Con sesión de administración, o si
//   la cuenta no se puede cargar, se compra como invitada: pagar nunca exige
//   sesión.
//
// - Importes: siempre del servidor. Cada vez que cambia el carrito o la
//   paquetería se pide POST /api/cart con shipping_method_id, que devuelve envío
//   y total. Ese mismo total viaja como expected_total: si el servidor calcula
//   otro, no crea el pedido (409 total_changed).
// - Lo agotado se queda en el carrito y no entra en el pedido (decisión de
//   Enrique, 11 nov): solo se mandan las líneas disponibles, con aviso.
// - Valida el servidor (FormField, compartido con el panel): los
//   errores salen bajo cada campo y el foco va al primero, centrado en pantalla.
// - Al crear el pedido (201) se guarda su token (cart/pendingOrder.js) y se va a
//   /pedido/<token>. El carrito NO se vacía: se vacía al confirmarse el pago (4.6).

const CONTAINER = "mx-auto max-w-6xl px-4 sm:px-6";
const COLUMNS = "grid gap-8 lg:grid-cols-[2fr_1fr] lg:items-start lg:gap-16";
const SECTION = "rounded-2xl border border-line p-5 sm:p-6";
const SECTION_TITLE = "text-xl font-semibold uppercase tracking-wide";
const LINK = "rounded-sm font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const EMPTY_FORM = {
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    ...EMPTY_ADDRESS,
    privacy_accepted: false,
    save_address: true,
};

// El formulario rellenado con la cuenta: datos de GET /api/account y su
// dirección (sin dirección guardada, esos campos vacíos).
const formFromAccount = ({ user, address }) => ({
    ...EMPTY_FORM,
    first_name: user.first_name ?? "",
    last_name: user.last_name ?? "",
    email: user.email,
    phone: user.phone ?? "",
    ...addressToForm(address),
});

const removedText = (count) =>
    count === 1
        ? "Quitamos 1 producto que ya no está disponible. Revisa el total antes de continuar."
        : `Quitamos ${count} productos que ya no están disponibles. Revisa el total antes de continuar.`;
const soldOutText = (count) =>
    count === 1
        ? "1 producto agotado se queda en tu carrito y no entra en este pedido."
        : `${count} productos agotados se quedan en tu carrito y no entran en este pedido.`;
const minutesText = (seconds) => {
    const minutes = Math.max(1, Math.ceil(seconds / 60));
    return minutes === 1 ? "1 minuto" : `${minutes} minutos`;
};

const Notice = ({ tone = "info", children, focusRef }) => (
    <div
        ref={focusRef}
        tabIndex={focusRef ? -1 : undefined}
        role={tone === "error" ? "alert" : undefined}
        className={`rounded-xl px-4 py-3 text-sm text-primary outline-none ${tone === "error" ? "border border-alert bg-alert-soft" : "bg-highlight-soft"}`}
    >
        {children}
    </div>
);

const ShippingOptions = ({ methods, selected, error, onSelect }) => {
    const errorId = "shipping-method-error";
    return (
        <fieldset aria-describedby={error ? errorId : undefined}>
            {/* legend no recibe el estilo de los títulos (index.css): font-display a mano. */}
            <legend className={`${SECTION_TITLE} font-display`}>Paquetería</legend>
            {methods.length === 0 ? (
                <p className="mt-4 text-primary">Por ahora no podemos recibir pedidos. Inténtalo más tarde.</p>
            ) : (
                <div className="mt-4 space-y-3">
                    {methods.map((method) => (
                        <label
                            key={method.id}
                            className={
                                "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors " +
                                "has-checked:border-primary has-checked:bg-surface-alt has-focus-visible:outline-2 " +
                                `has-focus-visible:outline-offset-2 has-focus-visible:outline-primary ${error ? "border-alert" : "border-field"}`
                            }
                        >
                            <input
                                type="radio"
                                name="shipping_method_id"
                                value={method.id}
                                checked={selected === method.id}
                                onChange={() => onSelect(method.id)}
                                aria-invalid={error ? true : undefined}
                                className="mt-0.5 size-5 shrink-0 accent-primary focus:outline-none"
                            />
                            <span className="min-w-0 flex-1">
                                <span className="block font-semibold text-primary wrap-break-word">{method.name}</span>
                                {method.delivery_time && (
                                    <span className="block text-sm text-muted">Entrega estimada: {method.delivery_time}</span>
                                )}
                            </span>
                            <span className="shrink-0 font-semibold text-primary">
                                {Number(method.price) === 0 ? "Gratis" : formatPrice(method.price)}
                            </span>
                        </label>
                    ))}
                </div>
            )}
            {error && (
                <p id={errorId} className="mt-2 flex items-start gap-1.5 text-sm font-semibold">
                    <AlertIcon className="text-alert" />
                    <span>{error}</span>
                </p>
            )}
        </fieldset>
    );
};

const PULSE = "rounded-lg bg-surface-alt motion-safe:animate-pulse";
const Loading = () => (
    <div className={`mt-8 ${COLUMNS}`} aria-busy="true">
        <span className="sr-only">Cargando…</span>
        <div className="space-y-6">
            <div className={`h-72 rounded-2xl ${PULSE}`} />
            <div className={`h-96 rounded-2xl ${PULSE}`} />
        </div>
        <div className={`h-64 rounded-2xl ${PULSE} lg:col-start-2 lg:row-start-1`} />
    </div>
);

const Empty = ({ title, text, to, action }) => (
    <div className="mt-8 flex flex-col items-center rounded-2xl border border-line px-6 py-14 text-center">
        <p className="text-lg font-semibold text-primary">{title}</p>
        <p className="mt-2 text-muted">{text}</p>
        <Button to={to} className="mt-6">
            {action}
        </Button>
    </div>
);

export const Checkout = () => {
    usePageTitle("Pago");
    const navigate = useNavigate();
    const { items, removeItems } = useCart();

    // Paqueterías, estados y minutos de reserva (GET /api/checkout/options).
    const [options, setOptions] = useState(null);
    const [optionsError, setOptionsError] = useState(null);
    const [shippingId, setShippingId] = useState(null);

    // Respuesta de POST /api/cart con la paquetería elegida.
    const [quote, setQuote] = useState(null);
    const [quoteStatus, setQuoteStatus] = useState("loading"); // loading | updating | ready | error
    const [quoteError, setQuoteError] = useState(null);
    const [retry, setRetry] = useState(0);

    // Quién compra: loading, customer (sesión de cliente), admin o guest.
    const [buyer, setBuyer] = useState("loading");
    const [form, setForm] = useState(EMPTY_FORM);
    const [errors, setErrors] = useState({});
    const [alert, setAlert] = useState(null); // { tone, text, cart? }
    const [notice, setNotice] = useState(null); // { text, id }
    const [insufficient, setInsufficient] = useState([]);
    const [sending, setSending] = useState(false);
    // Cambia con cada intento fallido, para colocar el foco cuando ya está dibujado.
    const [focusRequest, setFocusRequest] = useState(0);
    const formRef = useRef(null);
    const alertRef = useRef(null);

    const showNotice = (text) => setNotice((previous) => ({ text, id: (previous?.id ?? 0) + 1 }));

    const loadOptions = useCallback((signal) => {
        setOptionsError(null);
        return getCheckoutOptions({ signal })
            .then((data) => {
                if (signal?.aborted) return;
                setOptions(data);
                // Con una sola paquetería no hay nada que elegir.
                if (data.shipping_methods.length === 1) setShippingId(data.shipping_methods[0].id);
            })
            .catch((error) => {
                if (!signal?.aborted) setOptionsError(error);
            });
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        loadOptions(controller.signal);
        return () => controller.abort();
    }, [loadOptions]);

    // La cuenta, si hay sesión. Se pide una vez al abrir; hasta saberlo se ve el
    // esqueleto, para no rellenar el formulario con la página ya a la vista.
    useEffect(() => {
        const controller = new AbortController();
        getAccount(controller.signal)
            .then((data) => {
                if (controller.signal.aborted) return;
                setForm(formFromAccount(data));
                setBuyer("customer");
            })
            .catch((error) => {
                if (controller.signal.aborted) return;
                // 401: sin sesión. 403: cuenta de administración (el servidor la
                // trata como invitada). Otro error: también invitada, para no
                // impedir la compra; si el correo no fuera el de la cuenta, el
                // servidor lo para con un 400.
                setBuyer(error.status === 403 ? "admin" : "guest");
            });
        return () => controller.abort();
    }, []);

    // Importes: cada vez que cambia el carrito o la paquetería.
    useEffect(() => {
        if (items.length === 0) {
            setQuote(null);
            setQuoteStatus("ready");
            return undefined;
        }
        const controller = new AbortController();
        setQuoteStatus((current) => (current === "loading" ? "loading" : "updating"));
        priceCart(items, { signal: controller.signal, shippingMethodId: shippingId })
            .then((data) => {
                if (controller.signal.aborted) return;
                setQuote(data);
                setQuoteError(null);
                setQuoteStatus("ready");
                if (data.removed.length > 0) {
                    showNotice(removedText(data.removed.length));
                    removeItems(data.removed); // este efecto vuelve a pedir con el carrito limpio
                }
                if (data.shipping_unavailable) {
                    // La paquetería se apagó mientras la página estaba abierta.
                    setShippingId(null);
                    setErrors((current) => ({ ...current, shipping_method_id: "Ya no está disponible: elige otra." }));
                    loadOptions();
                }
            })
            .catch((error) => {
                if (controller.signal.aborted) return;
                setQuoteError(error);
                setQuoteStatus("error");
            });
        return () => controller.abort();
    }, [items, shippingId, retry, removeItems, loadOptions]);

    // Foco tras un intento fallido: el primer campo con error, en el orden del
    // formulario y centrado (la cabecera no lo tapa); si no, el aviso de arriba.
    useEffect(() => {
        if (focusRequest === 0) return;
        const firstError = [...(formRef.current?.elements ?? [])].find((element) => errors[element.name]);
        const target = firstError ?? alertRef.current;
        target?.focus({ preventScroll: true });
        target?.scrollIntoView({ block: "center" });
    }, [focusRequest]); // eslint-disable-line react-hooks/exhaustive-deps

    const setField = (name, value) => {
        setForm((current) => ({ ...current, [name]: value }));
        // El error de un campo se quita al corregirlo.
        if (errors[name]) setErrors((current) => ({ ...current, [name]: undefined }));
    };

    const selectShipping = (id) => {
        setShippingId(id);
        if (errors.shipping_method_id) setErrors((current) => ({ ...current, shipping_method_id: undefined }));
    };

    const quantities = new Map(items.map((item) => [item.variant_id, item.quantity]));
    const shown = (quote?.items ?? []).filter((line) => quantities.has(line.variant_id));
    const lines = shown.filter((line) => line.available);
    const soldOut = shown.length - lines.length;
    const stale = quoteStatus === "updating";
    const methods = options?.shipping_methods ?? [];

    // El servidor rechazó el correo: la sesión cambió en otra pestaña (se entró con
    // otra cuenta o se cerró). Se vuelve a pedir la cuenta y solo se cambia el
    // correo (o se pasa a invitada), sin tocar lo demás que ya está escrito.
    const refreshAccountEmail = () => {
        getAccount()
            .then((data) => setForm((current) => ({ ...current, email: data.user.email })))
            .catch((error) => setBuyer(error.status === 403 ? "admin" : "guest"));
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (sending || stale) return;
        setAlert(null);
        setInsufficient([]);

        // Única comprobación en el navegador: con la casilla marcada, el
        // servidor no puede saber que faltó el nombre de quien recibe.
        if (form.other_recipient && !form.recipient_name.trim()) {
            setErrors({ recipient_name: "Escribe el nombre de quien recibe." });
            setFocusRequest((n) => n + 1);
            return;
        }

        const {
            first_name: firstName,
            last_name: lastName,
            email,
            phone,
            privacy_accepted: privacyAccepted,
            save_address: saveAddress,
            ...address
        } = form;
        const body = {
            first_name: firstName,
            last_name: lastName,
            email,
            phone,
            ...addressFromForm(address),
            privacy_accepted: privacyAccepted,
            items: lines.map((line) => ({ variant_id: line.variant_id, quantity: quantities.get(line.variant_id) })),
            shipping_method_id: shippingId,
            expected_total: quote?.total ?? "",
        };
        if (buyer === "customer") body.save_address = saveAddress;
        const previousToken = readPendingOrder();
        if (previousToken) body.previous_token = previousToken;

        setSending(true);
        try {
            const order = await createOrder(body);
            savePendingOrder(order.access_token);
            navigate(`/pedido/${order.access_token}`);
            return;
        } catch (error) {
            const data = error.data ?? {};
            const fieldErrors = error.errors ?? {};
            setErrors(fieldErrors);
            if (buyer === "customer" && fieldErrors.email) refreshAccountEmail();
            if (error.status === 409 && data.code === "unavailable") {
                removeItems(data.removed ?? []);
                setAlert({ tone: "error", text: removedText((data.removed ?? []).length) });
            } else if (error.status === 409 && data.code === "insufficient") {
                setInsufficient(data.insufficient ?? []);
                setAlert({
                    tone: "error",
                    text: "No hay suficientes unidades de algunos productos. Ajusta las cantidades en el carrito.",
                    cart: true,
                });
            } else if (error.status === 409 && data.code === "shipping_unavailable") {
                setOptions((current) => ({ ...current, shipping_methods: data.shipping_methods ?? [] }));
                setShippingId(null);
            } else if (error.status === 409 && data.code === "total_changed") {
                setRetry((n) => n + 1); // vuelve a pedir los importes
                setAlert({ tone: "error", text: error.message });
            } else if (error.status === 429) {
                setAlert({
                    tone: "error",
                    text: error.retryAfter
                        ? `Hiciste varios pedidos seguidos. Inténtalo de nuevo en ${minutesText(error.retryAfter)}.`
                        : "Hiciste varios pedidos seguidos. Inténtalo de nuevo más tarde.",
                });
            } else if (Object.keys(fieldErrors).length === 0) {
                setAlert({ tone: "error", text: error.message });
            }
            setFocusRequest((n) => n + 1);
        }
        setSending(false);
    };

    let content;
    if (items.length === 0) {
        content = (
            <Empty title="Tu carrito está vacío" text="Agrega productos desde la tienda para poder pagar." to="/tienda" action="Ver la tienda" />
        );
    } else if (!quote || !options || buyer === "loading") {
        const error = optionsError ?? (quoteStatus === "error" ? quoteError : null);
        content = error ? (
            <div className="mt-8">
                <Notice tone="error">
                    <p>{error.message ?? "No pudimos cargar la página."}</p>
                    <button
                        type="button"
                        className={`mt-2 ${LINK}`}
                        onClick={() => {
                            if (optionsError) loadOptions();
                            setRetry((n) => n + 1);
                        }}
                    >
                        Reintentar
                    </button>
                </Notice>
            </div>
        ) : (
            <Loading />
        );
    } else if (lines.length === 0) {
        content = (
            <Empty
                title="No hay nada disponible para pagar"
                text="Los productos de tu carrito están agotados."
                to="/carrito"
                action="Volver al carrito"
            />
        );
    } else {
        const canSubmit = methods.length > 0 && quoteStatus === "ready" && !sending;
        content = (
            <>
                <div className="mt-4 space-y-3 empty:hidden">
                    {soldOut > 0 && <Notice>{soldOutText(soldOut)}</Notice>}
                    {quoteStatus === "error" && (
                        <Notice tone="error">
                            <p>{quoteError?.message ?? "No pudimos actualizar el total."}</p>
                            <button type="button" className={`mt-2 ${LINK}`} onClick={() => setRetry((n) => n + 1)}>
                                Reintentar
                            </button>
                        </Notice>
                    )}
                    {alert && (
                        <Notice tone="error" focusRef={alertRef}>
                            <p>{alert.text}</p>
                            {alert.cart && (
                                <Link to="/carrito" className={`mt-2 inline-block ${LINK}`}>
                                    Ir al carrito
                                </Link>
                            )}
                        </Notice>
                    )}
                </div>

                <div className={`mt-6 ${COLUMNS}`}>
                    <div className="lg:col-start-2 lg:row-start-1">
                        <CheckoutSummary
                            lines={lines}
                            quantities={quantities}
                            quote={quote}
                            stale={stale}
                            insufficient={insufficient}
                        />
                    </div>

                    <form ref={formRef} noValidate onSubmit={handleSubmit} className="space-y-6 lg:col-start-1 lg:row-start-1">
                        <section aria-labelledby="checkout-contact" className={SECTION}>
                            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                                <h2 id="checkout-contact" className={SECTION_TITLE}>
                                    Contacto
                                </h2>
                                {buyer === "guest" && (
                                    <p className="text-sm text-muted">
                                        ¿Tienes cuenta?{" "}
                                        <Link to={`/cuenta/entrar${nextQuery("/pago")}`} className={`text-primary ${LINK}`}>
                                            Entrar
                                        </Link>
                                    </p>
                                )}
                            </div>
                            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                <TextField label="Nombre(s)" name="first_name" value={form.first_name} error={errors.first_name} onChange={setField} autoComplete="given-name" maxLength={80} />
                                <TextField label="Apellidos" name="last_name" value={form.last_name} error={errors.last_name} onChange={setField} autoComplete="family-name" maxLength={80} />
                                {buyer === "customer" ? (
                                    <TextField label="Correo" name="email" type="email" value={form.email} error={errors.email} onChange={setField} autoComplete="email" readOnly help="Es el correo de tu cuenta." />
                                ) : (
                                    <TextField label="Correo" name="email" type="email" value={form.email} error={errors.email} onChange={setField} autoComplete="email" maxLength={254} help="Ahí te escribiremos sobre tu pedido." />
                                )}
                                <TextField label="Teléfono" name="phone" type="tel" inputMode="numeric" value={form.phone} error={errors.phone} onChange={setField} autoComplete="tel-national" maxLength={16} help="10 dígitos. Para que la paquetería pueda contactarte." />
                            </div>
                        </section>

                        <section aria-labelledby="checkout-address" className={SECTION}>
                            <h2 id="checkout-address" className={SECTION_TITLE}>
                                Envío a
                            </h2>
                            <p className="mt-1 text-sm text-muted">Solo enviamos dentro de México.</p>
                            <div className="mt-4 grid gap-4 sm:grid-cols-6">
                                <AddressFields form={form} errors={errors} onChange={setField} states={options.states} />
                                {buyer === "customer" && (
                                    <div className="border-t border-line pt-4 sm:col-span-6">
                                        <label className="inline-flex cursor-pointer items-center gap-3 text-primary">
                                            <input
                                                type="checkbox"
                                                name="save_address"
                                                checked={form.save_address}
                                                onChange={(event) => setField("save_address", event.target.checked)}
                                                className="size-5 accent-primary"
                                            />
                                            Guardar esta dirección en mi cuenta
                                        </label>
                                    </div>
                                )}
                            </div>
                        </section>

                        <section className={SECTION}>
                            <ShippingOptions methods={methods} selected={shippingId} error={errors.shipping_method_id} onSelect={selectShipping} />
                        </section>

                        <section aria-label="Confirmar" className={SECTION}>
                            <label className="flex cursor-pointer items-start gap-3 text-primary">
                                <input
                                    type="checkbox"
                                    name="privacy_accepted"
                                    checked={form.privacy_accepted}
                                    onChange={(event) => setField("privacy_accepted", event.target.checked)}
                                    aria-invalid={errors.privacy_accepted ? true : undefined}
                                    aria-describedby={errors.privacy_accepted ? "privacy-error" : undefined}
                                    className="mt-0.5 size-5 shrink-0 accent-primary"
                                />
                                <span>
                                    He leído y acepto el{" "}
                                    {/* En otra pestaña, para no perder lo escrito. Existe desde la 5.4. */}
                                    <a href="/aviso-de-privacidad" target="_blank" rel="noopener" className={LINK}>
                                        aviso de privacidad
                                        <span className="sr-only"> (se abre en otra pestaña)</span>
                                    </a>
                                    .
                                </span>
                            </label>
                            {errors.privacy_accepted && (
                                <p id="privacy-error" className="mt-2 flex items-start gap-1.5 text-sm font-semibold">
                                    <AlertIcon className="text-alert" />
                                    <span>{errors.privacy_accepted}</span>
                                </p>
                            )}

                            <div className="mt-6 flex items-baseline justify-between gap-4 border-t border-line pt-5">
                                <p className="font-semibold text-primary">Total</p>
                                <p className={`text-2xl font-bold text-primary transition-opacity ${stale ? "opacity-50" : ""}`}>
                                    {quote.total ? formatPrice(quote.total) : "Elige una paquetería"}
                                </p>
                            </div>
                            <Button type="submit" disabled={!canSubmit} aria-busy={sending} className="mt-5 w-full">
                                {sending ? "Apartando tus productos…" : "Continuar al pago"}
                            </Button>
                            <p className="mt-3 text-center text-sm text-muted">
                                Al continuar apartamos tus productos durante {options.reservation_minutes} minutos para que puedas pagar.
                            </p>
                        </section>
                    </form>
                </div>
            </>
        );
    }

    return (
        <main className={`${CONTAINER} pb-16 pt-8 lg:pb-20 lg:pt-10`}>
            <h1 className="text-3xl font-semibold uppercase tracking-wide lg:text-4xl">Pago</h1>
            {/* Siempre existe, para que el lector de pantalla lea cada aviso nuevo. */}
            <div role="status" className="text-sm">
                {notice && (
                    <p key={notice.id} className="mt-4 rounded-xl bg-highlight-soft px-4 py-3 text-primary">
                        {notice.text}
                    </p>
                )}
            </div>
            {content}
        </main>
    );
};
