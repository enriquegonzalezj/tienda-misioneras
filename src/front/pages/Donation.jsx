import { useCallback, useEffect, useState } from "react";
import { useLocation, useParams, useSearchParams } from "react-router-dom";
import { getDonation, payDonation } from "../api/donations";
import { Button } from "../components/Button";
import { usePageTitle } from "../hooks/usePageTitle";
import { apiErrorText } from "../utils/apiErrorText";
import { formatPrice } from "../utils/formatPrice";

// Página de un donativo (/donativo/<token>), tarea 4.9. El token largo y
// aleatorio es la única llave: quien tiene el enlace lo ve. Lleva noindex y
// no-referrer (app.py).
//
// - Pendiente: botón "Pagar con Mercado Pago" (crea otra preferencia). Si se
//   llegó aquí porque Mercado Pago falló al continuar desde /donaciones, se
//   avisa arriba del botón.
// - En proceso (in_process): se generó una ficha de OXXO o una transferencia y
//   Mercado Pago avisará cuando se acredite. Sin botón, para no pagar dos veces.
// - Al volver de Mercado Pago con el pago aprobado (?status=approved), mientras
//   el webhook aún no avisa: "Confirmando tu pago" y se pide el donativo cada
//   3 s durante 1 minuto, como la página del pedido. Los datos que añade
//   Mercado Pago a la dirección se quitan.
// - Pagado: agradecimiento con la fecha. Reembolsado: lo dice.
// - Hasta los correos (5.2), el enlace es la única forma de volver: se pide
//   guardarlo y hay un botón para copiarlo.

const CONFIRM_EVERY_MS = 3000;
const CONFIRM_FOR_MS = 60_000;
const CONTAINER = "mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-16";

const dateText = (iso) => new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });

const statusInfo = (donation, { confirming, slow }) => {
    if (donation.refunded) {
        return { tone: "alert", title: "Donativo reembolsado", text: "Mercado Pago te devolvió el pago de este donativo." };
    }
    if (donation.status === "paid") {
        return {
            tone: "accent",
            title: "¡Gracias por tu donativo!",
            text: donation.paid_at ? `Recibimos tu donativo el ${dateText(donation.paid_at)}.` : "Recibimos tu donativo.",
        };
    }
    if (donation.status === "cancelled") {
        return { tone: "alert", title: "Donativo cancelado", text: "Este donativo se canceló." };
    }
    if (confirming) {
        return {
            tone: "highlight",
            title: "Confirmando tu pago",
            text: "Mercado Pago nos está avisando de tu pago. Esta página se actualiza sola en unos segundos: no vuelvas a pagar.",
        };
    }
    if (donation.in_process) {
        return {
            tone: "highlight",
            title: "Pago en proceso",
            text: "Mercado Pago nos avisará cuando se acredite tu pago. Si pagaste en efectivo o por transferencia, puede tardar un poco: revisa esta página más tarde y no vuelvas a pagar.",
        };
    }
    if (slow) {
        return {
            tone: "highlight",
            title: "Pendiente de pago",
            text: "Todavía no nos llega la confirmación de Mercado Pago. Si ya pagaste, no vuelvas a pagar y revisa esta página en unos minutos.",
        };
    }
    return { tone: "highlight", title: "Pendiente de pago", text: "Tu donativo todavía no está pagado." };
};

const TONES = {
    highlight: "border-highlight bg-highlight-soft",
    alert: "border-alert bg-alert-soft",
    accent: "border-accent bg-surface-alt",
};

export const Donation = () => {
    usePageTitle("Tu donativo");
    const { token } = useParams();
    const location = useLocation();
    const [state, setState] = useState({ status: "loading", donation: null, error: null });
    const [reload, setReload] = useState(0);

    // Vuelta de Mercado Pago: se lee una vez y se limpia la dirección.
    const [searchParams, setSearchParams] = useSearchParams();
    const [returnedApproved] = useState(
        () => (searchParams.get("status") ?? searchParams.get("collection_status")) === "approved"
    );
    const [confirmExpired, setConfirmExpired] = useState(false);
    useEffect(() => {
        if ([...searchParams.keys()].length > 0) setSearchParams({}, { replace: true });
    }, [searchParams, setSearchParams]);

    const load = useCallback(
        (signal) =>
            getDonation(token, { signal })
                .then((donation) => {
                    if (!signal.aborted) setState({ status: "ready", donation, error: null });
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

    const waiting = returnedApproved && state.donation?.status === "pending" && !state.donation.in_process;
    const confirming = waiting && !confirmExpired;
    useEffect(() => {
        if (!confirming) return undefined;
        const poll = setInterval(() => setReload((n) => n + 1), CONFIRM_EVERY_MS);
        const stop = setTimeout(() => setConfirmExpired(true), CONFIRM_FOR_MS);
        return () => {
            clearInterval(poll);
            clearTimeout(stop);
        };
    }, [confirming]);

    const { donation, error } = state;
    let content;
    if (!donation && state.status === "loading") {
        content = (
            <p role="status" className="mt-6 text-muted">
                Cargando tu donativo…
            </p>
        );
    } else if (!donation) {
        content =
            error?.status === 404 ? (
                <>
                    <p className="mt-4 text-muted">Revisa que el enlace esté completo.</p>
                    <Button to="/donaciones" className="mt-6">
                        Hacer un donativo
                    </Button>
                </>
            ) : (
                <div role="alert" className="mt-8 rounded-xl border border-alert bg-alert-soft px-4 py-3 text-sm text-primary">
                    <p>{error?.message ?? "No pudimos cargar tu donativo."}</p>
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
        const info = statusInfo(donation, { confirming, slow: waiting && confirmExpired });
        const canPay = donation.status === "pending" && !donation.in_process && !confirming;
        content = (
            <>
                <p className="mt-2 text-muted">Hecho el {dateText(donation.created_at)}</p>
                <section aria-labelledby="donation-status" className={`mt-6 rounded-2xl border-l-4 px-5 py-4 ${TONES[info.tone]}`}>
                    <h2 id="donation-status" aria-live="polite" className="text-lg font-semibold uppercase tracking-wide">
                        {info.title}
                    </h2>
                    <p className="mt-1 text-primary">{info.text}</p>
                </section>
                <CopyLink />

                <dl className="mt-8 flex flex-col gap-3 rounded-2xl border border-line p-5 sm:p-6">
                    <div className="flex items-baseline justify-between gap-4">
                        <dt className="text-muted">Monto</dt>
                        <dd className="text-2xl font-bold">{formatPrice(donation.amount)} MXN</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-4">
                        <dt className="text-muted">A nombre de</dt>
                        <dd className="min-w-0 text-right font-semibold wrap-break-word">{donation.donor_name}</dd>
                    </div>
                </dl>

                {canPay && (
                    <PayButton
                        token={token}
                        available={donation.payment_available}
                        failedBefore={Boolean(location.state?.payFailed)}
                        onStale={() => setReload((n) => n + 1)}
                    />
                )}
            </>
        );
    }

    const title = donation ? `Donativo ${donation.folio}` : error?.status === 404 ? "Donativo no encontrado" : "Tu donativo";
    return (
        <div className={CONTAINER}>
            <h1 className="text-3xl font-semibold uppercase sm:text-4xl">{title}</h1>
            {content}
        </div>
    );
};

const PayButton = ({ token, available, failedBefore, onStale }) => {
    const [paying, setPaying] = useState(false);
    const [error, setError] = useState(
        failedBefore ? "No pudimos abrir Mercado Pago. Tu donativo quedó guardado: intenta pagar de nuevo." : null
    );

    useEffect(() => {
        const reset = (event) => {
            if (event.persisted) setPaying(false);
        };
        window.addEventListener("pageshow", reset);
        return () => window.removeEventListener("pageshow", reset);
    }, []);

    const pay = async () => {
        if (paying) return;
        setPaying(true);
        setError(null);
        try {
            const { init_point: initPoint } = await payDonation(token);
            window.location.assign(initPoint);
        } catch (requestError) {
            setPaying(false);
            setError(apiErrorText(requestError));
            if (requestError.status === 409) onStale();
        }
    };

    return (
        <>
            {/* Siempre existe, para que el lector de pantalla lea el error. */}
            <p role="alert" className="mt-6 text-sm text-primary empty:hidden">
                {error && <span className="block rounded-xl border border-alert bg-alert-soft px-4 py-3">{error}</span>}
            </p>
            <Button
                onClick={pay}
                disabled={paying || !available}
                aria-busy={paying}
                aria-describedby="donation-pay-help"
                className="mt-6 w-full"
            >
                {paying ? "Abriendo Mercado Pago…" : "Pagar con Mercado Pago"}
            </Button>
            <p id="donation-pay-help" className="mt-3 text-center text-sm text-muted">
                {available
                    ? "Pagarás en la página de Mercado Pago."
                    : "Por ahora no se pueden recibir donativos en línea. Intenta más tarde."}
            </p>
        </>
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
                <span className="font-semibold">Guarda este enlace</span> para consultar tu donativo más tarde.
            </p>
            <button
                type="button"
                onClick={copy}
                className="inline-flex min-h-10 items-center gap-2 rounded-full border-2 border-primary px-4 text-sm font-semibold text-primary hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
                Copiar enlace
            </button>
            {/* Siempre existe, para que el lector de pantalla lea el resultado. */}
            <p role="status" className="basis-full text-sm text-muted empty:hidden">
                {result && <span key={result.id}>{result.text}</span>}
            </p>
        </div>
    );
};
