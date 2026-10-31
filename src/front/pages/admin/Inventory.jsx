import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { getAdminCategories, getAdminProducts, updateVariants } from "../../api/admin";
import { AlertIcon, FIELD } from "../../components/admin/FormField";
import { InventoryProduct, PRODUCT_COLUMNS } from "../../components/admin/InventoryProduct";
import { Button } from "../../components/Button";
import { LoadError } from "../../components/LoadError";
import { useRequest } from "../../hooks/useRequest";
import { useUnsavedChanges } from "../../hooks/useUnsavedChanges";
import { formatPrice } from "../../utils/formatPrice";

// Inventario del panel (/admin), tarea 2.1, paso 6.
//
// Lista de productos con sus variantes, 25 por página, con precio y existencias
// editables ahí mismo. Los cambios de varios productos se juntan y se guardan
// con la barra fija de abajo, de una vez (PATCH /api/admin/variants).
//
// Los filtros van en la dirección (/admin?q=playera&estado=ocultos&pagina=2):
// al volver con Atrás desde un producto, o al recargar, sigues donde estabas.
//
// Al guardar se manda, por cada variante cambiada, el valor que se veía. Si
// algo cambió mientras tanto (una venta, otra persona), el servidor no guarda
// nada y responde con los valores actuales: se ponen en pantalla, marcados, y
// lo que escribiste se conserva para revisarlo y guardar de nuevo.

const PAGE_SIZE = 25;

// Estado en la dirección (en español) -> parámetro de la API.
const STATUS_PARAM = { visibles: "visible", ocultos: "hidden", archivados: "archived", todos: "all" };

// Las mismas reglas que el servidor (product_form.py); él revisa igual.
const PRICE_PATTERN = /^\d{1,8}(\.\d{1,2})?$/;
const STOCK_PATTERN = /^\d{1,5}$/;
const PRICE_HELP = "Escribe un precio mayor que 0, con 2 decimales como máximo.";
const STOCK_HELP = "Escribe un número entero de 0 a 99999.";

// Última lista de cada combinación de filtros, para dibujarla al instante al
// volver con Atrás (así la página puede recuperar la posición). Después se
// pide de nuevo al servidor para tenerla al día.
const cache = new Map();

const plural = (count, singular, pluralForm) => `${count} ${count === 1 ? singular : pluralForm}`;

const readFilters = (params) => {
    const page = Number.parseInt(params.get("pagina"), 10);
    const estado = params.get("estado");
    return {
        q: params.get("q") ?? "",
        categoria: params.get("categoria") ?? "",
        estado: estado in STATUS_PARAM ? estado : "",
        agotado: params.get("agotado") === "1",
        pagina: Number.isInteger(page) && page > 1 ? page : 1,
    };
};

const apiFilters = (filters) => {
    const result = {};
    if (filters.q) result.q = filters.q;
    if (filters.categoria) result.category = filters.categoria;
    if (filters.estado) result.status = STATUS_PARAM[filters.estado];
    if (filters.agotado) result.sold_out = "true";
    if (filters.pagina > 1) result.offset = String((filters.pagina - 1) * PAGE_SIZE);
    return result;
};

// ¿Cambió el campo? "250" y "250.00" son el mismo precio; lo vacío o lo que no
// es número cuenta como cambio (para que la revisión lo marque).
const priceChanged = (text, saved) => text !== undefined && !(text.trim() !== "" && Number(text) === Number(saved));
const stockChanged = (text, saved) => text !== undefined && text.trim() !== String(saved);

export const Inventory = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const filters = readFilters(searchParams);
    const key = JSON.stringify(apiFilters(filters));

    const [list, setList] = useState(() =>
        cache.has(key) ? { status: "ready", data: cache.get(key) } : { status: "loading", data: null }
    );
    const categories = useRequest(getAdminCategories);
    const [searchText, setSearchText] = useState(filters.q);
    const [expanded, setExpanded] = useState(() => new Set());
    const [edits, setEdits] = useState({}); // { [variantId]: { price, stock } }, como texto
    const [errors, setErrors] = useState({}); // { "43.price": "..." }
    const [notice, setNotice] = useState(null); // { kind: "success" | "error", text }
    const [saving, setSaving] = useState(false);

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
        getAdminProducts(JSON.parse(key), controller.signal)
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

    // Otros filtros u otra página: lo escrito era de la lista anterior.
    // (Si había cambios, useUnsavedChanges ya preguntó antes de cambiar.)
    useEffect(() => {
        setEdits({});
        setErrors({});
        setExpanded(new Set());
    }, [key]);

    // Si la búsqueda cambia desde fuera (Atrás), el cuadro de búsqueda la sigue.
    useEffect(() => {
        setSearchText((text) => (text.trim() === filters.q ? text : filters.q));
    }, [filters.q]);

    const data = list.data;
    const items = useMemo(() => data?.items ?? [], [data]);

    // Variantes de la página por id, con lo guardado (para comparar con lo escrito).
    const savedVariants = useMemo(() => {
        const result = new Map();
        for (const item of items) for (const variant of item.variants) result.set(variant.id, variant);
        return result;
    }, [items]);

    // Cambios de verdad: lo escrito que es distinto de lo guardado.
    const pending = useMemo(() => {
        const result = [];
        for (const [id, edit] of Object.entries(edits)) {
            const saved = savedVariants.get(Number(id));
            if (!saved) continue;
            const price = priceChanged(edit.price, saved.price);
            const stock = stockChanged(edit.stock, saved.stock);
            if (price || stock) result.push({ saved, edit, price, stock });
        }
        return result;
    }, [edits, savedVariants]);
    const isDirty = pending.length > 0;
    useUnsavedChanges(isDirty);

    // Cambiar filtros o página (la página vuelve a 1 salvo que se indique).
    // Es una navegación: si hay cambios sin guardar, useUnsavedChanges pregunta.
    const updateFilters = (changes, { replace = false } = {}) => {
        const next = new URLSearchParams(searchParams);
        for (const [name, value] of Object.entries({ pagina: null, ...changes })) {
            if (value === null || value === "" || value === false) next.delete(name);
            else next.set(name, value === true ? "1" : String(value));
        }
        setNotice(null);
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

    const toggle = (productId) =>
        setExpanded((current) => {
            const next = new Set(current);
            if (next.has(productId)) next.delete(productId);
            else next.add(productId);
            return next;
        });

    const handleEdit = (variantId, field, text) => {
        setEdits((current) => ({ ...current, [variantId]: { ...current[variantId], [field]: text } }));
        setErrors((current) => {
            const fieldKey = `${variantId}.${field}`;
            if (!(fieldKey in current)) return current;
            const next = { ...current };
            delete next[fieldKey];
            return next;
        });
        if (notice?.kind === "success") setNotice(null);
    };

    const discard = () => {
        setEdits({});
        setErrors({});
        setNotice(null);
    };

    // Pone en la lista las filas que manda el servidor tras guardar.
    const replaceItems = (newItems, counts) => {
        setList((current) => {
            const byId = new Map(newItems.map((item) => [item.id, item]));
            const nextData = {
                ...current.data,
                counts: counts ?? current.data.counts,
                items: current.data.items.map((item) => byId.get(item.id) ?? item),
            };
            cache.clear(); // las demás páginas guardadas ya no están al día
            cache.set(key, nextData);
            return { ...current, data: nextData };
        });
    };

    // 409: algo cambió mientras se editaba. El valor actual pasa a ser "lo
    // guardado" (así el siguiente intento compara con él) y el campo se marca.
    const showConflicts = (conflicts) => {
        const current = new Map(conflicts.map((c) => [`${c.id}.${c.field}`, c.current]));
        setList((state) => ({
            ...state,
            data: {
                ...state.data,
                items: state.data.items.map((item) => ({
                    ...item,
                    variants: item.variants.map((variant) => {
                        const price = current.get(`${variant.id}.price`);
                        const stock = current.get(`${variant.id}.stock`);
                        if (price === undefined && stock === undefined) return variant;
                        return { ...variant, price: price ?? variant.price, stock: stock ?? variant.stock };
                    }),
                })),
            },
        }));
        const marked = {};
        for (const c of conflicts) {
            marked[`${c.id}.${c.field}`] =
                c.field === "price"
                    ? `Cambió mientras editabas: ahora es ${formatPrice(c.current)}.`
                    : `Cambió mientras editabas: ahora hay ${c.current}.`;
        }
        setErrors(marked);
        // Que se vean: se despliegan los productos afectados.
        setExpanded((open) => {
            const next = new Set(open);
            for (const item of items) {
                if (item.variants.some((v) => current.has(`${v.id}.price`) || current.has(`${v.id}.stock`))) {
                    next.add(item.id);
                }
            }
            return next;
        });
    };

    const handleSave = async () => {
        if (saving || !isDirty) return;

        // 1. Revisar antes de enviar.
        const found = {};
        for (const { saved, edit, price, stock } of pending) {
            if (price && !(PRICE_PATTERN.test(edit.price.trim()) && Number(edit.price) > 0)) {
                found[`${saved.id}.price`] = PRICE_HELP;
            }
            if (stock && !STOCK_PATTERN.test(edit.stock.trim())) found[`${saved.id}.stock`] = STOCK_HELP;
        }
        if (Object.keys(found).length) {
            setErrors(found);
            setNotice({ kind: "error", text: "Revisa los datos marcados." });
            return;
        }

        // 2. Solo lo que cambió, con lo que se veía en pantalla.
        const body = pending.map(({ saved, edit, price, stock }) => {
            const change = { id: saved.id, previous: {} };
            if (price) {
                change.price = Number(edit.price).toFixed(2);
                change.previous.price = saved.price;
            }
            if (stock) {
                change.stock = Number.parseInt(edit.stock, 10);
                change.previous.stock = saved.stock;
            }
            return change;
        });

        setSaving(true);
        setNotice(null);
        try {
            const result = await updateVariants(body);
            replaceItems(result.items, result.counts);
            setEdits({});
            setErrors({});
            setNotice({ kind: "success", text: result.message });
        } catch (error) {
            if (error.status === 401) {
                navigate("/admin/entrar", { replace: true });
                return;
            }
            const conflicts = error.status === 409 ? (error.data?.conflicts ?? []) : [];
            if (conflicts.length) showConflicts(conflicts);
            else setErrors(error.errors ?? {});
            setNotice({ kind: "error", text: error.message });
        } finally {
            setSaving(false);
        }
    };

    if (list.status === "error" && list.error?.status === 401) return <Navigate to="/admin/entrar" replace />;

    const counts = data?.counts;
    const hasFilters = Boolean(filters.q || filters.categoria || filters.estado || filters.agotado);
    const lastShown = data ? data.offset + items.length : 0;

    return (
        <div className={isDirty ? "pb-40 sm:pb-24" : ""}>
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-semibold uppercase lg:text-4xl">Inventario</h1>
                    {counts && (
                        <p className="mt-1 text-muted">
                            {plural(counts.products, "producto", "productos")} ·{" "}
                            {plural(counts.variants, "variante", "variantes")}
                        </p>
                    )}
                </div>
                <Button to="/admin/productos/nuevo" className="w-full gap-2 sm:w-auto">
                    <PlusIcon />
                    Nuevo producto
                </Button>
            </div>

            {counts && (
                <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
                    <CountTile
                        label="Visibles en la tienda"
                        count={counts.visible}
                        active={filters.estado === "visibles"}
                        onClick={() => updateFilters({ estado: filters.estado === "visibles" ? null : "visibles" })}
                    />
                    <CountTile
                        label="Ocultos"
                        count={counts.hidden}
                        active={filters.estado === "ocultos"}
                        onClick={() => updateFilters({ estado: filters.estado === "ocultos" ? null : "ocultos" })}
                    />
                    <CountTile
                        label="Archivados"
                        count={counts.archived}
                        active={filters.estado === "archivados"}
                        onClick={() =>
                            updateFilters({ estado: filters.estado === "archivados" ? null : "archivados" })
                        }
                    />
                    <CountTile
                        label="Con algo agotado"
                        count={counts.with_sold_out}
                        alert={counts.with_sold_out > 0}
                        active={filters.agotado}
                        onClick={() => updateFilters({ agotado: !filters.agotado })}
                    />
                </div>
            )}

            <Filters
                filters={filters}
                searchText={searchText}
                onSearchText={setSearchText}
                categories={categories.data?.categories ?? []}
                onChange={updateFilters}
            />

            <div role="status" className="empty:hidden">
                {notice?.kind === "success" && (
                    <p className="mt-4 flex items-start gap-2.5 rounded-lg border border-line bg-surface px-3.5 py-3 text-sm font-semibold">
                        <CheckIcon />
                        <span>{notice.text}</span>
                    </p>
                )}
            </div>

            {list.status === "loading" && (
                <p role="status" className="mt-6 text-muted">
                    Cargando el inventario…
                </p>
            )}
            {list.status === "error" && <LoadError what="el inventario" />}

            {data && (
                <section
                    aria-label="Productos"
                    aria-busy={list.refreshing ? true : undefined}
                    className={`mt-4 overflow-hidden rounded-xl border border-line bg-surface transition-opacity ${
                        list.refreshing ? "opacity-60" : ""
                    }`}
                >
                    <div
                        className={`hidden gap-x-3 px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted xl:grid ${PRODUCT_COLUMNS}`}
                        aria-hidden="true"
                    >
                        <span />
                        <span>Producto</span>
                        <span>Categoría</span>
                        <span>Estado</span>
                        <span>Precio</span>
                        <span>Existencias</span>
                        <span />
                    </div>

                    {items.length > 0 ? (
                        <ul>
                            {items.map((product) => (
                                <InventoryProduct
                                    key={product.id}
                                    product={product}
                                    expanded={expanded.has(product.id)}
                                    edits={edits}
                                    errors={errors}
                                    onToggle={() => toggle(product.id)}
                                    onEdit={handleEdit}
                                />
                            ))}
                        </ul>
                    ) : (
                        <EmptyList
                            total={data.total}
                            hasFilters={hasFilters}
                            onFirstPage={() => updateFilters({})}
                            onClear={() => setSearchParams(new URLSearchParams())}
                        />
                    )}

                    {items.length > 0 && (
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
                    )}
                </section>
            )}

            {isDirty && (
                <SaveBar
                    count={pending.length}
                    saving={saving}
                    error={notice?.kind === "error" ? notice.text : ""}
                    onDiscard={discard}
                    onSave={handleSave}
                />
            )}
        </div>
    );
};

// Contador de arriba. También filtra: pulsarlo muestra solo esos productos
// (y pulsarlo otra vez quita el filtro).
const CountTile = ({ label, count, active, alert = false, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={`rounded-xl border-2 bg-surface px-4 py-3 text-left hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
            active ? "border-primary bg-surface-alt" : alert ? "border-alert" : "border-line"
        }`}
    >
        <span className="flex items-center gap-2 text-sm font-semibold text-muted">
            {alert && <span className="size-2 shrink-0 rounded-full bg-alert" aria-hidden="true" />}
            {label}
        </span>
        <span className="block font-display text-3xl font-semibold">{count}</span>
    </button>
);

const Filters = ({ filters, searchText, onSearchText, categories, onChange }) => (
    <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4">
        <div className="min-w-0 flex-[2_1_14rem]">
            <label htmlFor="inventory-search" className="mb-1.5 block text-sm font-semibold">
                Buscar
            </label>
            <div className="relative">
                <SearchIcon />
                <input
                    id="inventory-search"
                    type="search"
                    placeholder="Nombre o SKU"
                    autoComplete="off"
                    maxLength={100}
                    value={searchText}
                    onChange={(event) => onSearchText(event.target.value)}
                    className={`${FIELD} pl-10`}
                />
            </div>
        </div>
        <div className="min-w-0 flex-[1_1_11rem]">
            <label htmlFor="inventory-category" className="mb-1.5 block text-sm font-semibold">
                Categoría
            </label>
            <select
                id="inventory-category"
                value={filters.categoria}
                onChange={(event) => onChange({ categoria: event.target.value })}
                className={FIELD}
            >
                <option value="">Todas</option>
                {categories.map((category) => [
                    <option key={category.id} value={category.id}>
                        {category.name}
                    </option>,
                    // Subcategorías con sangría (espacios que el navegador no junta).
                    ...category.children.map((child) => (
                        <option key={child.id} value={child.id}>
                            {`   ${child.name}`}
                        </option>
                    )),
                ])}
            </select>
        </div>
        <div className="min-w-0 flex-[1_1_14rem]">
            <label htmlFor="inventory-status" className="mb-1.5 block text-sm font-semibold">
                Estado
            </label>
            <select
                id="inventory-status"
                value={filters.estado}
                onChange={(event) => onChange({ estado: event.target.value })}
                className={FIELD}
            >
                <option value="">Todos menos archivados</option>
                <option value="visibles">Visibles</option>
                <option value="ocultos">Ocultos</option>
                <option value="archivados">Archivados</option>
                <option value="todos">Todos, con archivados</option>
            </select>
        </div>
        <label className="flex h-12 cursor-pointer items-center gap-2.5 text-sm font-semibold">
            <input
                type="checkbox"
                checked={filters.agotado}
                onChange={(event) => onChange({ agotado: event.target.checked })}
                className="size-5 accent-primary"
            />
            Solo con algo agotado
        </label>
    </div>
);

const EmptyList = ({ total, hasFilters, onFirstPage, onClear }) => {
    // Hay productos, pero no en esta página (por ejemplo, ?pagina=9).
    if (total > 0) {
        return (
            <div className="border-t border-line px-4 py-10 text-center">
                <p className="text-muted">Esta página no tiene productos.</p>
                <Button variant="outline" className="mt-4" onClick={onFirstPage}>
                    Ir a la primera página
                </Button>
            </div>
        );
    }
    return (
        <div className="border-t border-line px-4 py-10 text-center">
            <p className="text-muted">{hasFilters ? "No hay productos con estos filtros." : "Todavía no hay productos."}</p>
            {hasFilters && (
                <Button variant="outline" className="mt-4" onClick={onClear}>
                    Quitar filtros
                </Button>
            )}
        </div>
    );
};

// Barra fija abajo mientras hay cambios sin guardar. En escritorio empieza
// después del menú lateral (lg:left-64, el ancho del menú).
const SaveBar = ({ count, saving, error, onDiscard, onSave }) => (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-highlight-soft lg:left-64">
        <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-10">
            <div className="min-w-0 text-sm font-semibold">
                <p className="flex items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full bg-highlight ring-1 ring-primary" aria-hidden="true" />
                    {plural(count, "variante con cambios sin guardar", "variantes con cambios sin guardar")}
                </p>
                {error && (
                    <p role="alert" className="mt-1 flex items-start gap-1.5">
                        <AlertIcon className="text-alert" />
                        <span>{error}</span>
                    </p>
                )}
            </div>
            <div className="grid shrink-0 grid-cols-[1fr_1.4fr] gap-2 sm:flex">
                <Button variant="outline" onClick={onDiscard} disabled={saving}>
                    Descartar
                </Button>
                <Button onClick={onSave} disabled={saving}>
                    {saving ? "Guardando…" : "Guardar"}
                </Button>
            </div>
        </div>
    </div>
);

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

const SearchIcon = () => (
    <svg
        {...iconProps}
        width="18"
        height="18"
        strokeWidth="2"
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
    >
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
    </svg>
);

const CheckIcon = () => (
    <svg {...iconProps} width="20" height="20" strokeWidth="2.2" className="shrink-0 text-accent">
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12.5l2.5 2.5L16 9.5" />
    </svg>
);
