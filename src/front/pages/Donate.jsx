import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createDonation, getDonationOptions, payDonation } from "../api/donations";
import { Button } from "../components/Button";
import { AlertIcon, FormField } from "../components/FormField";
import { TextField } from "../components/TextField";
import { usePageTitle } from "../hooks/usePageTitle";
import { useRequest } from "../hooks/useRequest";
import { apiErrorText } from "../utils/apiErrorText";
import { formatPrice } from "../utils/formatPrice";

// Hacer un donativo (/donaciones), tarea 4.9. Maqueta aprobada el 23 oct
// (design/maquetas/donaciones-*.png): texto y "Cómo funciona" a la izquierda y
// el formulario en una tarjeta a la derecha; en móvil, uno debajo del otro.
//
// - Monto libre, sin montos sugeridos. El mínimo (20.00) lo valida el servidor;
//   aquí solo se muestra. Nombre completo y correo; ni país ni dirección.
// - Al continuar: se crea el donativo, se pide la orden de Mercado Pago y se
//   lleva a su página de pago. Si Mercado Pago falla, se lleva a la página
//   del donativo (/donativo/<token>), que tiene su propio botón para reintentar.
// - Al confirmarse el pago llega un correo a quien dona (tarea 5.2): el paso 3
//   lo dice, como la maqueta.
// - Los textos salen de mhpvm.org (donativos): la congregación los revisa.
// - Nada sobre deducibilidad ni facturación (CLAUDE.md, Reglas de negocio).

const LINK =
    "rounded-sm font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const STEPS = [
    "Escribe el monto que quieres donar.",
    "Paga de forma segura con Mercado Pago.",
    "Te mandamos la confirmación a tu correo y también la verás en la página de tu donativo.",
];

const EMPTY = { amount: "", donor_name: "", email: "", privacy_accepted: false };

export const Donate = () => {
    usePageTitle("Donativos");
    const navigate = useNavigate();
    const options = useRequest(getDonationOptions);
    const [form, setForm] = useState(EMPTY);
    const [errors, setErrors] = useState({});
    const [alert, setAlert] = useState(null);
    const [sending, setSending] = useState(false);
    const formRef = useRef(null);

    // Si Mercado Pago tarda y la persona vuelve con Atrás, el botón vuelve a funcionar.
    useEffect(() => {
        const reset = (event) => {
            if (event.persisted) setSending(false);
        };
        window.addEventListener("pageshow", reset);
        return () => window.removeEventListener("pageshow", reset);
    }, []);

    // Con errores del servidor, el foco va al primer campo marcado.
    useEffect(() => {
        if (Object.keys(errors).length === 0) return;
        formRef.current?.querySelector('[aria-invalid="true"]')?.focus();
    }, [errors]);

    const setField = useCallback((name, value) => {
        setForm((current) => ({ ...current, [name]: value }));
        setErrors((current) => {
            if (!current[name]) return current;
            const next = { ...current };
            delete next[name];
            return next;
        });
    }, []);

    const available = options.data?.payment_available !== false; // si falla la consulta, decide el servidor
    const minAmount = options.data?.min_amount;

    const submit = async (event) => {
        event.preventDefault();
        if (sending) return;
        setSending(true);
        setAlert(null);
        let token;
        try {
            const donation = await createDonation({ ...form, amount: form.amount.trim() });
            token = donation.access_token;
        } catch (error) {
            setErrors(error.errors ?? {});
            if (!error.errors) setAlert(apiErrorText(error));
            setSending(false);
            return;
        }
        try {
            const { init_point: initPoint } = await payDonation(token);
            window.location.assign(initPoint);
        } catch {
            // El donativo ya existe: su página explica y deja reintentar el pago.
            navigate(`/donativo/${token}`, { state: { payFailed: true } });
        }
    };

    return (
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-16">
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_minmax(0,28rem)] lg:items-start lg:gap-16">
                <div>
                    <p className="font-script text-3xl text-alert lg:text-4xl">Gracias por sumarte</p>
                    <h1 className="mt-2 text-4xl font-semibold uppercase leading-none sm:text-5xl lg:text-6xl">
                        Haz un donativo
                    </h1>
                    <p className="mt-5 max-w-xl text-lg text-muted">
                        Tu donativo apoya la labor de las Misioneras Hijas de la Purísima Virgen María.
                    </p>
                    <p className="mt-4 text-lg text-muted">Tú decides el monto.</p>

                    <h2 className="mt-10 text-sm font-bold uppercase tracking-widest text-muted">Cómo funciona</h2>
                    <ol className="mt-4 flex flex-col gap-4">
                        {STEPS.map((step, index) => (
                            <li key={step} className="flex items-center gap-4">
                                <span
                                    className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-alt font-bold"
                                    aria-hidden="true"
                                >
                                    {index + 1}
                                </span>
                                <span>{step}</span>
                            </li>
                        ))}
                    </ol>
                </div>

                <form
                    ref={formRef}
                    noValidate
                    onSubmit={submit}
                    aria-label="Datos del donativo"
                    className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-5 sm:p-8"
                >
                    <FormField
                        label="¿Cuánto quieres donar?"
                        error={errors.amount}
                        help={minAmount ? `El donativo mínimo es de ${formatPrice(minAmount)}.` : undefined}
                    >
                        {(field) => (
                            <div
                                className={
                                    "flex h-16 items-center gap-2 rounded-lg border-2 bg-surface px-4 " +
                                    (field["aria-invalid"] ? "border-alert " : "border-primary ") +
                                    "focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-primary"
                                }
                            >
                                <span className="text-2xl font-bold" aria-hidden="true">
                                    $
                                </span>
                                <input
                                    {...field}
                                    name="amount"
                                    type="text"
                                    inputMode="decimal"
                                    autoComplete="off"
                                    placeholder="0.00"
                                    maxLength={12}
                                    value={form.amount}
                                    onChange={(event) => setField("amount", event.target.value)}
                                    className="min-w-0 flex-1 bg-surface text-2xl font-bold text-primary outline-none placeholder:text-muted"
                                />
                                <span className="text-sm font-semibold text-muted">MXN</span>
                            </div>
                        )}
                    </FormField>

                    <TextField
                        label="Nombre completo"
                        name="donor_name"
                        value={form.donor_name}
                        error={errors.donor_name}
                        onChange={setField}
                        autoComplete="name"
                        maxLength={150}
                    />
                    <TextField
                        label="Correo electrónico"
                        name="email"
                        type="email"
                        value={form.email}
                        error={errors.email}
                        onChange={setField}
                        autoComplete="email"
                        maxLength={254}
                        help="Lo usamos solo para tu donativo y para mandarte su confirmación."
                    />

                    <div>
                        <label className="flex items-start gap-3 text-sm">
                            <input
                                type="checkbox"
                                name="privacy_accepted"
                                checked={form.privacy_accepted}
                                onChange={(event) => setField("privacy_accepted", event.target.checked)}
                                aria-invalid={errors.privacy_accepted ? true : undefined}
                                aria-describedby={errors.privacy_accepted ? "donation-privacy-error" : undefined}
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
                            <p id="donation-privacy-error" className="mt-2 flex items-start gap-1.5 text-sm font-semibold">
                                <AlertIcon className="text-alert" />
                                <span>{errors.privacy_accepted}</span>
                            </p>
                        )}
                    </div>

                    {/* Siempre existe, para que el lector de pantalla lea el error. */}
                    <p role="alert" className="text-sm text-primary empty:hidden">
                        {alert && <span className="block rounded-xl border border-alert bg-alert-soft px-4 py-3">{alert}</span>}
                    </p>

                    <Button
                        type="submit"
                        disabled={sending || !available}
                        aria-busy={sending}
                        aria-describedby="donation-pay-help"
                        className="w-full"
                    >
                        {sending ? "Abriendo Mercado Pago…" : "Continuar al pago"}
                    </Button>
                    <p id="donation-pay-help" className="flex items-center justify-center gap-2 text-center text-sm text-muted">
                        {available ? (
                            <>
                                <LockIcon />
                                Pago seguro con Mercado Pago
                            </>
                        ) : (
                            "Por ahora no se pueden recibir donativos en línea. Intenta más tarde."
                        )}
                    </p>
                </form>
            </div>
        </div>
    );
};

const LockIcon = () => (
    <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="shrink-0"
    >
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
);
