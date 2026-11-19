import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getAdminDonations } from "../../api/admin";
import { Button } from "../../components/Button";
import { FIELD } from "../../components/FormField";
import { LoadError } from "../../components/LoadError";
import { dateText, plural } from "../../components/admin/OrderStatus";
import { formatPrice } from "../../utils/formatPrice";

// Donativos del panel (/admin/donativos), tarea 4.9. Mismo patrón que Pedidos
// (Orders.jsx): filtros por estado con su número (Todos, Pagados, Pendientes
// de pago), buscador por folio, nombre o correo, 25 por página, más recientes
// primero, columnas en escritorio (xl) y tarjetas en móvil. Sin pantalla de
// detalle: cada donativo cabe en su renglón. Arriba, lo recibido en total
// (suma de los pagados, antes de la comisión de Mercado Pago).
//
// Pendientes: donativos que se empezaron y no se pagaron, o con una ficha de
// OXXO o una transferencia que aún no se acredita ("Pago en proceso").
//
// Los filtros van en la dirección (/admin/donativos?estado=pagados&q=ana&pagina=2).

const PAGE_SIZE = 25;

// Filtro en la dirección (en español) -> parámetro de la API, con su etiqueta.
const FILTERS = [
    { value: "", api: "all", label: "Todos" },
    { value: "pagados", api: "paid", label: "Pagados" },
    { value: "pendientes", api: "pending", label: "Pendientes de pago" },
];
const FILTER_BY_VALUE = Object.fromEntries(FILTERS.map((filter) => [filter.value, filter]));

const COLUMNS = "xl:grid-cols-[8rem_7.5rem_minmax(0,1.6fr)_9rem_minmax(0,1fr)]";

// Última lista de cada combinación de filtros, para dibujarla al instante al
// volver a la pantalla. Después se pide de nuevo para tenerla al día.
const cache = new Map();

const readFilters = (params) => {
    const page = Number.parseInt(params.get("pagina"), 10);
    const estado = params.get("estado") ?? "";
    return {
        q: params.get("q") ?? "",
        estado: estado in FILTER_BY_VALUE ? estado : "",
        pagina: Number.isInteger(page) && page > 1 ? page : 1,
    };
};

const apiFilters = (filters) => {
    const result = {};
    if (filters.estado) result.status = FILTER_BY_VALUE[filters.estado].api;
    if (filters.q) result.q = filters.q;
    if (filters.pagina > 1) result.offset = String((filters.pagina - 1) * PAGE_SIZE);
    return result;
};

const STATUSES = {
    paid: { label: "Pagado", dot: "bg-accent" },
    pending: { label: "Pendiente de pago", dot: "bg-highlight ring-1 ring-primary" },
    in_process: { label: "Pago en proceso", dot: "bg-highlight ring-1 ring-primary" },
    refunded: { label: "Reembolsado", dot: "bg-muted" },
    cancelled: { label: "Cancelado", dot: "bg-muted" },
};

const statusKey = (donation) => {
    if (donation.refunded) return "refunded";
    if (donation.in_process) return "in_process";
    return donation.status in STATUSES ? donation.status : "cancelled";
};

// El texto siempre acompaña al color: el color solo no basta para leerlo.
const DonationStatus = ({ donation }) => {
    const { label, dot } = STATUSES[statusKey(donation)];
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-alt px-2.5 py-0.5 text-sm font-semibold">
            <span className={`size-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
            {label}
        </span>
    );
};

const DonationRow = ({ donation }) => (
    <li className={`grid grid-cols-1 gap-x-3 gap-y-1.5 px-4 py-3.5 xl:items-center ${COLUMNS}`}>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 xl:block">
            <span className="font-semibold">{donation.folio}</span>
            <span className="xl:hidden">
                <DonationStatus donation={donation} />
            </span>
        </div>
        <span className="text-sm">
            <span className="text-muted xl:sr-only">Fecha: </span>
            {dateText(donation.paid_at ?? donation.created_at)}
        </span>
        <span className="min-w-0 text-sm">
            <span className="block font-semibold wrap-break-word">{donation.donor_name}</span>
            <span className="block text-muted wrap-break-word">
                {donation.email}
                {donation.has_account && " · Con cuenta"}
            </span>
        </span>
        <span className="text-sm">
            <span className="block font-semibold">
                <span className="font-normal text-muted xl:sr-only">Monto: </span>
                {formatPrice(donation.amount)}
            </span>
            {donation.fee !== null && (
                <span className="block text-muted">Comisión: {formatPrice(donation.fee)}</span>
            )}
        </span>
        <span className="hidden xl:block">
            <DonationStatus donation={donation} />
        </span>
    </li>
);

export const Donations = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const filters = readFilters(searchParams);
    const key = JSON.stringify(apiFilters(filters));

    const [list, setList] = useState(() =>
        cache.has(key) ? { status: "ready", data: cache.get(key) } : { status: "loading", data: null }
    );
    const [searchText, setSearchText] = useState(filters.q);

    // Pedir la lista cada vez que cambian los filtros. Mientras llega, se ve
    // la guardada en `cache` (o la anterior, más tenue).
    useEffect(() => {
        const controller = new AbortController();
        const cached = cache.get(key);
        setList((previous) => {
            if (cached) return { status: "ready", data: cached, refreshing: true };
            if (previous.data) return { ...previous, refreshing: true };
            return { status: "loading", data: null };
        });
        getAdminDonations(JSON.parse(key), controller.signal)
            .then((data) => {
                cache.set(key, data);
                setList({ status: "ready", data });
            })
            .catch((error) => {
                if (controller.signal.aborted) return;
                if (error.status === 401) {
                    navigate("/admin/entrar", { replace: true });
                    return;
                }
                setList({ status: "error", data: null, error });
            });
        return () => controller.abort();
    }, [key, navigate]);

    // Si la búsqueda cambia desde fuera (Atrás), el cuadro de búsqueda la sigue.
    useEffect(() => {
        setSearchText((text) => (text.trim() === filters.q ? text : filters.q));
    }, [filters.q]);

    // Cambiar filtros o página (la página vuelve a 1 salvo que se indique).
    // Lleva también lo escrito en el buscador aunque no hayan pasado los
    // 300 ms: si no, la búsqueda pendiente se aplicaría después sobre los
    // filtros viejos y borraría el estado recién elegido.
    const updateFilters = (changes, { replace = false } = {}) => {
        const next = new URLSearchParams(searchParams);
        for (const [name, value] of Object.entries({ pagina: null, q: searchText.trim(), ...changes })) {
            if (value === null || value === "") next.delete(name);
            else next.set(name, String(value));
        }
        setSearchParams(next, { replace });
    };

    // La búsqueda se aplica 300 ms después de la última tecla.
    useEffect(() => {
        const text = searchText.trim();
        if (text === filters.q) return undefined;
        const timer = setTimeout(() => updateFilters({ q: text }, { replace: true }), 300);
        return () => clearTimeout(timer);
        // Solo depende de lo escrito y de la búsqueda aplicada.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchText, filters.q]);

    const data = list.data;
    const items = data?.items ?? [];
    const lastShown = data ? data.offset + items.length : 0;
    const hasFilters = Boolean(filters.q || filters.estado);

    return (
        <div>
            <h1 className="text-3xl font-semibold uppercase lg:text-4xl">Donativos</h1>
            {data && (
                <p className="mt-1 text-muted">
                    {plural(data.counts.paid, "donativo pagado", "donativos pagados")} ·{" "}
                    {formatPrice(data.paid_total)} recibidos en total
                </p>
            )}

            {/* Filtros por estado, con cuántos hay en cada uno. En móvil se
                deslizan de lado, como las categorías de la Tienda. */}
            <div className="-mx-4 mt-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                <div role="group" aria-label="Filtrar por estado" className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
                    {FILTERS.map((filter) => {
                        const active = filters.estado === filter.value;
                        const count = data?.counts[filter.api];
                        return (
                            <button
                                key={filter.api}
                                type="button"
                                aria-pressed={active}
                                onClick={() => updateFilters({ estado: filter.value })}
                                className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border-2 px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                                    active ? "border-primary bg-primary text-surface" : "border-line bg-surface hover:border-primary"
                                }`}
                            >
                                {filter.label}
                                {count !== undefined && <span className={active ? "" : "text-muted"}>{count}</span>}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="mt-4 rounded-xl border border-line bg-surface p-4">
                <label htmlFor="donations-search" className="mb-1.5 block text-sm font-semibold">
                    Buscar
                </label>
                <div className="relative">
                    <SearchIcon />
                    <input
                        id="donations-search"
                        type="search"
                        placeholder="Folio, nombre o correo"
                        autoComplete="off"
                        maxLength={100}
                        value={searchText}
                        onChange={(event) => setSearchText(event.target.value)}
                        className={`${FIELD} pl-10`}
                    />
                </div>
            </div>

            {list.status === "loading" && (
                <p role="status" className="mt-6 text-muted">
                    Cargando los donativos…
                </p>
            )}
            {list.status === "error" && <LoadError what="los donativos" />}

            {data && (
                <section
                    aria-label="Lista de donativos"
                    aria-busy={list.refreshing ? true : undefined}
                    className={`mt-4 overflow-hidden rounded-xl border border-line bg-surface transition-opacity ${
                        list.refreshing ? "opacity-60" : ""
                    }`}
                >
                    {items.length > 0 ? (
                        <>
                            <div
                                className={`hidden gap-x-3 px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted xl:grid ${COLUMNS}`}
                                aria-hidden="true"
                            >
                                <span>Folio</span>
                                <span>Fecha</span>
                                <span>Quién dona</span>
                                <span>Monto</span>
                                <span>Estado</span>
                            </div>
                            <ul className="divide-y divide-line border-line xl:border-t">
                                {items.map((donation) => (
                                    <DonationRow key={donation.id} donation={donation} />
                                ))}
                            </ul>
                            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3.5">
                                <span className="text-sm text-muted">
                                    Mostrando {data.offset + 1} a {lastShown} de {data.total}
                                </span>
                                {data.total > PAGE_SIZE && (
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            disabled={filters.pagina === 1}
                                            onClick={() => updateFilters({ pagina: filters.pagina - 1 })}
                                        >
                                            Anterior
                                        </Button>
                                        <Button
                                            variant="outline"
                                            disabled={lastShown >= data.total}
                                            onClick={() => updateFilters({ pagina: filters.pagina + 1 })}
                                        >
                                            Siguiente
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <EmptyList
                            total={data.total}
                            hasFilters={hasFilters}
                            onFirstPage={() => updateFilters({})}
                            onClear={() => {
                                setSearchText("");
                                setSearchParams(new URLSearchParams());
                            }}
                        />
                    )}
                </section>
            )}
        </div>
    );
};

const EmptyList = ({ total, hasFilters, onFirstPage, onClear }) => {
    // Hay donativos, pero no en esta página (por ejemplo, ?pagina=9).
    if (total > 0) {
        return (
            <div className="px-4 py-10 text-center">
                <p className="text-muted">Esta página no tiene donativos.</p>
                <Button variant="outline" className="mt-4" onClick={onFirstPage}>
                    Ir a la primera página
                </Button>
            </div>
        );
    }
    return (
        <div className="px-4 py-10 text-center">
            <p className="text-muted">{hasFilters ? "No hay donativos con estos filtros." : "Todavía no hay donativos."}</p>
            {hasFilters && (
                <Button variant="outline" className="mt-4" onClick={onClear}>
                    Quitar filtros
                </Button>
            )}
        </div>
    );
};

// Icono dibujado aquí mismo (SVG), sin librerías.
const SearchIcon = () => (
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
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
    >
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
    </svg>
);
