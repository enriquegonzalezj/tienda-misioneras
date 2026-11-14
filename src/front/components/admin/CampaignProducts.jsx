import { useEffect, useId, useState } from "react";
import { searchCampaignProducts } from "../../api/admin";
import { formatPrice } from "../../utils/formatPrice";
import { AlertIcon, FIELD, PrefixInput } from "../FormField";
import { StatusDot } from "./StatusDot";

// Productos de una campaña (tarea 4.8): el buscador y la lista de productos
// elegidos, cada uno con sus variantes y un precio fijo opcional por variante.
// Va dentro de la sección "Alcance" del formulario (pages/admin/CampaignForm.jsx),
// que lleva los datos; aquí solo se dibujan y se avisa de los cambios.
//
// Reglas (las comprueba el servidor, admin_campaigns.py):
//   - Productos seleccionados: entran todas las variantes activas de cada
//     producto; el precio fijo es opcional (sin él, le toca el porcentaje).
//     Una variante creada después no entra hasta volver a guardar la campaña
//     (missing_variants, decisión 6).
//   - Toda la tienda: el porcentaje ya toca todo; un producto se agrega solo
//     para ponerle precio fijo a alguna variante (decisión 7).
//   - El precio fijo tiene que ser menor que el precio normal.
//
// `products`: [{ id, name, status, missing_variants, variants: [{ id, label,
// sku, price, is_active, fixed_price }] }], con fixed_price como texto ("" si
// no lleva). Los errores usan las claves del servidor: products,
// products.<i> y products.<i>.variants.<j>.fixed_price, con <i> y <j> en el
// mismo orden que esta lista.

const SEARCH_DELAY = 300; // ms desde la última tecla antes de buscar

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const SMALL_BUTTON =
    `inline-flex shrink-0 items-center justify-center rounded-full border-2 border-primary px-4 py-1.5 text-sm font-semibold ` +
    `hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;

// Producto del buscador en la forma de la lista.
const fromSearch = (item) => ({
    id: item.id,
    name: item.name,
    status: item.status,
    missing_variants: 0,
    variants: item.variants.map((variant) => ({
        id: variant.id,
        label: variant.label,
        sku: variant.sku,
        price: variant.price,
        is_active: variant.is_active,
        fixed_price: "",
    })),
});

const plural = (count, singular, pluralForm) => `${count} ${count === 1 ? singular : pluralForm}`;

const FieldError = ({ id, children }) => (
    <p id={id} className="mt-1.5 flex items-start gap-1.5 text-sm font-semibold">
        <AlertIcon className="text-alert" />
        <span>{children}</span>
    </p>
);

const ProductSearch = ({ chosenIds, onAdd, onExpired }) => {
    const id = useId();
    const helpId = `${id}-help`;
    const [query, setQuery] = useState("");
    // { status: "idle" | "loading" | "ready" | "error", items }
    const [result, setResult] = useState({ status: "idle", items: [] });

    useEffect(() => {
        const text = query.trim();
        if (!text) {
            setResult({ status: "idle", items: [] });
            return undefined;
        }
        const controller = new AbortController();
        const timer = setTimeout(() => {
            setResult((current) => ({ ...current, status: "loading" }));
            searchCampaignProducts(text, controller.signal)
                .then((data) => {
                    if (!controller.signal.aborted) setResult({ status: "ready", items: data.items });
                })
                .catch((error) => {
                    if (controller.signal.aborted || onExpired(error)) return;
                    setResult({ status: "error", items: [] });
                });
        }, SEARCH_DELAY);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [query, onExpired]);

    const add = (item) => {
        onAdd(fromSearch(item));
        setQuery("");
    };

    return (
        <div>
            <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">
                Buscar productos
            </label>
            <input
                id={id}
                type="search"
                value={query}
                maxLength={100}
                autoComplete="off"
                aria-describedby={helpId}
                onChange={(event) => setQuery(event.target.value)}
                className={FIELD}
            />
            <p id={helpId} className="mt-1.5 text-sm text-muted">
                Por nombre o SKU. Salen también los productos ocultos; los archivados no.
            </p>

            <div role="status" className="empty:hidden">
                {result.status === "loading" && <p className="mt-3 text-sm text-muted">Buscando…</p>}
                {result.status === "error" && (
                    <p className="mt-3 text-sm font-semibold">No se pudo buscar. Inténtalo de nuevo.</p>
                )}
                {result.status === "ready" && result.items.length === 0 && (
                    <p className="mt-3 text-sm text-muted">No hay productos con «{query.trim()}».</p>
                )}
            </div>

            {result.status === "ready" && result.items.length > 0 && (
                <ul aria-label="Resultados de la búsqueda" className="mt-3 divide-y divide-line rounded-lg border border-line">
                    {result.items.map((item) => {
                        const chosen = chosenIds.has(item.id);
                        return (
                            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5">
                                <div className="min-w-0">
                                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                                        <span className="min-w-0 wrap-break-word">{item.name}</span>
                                        {item.status !== "visible" && <StatusDot status={item.status} />}
                                    </p>
                                    <p className="text-sm text-muted">
                                        {plural(item.variants.length, "variante activa", "variantes activas")}
                                    </p>
                                </div>
                                <button type="button" disabled={chosen} onClick={() => add(item)} className={SMALL_BUTTON}>
                                    {chosen ? "Agregado" : "Agregar"}
                                    <span className="sr-only"> {item.name}</span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};

const VariantRow = ({ variant, error, errorId, onFixedPrice }) => {
    const label = variant.label || "Única";
    return (
        <li className="grid grid-cols-1 gap-2 px-3.5 py-3 @lg:grid-cols-[minmax(0,1fr)_7rem_10rem] @lg:items-start @lg:gap-3">
            <div className="min-w-0 @lg:pt-3">
                <p className="font-semibold wrap-break-word">{label}</p>
                <p className="text-sm text-muted wrap-break-word">{variant.sku}</p>
            </div>
            <p className="text-sm @lg:pt-3.5 @lg:text-right">
                <span className="text-muted @lg:sr-only">Precio normal: </span>
                <span className="font-semibold">{formatPrice(variant.price)}</span>
            </p>
            {variant.is_active ? (
                <div>
                    <label className="sr-only" htmlFor={`fixed-${variant.id}`}>
                        Precio fijo de {label}
                    </label>
                    <span className="mb-1 block text-sm font-semibold @lg:hidden" aria-hidden="true">
                        Precio fijo (opcional)
                    </span>
                    <PrefixInput
                        id={`fixed-${variant.id}`}
                        prefix="$"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={variant.fixed_price}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? errorId : undefined}
                        onChange={(event) => onFixedPrice(event.target.value)}
                    />
                    {error && <FieldError id={errorId}>{error}</FieldError>}
                </div>
            ) : (
                <p className="text-sm text-muted @lg:pt-3.5">Desactivada: no entra en la campaña.</p>
            )}
        </li>
    );
};

const ChosenProduct = ({ product, index, errors, onRemove, onFixedPrice }) => {
    const id = useId();
    const productError = errors[`products.${index}`];
    return (
        <li className="rounded-lg border border-line">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line bg-surface-alt px-3.5 py-3">
                <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                        <span className="min-w-0 wrap-break-word">{product.name}</span>
                        {product.status !== "visible" && <StatusDot status={product.status} />}
                    </p>
                    {product.status === "hidden" && (
                        <p className="mt-0.5 text-sm text-muted">Está oculto: la campaña le aplicará cuando se muestre.</p>
                    )}
                </div>
                <button type="button" onClick={onRemove} className={SMALL_BUTTON}>
                    Quitar<span className="sr-only"> {product.name}</span>
                </button>
            </div>

            {product.missing_variants > 0 && (
                <p className="flex items-start gap-2 border-b border-line bg-highlight-soft px-3.5 py-2.5 text-sm font-semibold">
                    <AlertIcon />
                    <span>
                        {product.missing_variants === 1
                            ? "Hay 1 variante nueva de este producto que todavía no entra. Guarda la campaña para incluirla."
                            : `Hay ${product.missing_variants} variantes nuevas de este producto que todavía no entran. Guarda la campaña para incluirlas.`}
                    </span>
                </p>
            )}

            {productError && (
                <div className="border-b border-line px-3.5 py-2.5">
                    {/* tabIndex y data-error-focus: tras un error al guardar, el foco llega aquí. */}
                    <p tabIndex={-1} data-error-focus className="flex items-start gap-1.5 text-sm font-semibold outline-none">
                        <AlertIcon className="text-alert" />
                        <span>{productError}</span>
                    </p>
                </div>
            )}

            <div className="@container">
                <div
                    aria-hidden="true"
                    className="hidden gap-3 px-3.5 pt-3 text-xs font-bold uppercase tracking-wider text-muted @lg:grid @lg:grid-cols-[minmax(0,1fr)_7rem_10rem]"
                >
                    <span>Variante</span>
                    <span className="text-right">Precio normal</span>
                    <span>Precio fijo (opcional)</span>
                </div>
                <ul className="divide-y divide-line">
                    {product.variants.map((variant, vIndex) => (
                        <VariantRow
                            key={variant.id}
                            variant={variant}
                            error={errors[`products.${index}.variants.${vIndex}.fixed_price`]}
                            errorId={`${id}-v${variant.id}-error`}
                            onFixedPrice={(value) => onFixedPrice(vIndex, value)}
                        />
                    ))}
                </ul>
            </div>
        </li>
    );
};

export const CampaignProducts = ({ scope, products, errors, onChange, onExpired }) => {
    const chosenIds = new Set(products.map((product) => product.id));
    const [added, setAdded] = useState("");

    const addProduct = (product) => {
        onChange([...products, product]);
        setAdded(`Se agregó «${product.name}».`);
    };

    const removeProduct = (index) => {
        setAdded("");
        onChange(products.filter((_, i) => i !== index));
    };

    const setFixedPrice = (index, vIndex, value) =>
        onChange(
            products.map((product, i) =>
                i !== index
                    ? product
                    : {
                          ...product,
                          variants: product.variants.map((variant, j) =>
                              j === vIndex ? { ...variant, fixed_price: value } : variant
                          ),
                      }
            )
        );

    return (
        <div className="flex flex-col gap-4">
            <p className="text-sm text-muted">
                {scope === "selected"
                    ? "Entran todas las variantes activas de cada producto. El precio fijo es opcional: sin él, a la variante le toca el porcentaje."
                    : "El porcentaje ya vale para toda la tienda. Agrega un producto solo si quieres ponerle precio fijo a alguna variante."}
            </p>

            <ProductSearch chosenIds={chosenIds} onAdd={addProduct} onExpired={onExpired} />

            <p role="status" className="text-sm font-semibold empty:hidden">
                {added}
            </p>

            {errors.products && (
                <p tabIndex={-1} data-error-focus className="flex items-start gap-1.5 text-sm font-semibold outline-none">
                    <AlertIcon className="text-alert" />
                    <span>{errors.products}</span>
                </p>
            )}

            {products.length > 0 ? (
                <ul aria-label="Productos de la campaña" className="flex flex-col gap-3">
                    {products.map((product, index) => (
                        <ChosenProduct
                            key={product.id}
                            product={product}
                            index={index}
                            errors={errors}
                            onRemove={() => removeProduct(index)}
                            onFixedPrice={(vIndex, value) => setFixedPrice(index, vIndex, value)}
                        />
                    ))}
                </ul>
            ) : (
                <p className="rounded-lg border border-dashed border-line px-3.5 py-4 text-sm text-muted">
                    {scope === "selected"
                        ? "Todavía no hay productos. Búscalos arriba."
                        : "Sin precios fijos: el porcentaje se aplica igual en toda la tienda."}
                </p>
            )}
        </div>
    );
};
