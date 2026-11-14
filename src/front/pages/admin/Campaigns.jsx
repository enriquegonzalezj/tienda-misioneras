import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { getCampaigns } from "../../api/admin";
import { Button } from "../../components/Button";
import { LoadError } from "../../components/LoadError";
import {
    AUDIENCE_LABELS,
    CampaignStatus,
    dateRangeText,
    discountText,
    scopeText,
} from "../../components/admin/CampaignStatus";
import { useRequest } from "../../hooks/useRequest";

// Campañas del panel (/admin/campanas), tarea 4.8. Estructura aprobada por
// Enrique el 13 nov (decisión 9): la lista con nombre, estado, fechas, público,
// alcance y descuento, y "Nueva campaña". Cada campaña se abre en su
// formulario (/admin/campanas/<id>). La lista viene ordenada del servidor
// (admin_campaigns.py): de la que empieza más tarde a la más vieja.
//
// Escritorio (xl): una fila por campaña con columnas. Móvil: una tarjeta por
// campaña con los mismos datos.

const COLUMNS = "xl:grid-cols-[minmax(0,1.6fr)_8rem_minmax(0,1.4fr)_9rem_8rem_minmax(0,1.2fr)]";

const plural = (count, singular, pluralForm) => `${count} ${count === 1 ? singular : pluralForm}`;

const summary = (campaigns) => {
    if (!campaigns.length) return null;
    const running = campaigns.filter((campaign) => campaign.status === "running").length;
    return `${plural(campaigns.length, "campaña", "campañas")}, ${running} en curso`;
};

const CampaignRow = ({ campaign }) => (
    <li className={`grid grid-cols-1 gap-x-3 gap-y-1.5 px-4 py-3.5 xl:grid xl:items-center ${COLUMNS}`}>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 xl:block">
            <Link
                to={`/admin/campanas/${campaign.id}`}
                className="min-w-0 rounded-sm font-semibold wrap-break-word hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
                {campaign.name}
            </Link>
            <span className="xl:hidden">
                <CampaignStatus status={campaign.status} />
            </span>
        </div>
        <span className="hidden xl:block">
            <CampaignStatus status={campaign.status} />
        </span>
        <span className="text-sm">{dateRangeText(campaign.start_date, campaign.end_date)}</span>
        <span className="text-sm">
            <span className="text-muted xl:sr-only">Público: </span>
            {AUDIENCE_LABELS[campaign.audience]}
        </span>
        <span className="text-sm">
            <span className="text-muted xl:sr-only">Alcance: </span>
            {scopeText(campaign)}
        </span>
        <span className="text-sm font-semibold">
            <span className="font-normal text-muted xl:sr-only">Descuento: </span>
            {discountText(campaign)}
        </span>
    </li>
);

export const Campaigns = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const list = useRequest(getCampaigns);
    // Aviso que llega del formulario (por ejemplo, "Campaña borrada").
    const [notice] = useState(() => location.state?.notice ?? null);

    // El aviso que llegó con la navegación se muestra una sola vez.
    useEffect(() => {
        if (location.state?.notice) navigate(location.pathname, { replace: true, state: null });
        // Solo al abrir la pantalla.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (list.status === "error" && list.error?.status === 401) return <Navigate to="/admin/entrar" replace />;

    const campaigns = list.data?.campaigns ?? [];

    return (
        <div>
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-semibold uppercase lg:text-4xl">Campañas</h1>
                    {list.status === "ready" && summary(campaigns) && (
                        <p className="mt-1 text-muted">{summary(campaigns)}</p>
                    )}
                </div>
                <Button to="/admin/campanas/nueva" className="w-full gap-2 sm:w-auto">
                    <PlusIcon />
                    Nueva campaña
                </Button>
            </div>

            <div role="status" className="empty:hidden">
                {notice && (
                    <p className="mt-4 flex items-start gap-2.5 rounded-lg border border-line bg-surface px-3.5 py-3 text-sm font-semibold">
                        <CheckIcon />
                        <span>{notice}</span>
                    </p>
                )}
            </div>

            {list.status === "loading" && (
                <p role="status" className="mt-6 text-muted">
                    Cargando las campañas…
                </p>
            )}
            {list.status === "error" && <LoadError what="las campañas" />}

            {list.status === "ready" && (
                <section aria-label="Lista de campañas" className="mt-4 overflow-hidden rounded-xl border border-line bg-surface">
                    {campaigns.length > 0 ? (
                        <>
                            <div
                                className={`hidden gap-x-3 px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted xl:grid ${COLUMNS}`}
                                aria-hidden="true"
                            >
                                <span>Campaña</span>
                                <span>Estado</span>
                                <span>Fechas</span>
                                <span>Público</span>
                                <span>Alcance</span>
                                <span>Descuento</span>
                            </div>
                            <ul className="divide-y divide-line border-line xl:border-t">
                                {campaigns.map((campaign) => (
                                    <CampaignRow key={campaign.id} campaign={campaign} />
                                ))}
                            </ul>
                        </>
                    ) : (
                        <div className="px-4 py-8 text-center">
                            <p className="font-semibold">Todavía no hay campañas.</p>
                            <p className="mt-1 text-sm text-muted">
                                Crea una para poner descuentos con fechas: en toda la tienda o en productos elegidos.
                            </p>
                        </div>
                    )}
                </section>
            )}
        </div>
    );
};

// Iconos dibujados aquí mismo (SVG), sin librerías.
const iconProps = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
};

const PlusIcon = () => (
    <svg {...iconProps} width="18" height="18" strokeWidth="2.2" className="shrink-0">
        <path d="M12 5v14M5 12h14" />
    </svg>
);

const CheckIcon = () => (
    <svg {...iconProps} width="20" height="20" strokeWidth="2.2" className="shrink-0 text-accent">
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12.5l2.5 2.5L16 9.5" />
    </svg>
);
