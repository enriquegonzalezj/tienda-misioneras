import { Link } from "react-router-dom";
import { ImagePlaceholder } from "../ImagePlaceholder";
import { AlertIcon } from "./FormField";
import { StatusDot } from "./StatusDot";
import { formatPrice } from "../../utils/formatPrice";

// Un producto en el Inventario (tarea 2.1, paso 6). En escritorio grande (xl)
// es una fila de la tabla; más angosto, una tarjeta. Las dos muestran lo
// mismo. Se despliega con sus variantes, con precio y existencias editables
// (un solo bloque para escritorio y móvil, así cada campo existe una vez).
//
// No guarda nada: avisa de cada cambio con onEdit y la página junta los
// cambios de todos los productos en la barra "Guardar".
//
// Props:
//   product   fila de GET /api/admin/products
//   expanded  si se ven sus variantes
//   edits     lo escrito en sus variantes: { [variantId]: { price, stock } } (texto)
//   errors    errores por campo: { "43.price": "..." }
//   onToggle(), onEdit(variantId, field, text)

// Columnas de la tabla de escritorio, compartidas con la cabecera (Inventory.jsx).
export const PRODUCT_COLUMNS =
    "xl:grid-cols-[44px_minmax(0,2.6fr)_minmax(0,1.3fr)_128px_128px_minmax(0,1.2fr)_96px]";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const plural = (count, singular, pluralForm) => `${count} ${count === 1 ? singular : pluralForm}`;

const categoryText = ({ category }) =>
    category.parent_name ? `${category.parent_name} › ${category.name}` : category.name;

const priceText = ({ price_min: min, price_max: max }) => {
    if (min === null) return "Sin precio";
    return min === max ? formatPrice(min) : `Desde ${formatPrice(min)}`;
};

// "Agotado" si se acabaron todas las variantes activas; si no, cuántas.
const soldOutText = (product) => {
    if (!product.sold_out_count) return null;
    if (product.sold_out_count === product.active_variant_count) return "Agotado";
    return `${plural(product.sold_out_count, "variante agotada", "variantes agotadas")}`;
};

export const InventoryProduct = ({ product, expanded, edits, errors, onToggle, onEdit }) => {
    const soldOut = soldOutText(product);
    const editUrl = `/admin/productos/${product.id}`;
    const variantsId = `inventory-variants-${product.id}`;
    const toggleLabel = `${expanded ? "Ocultar" : "Ver"} variantes de ${product.name}`;

    const thumb = (
        <div className="size-12 shrink-0 overflow-hidden rounded-lg border border-line">
            {product.image ? (
                <img src={product.image.url} alt="" className="h-full w-full object-cover" loading="lazy" />
            ) : (
                <ImagePlaceholder />
            )}
        </div>
    );

    const meta = (
        <span className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
            <span>{plural(product.variant_count, "variante", "variantes")}</span>
            {product.is_featured && (
                <span className="inline-flex items-center gap-1 font-semibold text-primary">
                    <StarIcon />
                    Destacado
                </span>
            )}
        </span>
    );

    const soldOutNote = soldOut && (
        <span className="flex items-center gap-1.5 text-sm font-semibold">
            <span className="size-2 shrink-0 rounded-full bg-alert" aria-hidden="true" />
            {soldOut}
        </span>
    );

    return (
        <li className={`border-t border-line ${expanded ? "bg-surface-alt/60" : ""}`}>
            {/* Escritorio grande: fila de la tabla. */}
            <div className={`hidden items-center gap-x-3 px-4 py-2.5 xl:grid ${PRODUCT_COLUMNS}`}>
                <button
                    type="button"
                    onClick={onToggle}
                    aria-expanded={expanded}
                    aria-controls={variantsId}
                    aria-label={toggleLabel}
                    className={`inline-flex size-10 items-center justify-center rounded-lg hover:bg-surface-alt ${FOCUS}`}
                >
                    <ChevronIcon open={expanded} />
                </button>
                <div className="flex min-w-0 items-center gap-3">
                    {thumb}
                    <div className="min-w-0">
                        <Link to={editUrl} className={`rounded-sm font-semibold hover:underline ${FOCUS}`}>
                            {product.name}
                        </Link>
                        {meta}
                    </div>
                </div>
                <span className="text-sm">{categoryText(product)}</span>
                <span>
                    <StatusDot status={product.status} />
                </span>
                <span className="font-semibold tabular-nums">{priceText(product)}</span>
                <div>
                    <div className="font-semibold tabular-nums">{product.stock_total}</div>
                    {soldOutNote}
                </div>
                <Link
                    to={editUrl}
                    aria-label={`Editar ${product.name}`}
                    className={`inline-flex min-h-10 items-center justify-center rounded-full px-3 text-sm font-semibold hover:underline ${FOCUS}`}
                >
                    Editar
                </Link>
            </div>

            {/* Más angosto: tarjeta. */}
            <div className="xl:hidden">
                <div className="flex gap-3 px-4 pb-3 pt-4">
                    {thumb}
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <Link to={editUrl} className={`rounded-sm font-bold hover:underline ${FOCUS}`}>
                            {product.name}
                        </Link>
                        <span className="text-sm text-muted">
                            {categoryText(product)} · {plural(product.variant_count, "variante", "variantes")}
                        </span>
                        <span className="flex flex-wrap items-center gap-2">
                            <StatusDot status={product.status} />
                            {product.is_featured && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-surface-alt px-2.5 py-0.5 text-sm font-semibold">
                                    <StarIcon />
                                    Destacado
                                </span>
                            )}
                        </span>
                    </div>
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-2">
                    <div className="text-sm">
                        <span className="font-bold">{priceText(product)}</span>
                        <span className="text-muted"> · {product.stock_total} en existencia</span>
                        {soldOutNote}
                    </div>
                    <button
                        type="button"
                        onClick={onToggle}
                        aria-expanded={expanded}
                        aria-controls={variantsId}
                        aria-label={toggleLabel}
                        className={`inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full px-2 text-sm font-semibold hover:underline ${FOCUS}`}
                    >
                        {expanded ? "Ocultar variantes" : "Ver variantes"}
                    </button>
                </div>
            </div>

            {expanded && (
                <div id={variantsId} className="border-t border-line px-4 pb-4 pt-2 xl:pl-18">
                    <div
                        className={`hidden gap-x-4 py-2 text-xs font-bold uppercase tracking-wider text-muted xl:grid ${VARIANT_COLUMNS}`}
                        aria-hidden="true"
                    >
                        <span>Variante</span>
                        <span>SKU</span>
                        <span>Precio</span>
                        <span>Existencias</span>
                        <span />
                    </div>
                    <ul>
                        {product.variants.map((variant) => (
                            <VariantRow
                                key={variant.id}
                                variant={variant}
                                edit={edits[variant.id]}
                                errors={errors}
                                onEdit={onEdit}
                            />
                        ))}
                    </ul>
                    <p className="mt-3 text-sm text-muted">SKU, costo y opciones se cambian dentro del producto.</p>
                </div>
            )}
        </li>
    );
};

const VARIANT_COLUMNS = "xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_140px_140px_minmax(0,1fr)]";

const INPUT =
    "h-11 w-full rounded-lg border bg-surface px-3 text-base tabular-nums text-primary " +
    "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary";

const VariantRow = ({ variant, edit, errors, onEdit }) => {
    const price = edit?.price ?? variant.price;
    const stock = edit?.stock ?? String(variant.stock);
    const priceChanged = edit?.price !== undefined && Number(edit.price) !== Number(variant.price);
    const stockChanged = edit?.stock !== undefined && edit.stock.trim() !== String(variant.stock);
    const priceError = errors[`${variant.id}.price`];
    const stockError = errors[`${variant.id}.stock`];
    const label = variant.label || "Única";
    // Agotada según lo que se ve en pantalla (lo guardado o lo que se escribió).
    const soldOut = variant.is_active && stock.trim() === "0";
    const swatches = variant.values.filter((value) => value.swatch_hex);
    const priceId = `variant-${variant.id}-price`;
    const stockId = `variant-${variant.id}-stock`;

    const fieldClass = (error, changed) =>
        `${INPUT} ${error ? "border-alert" : changed ? "border-2 border-primary" : "border-field"}`;

    return (
        <li className={`grid grid-cols-2 items-start gap-x-3 gap-y-2 border-t border-line py-3 xl:items-center xl:gap-x-4 xl:py-2 ${VARIANT_COLUMNS}`}>
            <span className="col-span-2 flex flex-wrap items-center gap-2 font-semibold xl:col-span-1">
                {swatches.map((value) => (
                    // Único style permitido: el color es un dato del producto (ver CLAUDE.md).
                    <span
                        key={value.option}
                        className="size-4 shrink-0 rounded-full border border-field"
                        style={{ backgroundColor: value.swatch_hex }}
                        aria-hidden="true"
                    />
                ))}
                {label}
                {!variant.is_active && (
                    <span className="rounded-full bg-surface-alt px-2 py-0.5 text-xs font-semibold text-muted">
                        Desactivada
                    </span>
                )}
            </span>
            <span className="col-span-2 break-all font-mono text-sm text-muted xl:col-span-1">{variant.sku}</span>

            <div>
                <label htmlFor={priceId} className="mb-1 block text-sm font-semibold xl:sr-only">
                    Precio <span className="sr-only">de {label}</span>
                </label>
                <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true">
                        $
                    </span>
                    <input
                        id={priceId}
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={price}
                        onChange={(event) => onEdit(variant.id, "price", event.target.value)}
                        aria-invalid={priceError ? true : undefined}
                        aria-describedby={priceError ? `${priceId}-error` : undefined}
                        className={`${fieldClass(priceError, priceChanged)} pl-6`}
                    />
                </div>
                {priceError && <FieldError id={`${priceId}-error`} text={priceError} />}
            </div>

            <div>
                <label htmlFor={stockId} className="mb-1 block text-sm font-semibold xl:sr-only">
                    Existencias <span className="sr-only">de {label}</span>
                </label>
                <input
                    id={stockId}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={stock}
                    onChange={(event) => onEdit(variant.id, "stock", event.target.value)}
                    aria-invalid={stockError ? true : undefined}
                    aria-describedby={stockError ? `${stockId}-error` : undefined}
                    className={fieldClass(stockError, stockChanged)}
                />
                {stockError && <FieldError id={`${stockId}-error`} text={stockError} />}
            </div>

            <span className="col-span-2 flex flex-wrap gap-2 xl:col-span-1">
                {soldOut && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-alt px-2.5 py-0.5 text-sm font-semibold">
                        <span className="size-2 rounded-full bg-alert" aria-hidden="true" />
                        Agotada
                    </span>
                )}
                {(priceChanged || stockChanged) && (
                    <span className="rounded-full bg-highlight-soft px-2.5 py-0.5 text-sm font-semibold">Cambiado</span>
                )}
            </span>
        </li>
    );
};

const FieldError = ({ id, text }) => (
    <p id={id} className="mt-1 flex items-start gap-1 text-sm font-semibold">
        <AlertIcon className="text-alert" />
        <span>{text}</span>
    </p>
);

const ChevronIcon = ({ open }) => (
    <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <path d={open ? "M6 9l6 6 6-6" : "M9 6l6 6-6 6"} />
    </svg>
);

// Estrella de "Destacado": amarilla con borde azul (el amarillo solo, en
// pequeño, no se distinguiría del fondo).
const StarIcon = () => (
    <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        strokeWidth="1.5"
        strokeLinejoin="round"
        aria-hidden="true"
        className="shrink-0 fill-highlight stroke-primary"
    >
        <path d="M12 3l2.8 6 6.2.6-4.7 4.2 1.4 6.2-5.7-3.2-5.7 3.2 1.4-6.2L3 9.6 9.2 9z" />
    </svg>
);
