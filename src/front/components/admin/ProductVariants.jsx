import { useId, useState } from "react";
import { variantLabel } from "../../utils/productVariants";
import { AlertIcon } from "./FormField";
import { FormSection } from "./ProductDetails";
import { Toggle } from "./Toggle";

// Formulario de producto (tarea 2.1, paso 7b): la sección "Variantes".
// Una por cada combinación de las opciones (las arma utils/productVariants.js);
// aquí se editan SKU, precio, costo, existencias y si está activa.
//
// Cada variante es una sola fila de HTML que cambia de forma según el ancho de
// la propia sección (@container), no de la pantalla, porque la columna lateral
// le quita espacio en escritorio:
//   angosta (móvil):     tarjeta; SKU, luego precio y costo, y existencias
//                        junto a "Activa" y "Quitar"
//   desde 32rem (@lg):   tarjeta compacta; SKU, precio, costo y existencias en
//                        una fila, "Activa" y "Quitar" arriba a la derecha
//   desde 42rem (@2xl):  renglón de tabla, con títulos de columna
// Así no hay campos duplicados ocultos.
//
// `errors` usa las claves del servidor: variants, variants.2.sku,
// variants.2.values, variants.2.price, variants.2.cost y variants.2.stock.

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary";
const INPUT =
    "h-11 w-full rounded-lg border border-field bg-surface px-3 text-base text-primary " +
    `aria-[invalid=true]:border-alert ${FOCUS}`;
const SMALL_OUTLINE =
    "inline-flex h-11 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-surface px-5 " +
    "text-sm font-semibold text-primary hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-50 " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
// Columnas del renglón de tabla: variante, SKU, precio, costo, existencias, activa, quitar.
const COLUMNS = "@2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_6.5rem_7.25rem_5.5rem_3.5rem_2.75rem]";

// Tarjeta compacta (@lg): SKU, precio, costo y existencias.
const MID_COLUMNS = "@lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)]";
// En la tarjeta compacta, "Activa" y "Quitar" suben junto al nombre (order);
// en la tabla vuelven al orden del código (order-none).
const ORDER_FIRST = "@lg:order-1 @2xl:order-none";
const ORDER_SECOND = "@lg:order-2 @2xl:order-none";
const ORDER_REST = "@lg:order-3 @2xl:order-none";

const plural = (count, singular, pluralForm) => `${count} ${count === 1 ? singular : pluralForm}`;

// onEdit(índice, campo, valor); onRemove(índice); onRestore(); onApplyAll({ price?, cost? })
export const ProductVariants = ({ variants, options, errors, removedCount, onEdit, onRemove, onRestore, onApplyAll }) => {
    const [bulk, setBulk] = useState({ price: "", cost: "" });
    const hasOptions = variants.some((variant) => variant.valueKeys.length > 0);

    const applyAll = () => {
        const fields = {};
        if (bulk.price.trim()) fields.price = bulk.price.trim();
        if (bulk.cost.trim()) fields.cost = bulk.cost.trim();
        onApplyAll(fields);
        setBulk({ price: "", cost: "" });
    };

    return (
        <FormSection
            title={hasOptions ? `Variantes (${variants.length})` : "Precio y existencias"}
            description={
                hasOptions
                    ? "Se crean solas con cada combinación de las opciones. Puedes editarlas todas y desactivar las que no vendes."
                    : "Sin opciones, el producto se vende de una sola forma."
            }
        >
            {errors.variants && (
                <p role="alert" className="flex items-start gap-2 rounded-lg border border-alert bg-alert-soft px-3 py-2.5 text-sm font-semibold">
                    <AlertIcon />
                    <span>{errors.variants}</span>
                </p>
            )}

            {variants.length > 1 && (
                <div className="flex flex-wrap items-end gap-3 rounded-lg bg-surface-alt p-4">
                    <BulkField label="Mismo precio para todas" value={bulk.price} onChange={(price) => setBulk({ ...bulk, price })} />
                    <BulkField label="Mismo costo para todas" value={bulk.cost} onChange={(cost) => setBulk({ ...bulk, cost })} />
                    <button
                        type="button"
                        onClick={applyAll}
                        disabled={!bulk.price.trim() && !bulk.cost.trim()}
                        className={SMALL_OUTLINE}
                    >
                        Aplicar a todas
                    </button>
                </div>
            )}

            <div className="@container">
                {variants.length > 0 && (
                    <div
                        className={`hidden gap-x-3 border-b border-line pb-2 text-xs font-bold uppercase tracking-wider text-muted @2xl:grid ${COLUMNS}`}
                        aria-hidden="true"
                    >
                        <span>Variante</span>
                        <span>SKU</span>
                        <span>Precio</span>
                        <span>Costo</span>
                        <span>Existencias</span>
                        <span>Activa</span>
                        <span />
                    </div>
                )}
                <ul className="flex flex-col gap-3 @2xl:gap-0">
                    {variants.map((variant, index) => (
                        <VariantRow
                            key={variant.key}
                            variant={variant}
                            label={variantLabel(variant, options)}
                            swatches={swatchesOf(variant, options)}
                            canRemove={hasOptions}
                            errors={{
                                values: errors[`variants.${index}.values`],
                                sku: errors[`variants.${index}.sku`],
                                price: errors[`variants.${index}.price`],
                                cost: errors[`variants.${index}.cost`],
                                stock: errors[`variants.${index}.stock`],
                            }}
                            onEdit={(field, value) => onEdit(index, field, value)}
                            onRemove={() => onRemove(index)}
                        />
                    ))}
                </ul>
            </div>

            {removedCount > 0 && (
                <p className="flex flex-wrap items-center gap-x-2 text-sm">
                    <span>
                        {plural(removedCount, "combinación quitada.", "combinaciones quitadas.")}
                    </span>
                    <button type="button" onClick={onRestore} className={`rounded-sm font-semibold underline ${FOCUS}`}>
                        {removedCount === 1 ? "Volver a ponerla" : "Volver a ponerlas"}
                    </button>
                </p>
            )}

            <p className="text-sm text-muted">
                El costo no se muestra en la tienda: sirve para calcular el margen.
                {hasOptions && " Una variante con ventas no se quita: se desactiva."}
            </p>
        </FormSection>
    );
};

// Colores de los valores de la variante, de las opciones con círculo.
const swatchesOf = (variant, options) =>
    options
        .filter((option) => option.has_swatch)
        .flatMap((option) => option.values.filter((value) => variant.valueKeys.includes(value.key)))
        .filter((value) => value.swatch_hex)
        .map((value) => ({ key: value.key, hex: value.swatch_hex }));

const VariantRow = ({ variant, label, swatches, canRemove, errors, onEdit, onRemove }) => {
    const id = useId();
    const soldOut = variant.is_active && variant.stock.trim() === "0";

    return (
        <li
            className={`grid grid-cols-6 items-start gap-3 rounded-lg border border-line p-3 ${MID_COLUMNS} @2xl:gap-x-3 @2xl:gap-y-1 @2xl:rounded-none @2xl:border-0 @2xl:border-b @2xl:px-0 @2xl:py-2.5 ${COLUMNS} ${
                variant.is_active ? "" : "bg-surface-alt/60"
            }`}
        >
            <div className={`col-span-6 min-w-0 @lg:col-span-2 @2xl:col-span-1 @2xl:pt-2.5 ${ORDER_FIRST}`}>
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {swatches.map((swatch) => (
                        // Único style permitido: el color es un dato del producto (ver CLAUDE.md).
                        <span
                            key={swatch.key}
                            className="size-4 shrink-0 rounded-full border border-field"
                            style={{ backgroundColor: swatch.hex }}
                            aria-hidden="true"
                        />
                    ))}
                    <span className="min-w-0 break-all">{label}</span>
                </p>
                {variant.has_sales && (
                    <p className="mt-0.5 text-xs text-muted">
                        Con ventas · {plural(variant.units_sold, "vendida", "vendidas")}
                    </p>
                )}
                {errors.values && <FieldError id={`${id}-values`} text={errors.values} />}
            </div>

            <Cell id={`${id}-sku`} label="SKU" of={label} error={errors.sku} className={`col-span-6 @lg:col-span-1 ${ORDER_REST}`}>
                {(field) => (
                    <input
                        {...field}
                        type="text"
                        autoCapitalize="characters"
                        autoCorrect="off"
                        spellCheck={false}
                        maxLength={64}
                        value={variant.sku}
                        onChange={(event) => onEdit("sku", event.target.value)}
                        className={`${INPUT} font-mono text-sm`}
                    />
                )}
            </Cell>

            <Cell id={`${id}-price`} label="Precio" of={label} error={errors.price} className={`col-span-3 @lg:col-span-1 ${ORDER_REST}`}>
                {(field) => <MoneyInput {...field} value={variant.price} onChange={(value) => onEdit("price", value)} />}
            </Cell>

            <Cell id={`${id}-cost`} label="Costo" of={label} error={errors.cost} className={`col-span-3 @lg:col-span-1 ${ORDER_REST}`}>
                {(field) => (
                    <MoneyInput
                        {...field}
                        placeholder="Opcional"
                        value={variant.cost}
                        onChange={(value) => onEdit("cost", value)}
                    />
                )}
            </Cell>

            <Cell id={`${id}-stock`} label="Existencias" of={label} error={errors.stock} className={`col-span-2 @lg:col-span-1 ${ORDER_REST}`}>
                {(field) => (
                    <>
                        <input
                            {...field}
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            value={variant.stock}
                            onChange={(event) => onEdit("stock", event.target.value)}
                            className={INPUT}
                        />
                        {soldOut && (
                            <span className="mt-1 flex items-center gap-1.5 text-xs font-semibold">
                                <span className="size-2 rounded-full bg-alert" aria-hidden="true" />
                                Agotada
                            </span>
                        )}
                    </>
                )}
            </Cell>

            {/* En tarjeta, "Activa" y "Quitar" van juntos (abajo en móvil, arriba a la
                derecha en la compacta); en tabla, cada uno en su columna
                (contents deja que sus hijos sean celdas). */}
            <div
                className={`col-span-4 flex min-h-11 items-center justify-between gap-2 self-start pt-6 @lg:col-span-2 @lg:min-h-0 @lg:justify-end @lg:gap-5 @lg:pt-0 @2xl:contents ${ORDER_SECOND}`}
            >
                <div className="@2xl:pt-2">
                    <Toggle
                        label={
                            <>
                                Activa<span className="sr-only"> {label}</span>
                            </>
                        }
                        labelClassName="@2xl:sr-only"
                        checked={variant.is_active}
                        onChange={(on) => onEdit("is_active", on)}
                    />
                </div>
                {canRemove && (
                    <div className="@2xl:pt-0.5">
                        <button
                            type="button"
                            onClick={onRemove}
                            disabled={variant.has_sales}
                            aria-label={variant.has_sales ? `${label}: tiene ventas, no se puede quitar` : `Quitar ${label}`}
                            className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-semibold hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent @2xl:size-10 @2xl:px-0 ${FOCUS}`}
                        >
                            <CloseIcon />
                            <span className="@2xl:sr-only" aria-hidden="true">
                                Quitar
                            </span>
                        </button>
                    </div>
                )}
            </div>
        </li>
    );
};

// Campo de la variante: etiqueta visible en tarjeta y solo para el lector de
// pantalla en tabla (ahí la dice el título de la columna). La etiqueta lleva
// el nombre de la variante ("Precio de Beige / M"), para saber de cuál es.
const Cell = ({ id, label, of, error, className = "", children }) => (
    <div className={`min-w-0 ${className}`}>
        <label htmlFor={id} className="mb-1 block text-sm font-semibold @2xl:sr-only">
            {label}
            <span className="sr-only"> de {of}</span>
        </label>
        {children({
            id,
            "aria-invalid": error ? true : undefined,
            "aria-describedby": error ? `${id}-error` : undefined,
        })}
        {error && <FieldError id={`${id}-error`} text={error} />}
    </div>
);

const MoneyInput = ({ onChange, ...props }) => (
    <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true">
            $
        </span>
        <input
            {...props}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            onChange={(event) => onChange(event.target.value)}
            className={`${INPUT} pl-6`}
        />
    </div>
);

const BulkField = ({ label, value, onChange }) => {
    const id = useId();
    return (
        <div className="min-w-36 flex-1">
            <label htmlFor={id} className="mb-1 block text-sm font-semibold">
                {label}
            </label>
            <MoneyInput id={id} placeholder="0.00" value={value} onChange={onChange} />
        </div>
    );
};

const FieldError = ({ id, text }) => (
    <p id={id} className="mt-1 flex items-start gap-1 text-sm font-semibold">
        <AlertIcon className="text-alert" />
        <span>{text}</span>
    </p>
);

const CloseIcon = () => (
    <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        aria-hidden="true"
        className="shrink-0"
    >
        <path d="M6 6l12 12M18 6L6 18" />
    </svg>
);
