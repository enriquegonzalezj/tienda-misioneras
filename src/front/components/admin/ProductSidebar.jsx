import { useId } from "react";
import { formatPrice } from "../../utils/formatPrice";
import { Button } from "../Button";
import { AlertIcon, FIELD } from "./FormField";
import { FormSection } from "./ProductDetails";
import { Toggle } from "./Toggle";

// Formulario de producto (tarea 2.1, paso 7a): las secciones de la columna
// lateral (en móvil, Estado y Categoría van arriba y Resumen y "Borrar o
// archivar" al final). Los datos los lleva pages/admin/ProductForm.jsx.

// "Visible en la tienda" y "Destacado en Inicio". Un producto archivado no
// se puede mostrar (el servidor lo rechaza): el interruptor se desactiva y
// la ayuda dice por qué.
export const ProductStatus = ({ form, errors, archived, setField }) => (
    <FormSection title="Estado">
        <Toggle
            label="Visible en la tienda"
            help={
                archived
                    ? "Está archivado: desarchívalo para poder mostrarlo."
                    : "Un producto nuevo empieza oculto. Actívalo cuando tenga fotos y precios."
            }
            error={errors.is_active}
            checked={form.is_active}
            disabled={archived}
            onChange={setField("is_active")}
        />
        <Toggle
            label="Destacado en Inicio"
            help="Inicio muestra los 4 destacados más recientes."
            error={errors.is_featured}
            checked={form.is_featured}
            onChange={setField("is_featured")}
        />
    </FormSection>
);

// Lista de categorías. Una categoría con subcategorías es un grupo (optgroup):
// su nombre se ve pero no se puede elegir, porque el producto va en una de
// sus subcategorías (la misma regla que el servidor).
export const ProductCategory = ({ value, error, categories, onChange }) => {
    const id = useId();
    const helpId = `${id}-help`;
    const errorId = `${id}-error`;

    return (
        <FormSection title="Categoría">
            <div>
                <select
                    id={id}
                    aria-label="Categoría"
                    aria-describedby={[error && errorId, helpId].filter(Boolean).join(" ")}
                    aria-invalid={error ? true : undefined}
                    value={value ?? ""}
                    onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
                    className={FIELD}
                >
                    {value === null && (
                        <option value="" disabled>
                            Elige una categoría
                        </option>
                    )}
                    {categories.map((category) =>
                        category.children.length ? (
                            <optgroup key={category.id} label={category.name}>
                                {category.children.map((child) => (
                                    <option key={child.id} value={child.id}>
                                        {child.name}
                                    </option>
                                ))}
                            </optgroup>
                        ) : (
                            <option key={category.id} value={category.id}>
                                {category.name}
                            </option>
                        )
                    )}
                </select>
                {error && (
                    <p id={errorId} className="mt-1.5 flex items-start gap-1.5 text-sm font-semibold">
                        <AlertIcon className="text-alert" />
                        <span>{error}</span>
                    </p>
                )}
                <p id={helpId} className="mt-1.5 text-sm text-muted">
                    Si una categoría tiene subcategorías, el producto va en una de ellas.
                </p>
            </div>
        </FormSection>
    );
};

// Precio, existencias y ventas de lo guardado (no de lo que se está
// escribiendo). Igual que el Inventario: precio y existencias solo de las
// variantes activas, que son las que se venden.
export const ProductSummary = ({ product }) => {
    const active = product.variants.filter((variant) => variant.is_active);
    const prices = active.map((variant) => variant.price);
    // Solo se ordenan para elegir el menor y el mayor; no se hacen cuentas con dinero.
    const sorted = [...prices].sort((a, b) => Number(a) - Number(b));
    const low = sorted[0];
    const high = sorted[sorted.length - 1];
    const priceText = !prices.length
        ? "Sin variantes activas"
        : Number(low) === Number(high)
          ? formatPrice(low)
          : `${formatPrice(low)} a ${formatPrice(high)}`;
    const stock = active.reduce((total, variant) => total + variant.stock, 0);
    const soldOut = active.filter((variant) => variant.stock <= 0).length;

    return (
        <FormSection title="Resumen">
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-sm">
                <dt className="text-muted">Precio en la tienda</dt>
                <dd className="text-right font-bold">{priceText}</dd>
                <dt className="text-muted">Existencias</dt>
                <dd className="text-right font-bold">{stock}</dd>
                <dt className="text-muted">Variantes agotadas</dt>
                <dd className="flex items-center justify-end gap-1.5 font-bold">
                    {soldOut > 0 && <span className="size-2 rounded-full bg-alert" aria-hidden="true" />}
                    {soldOut}
                </dd>
                <dt className="text-muted">Unidades vendidas</dt>
                <dd className="text-right font-bold">{product.units_sold}</dd>
            </dl>
        </FormSection>
    );
};

// Borrar solo si nunca se vendió; con ventas, archivar; archivado, desarchivar.
// `busy`: "delete", "archive" o "unarchive" mientras espera al servidor.
export const ProductRemoval = ({ product, busy, error, onDelete, onArchive, onUnarchive }) => {
    const archived = product.archived_at !== null;
    const canDelete = !product.has_sales;
    const disabled = busy !== null;

    let text;
    if (archived) {
        text =
            "Está archivado: no se ve en la tienda ni en la lista normal del Inventario, y conserva su historial. Al desarchivarlo vuelve como oculto.";
    } else if (canDelete) {
        text =
            "Todavía no tiene ventas: puedes borrarlo. Cuando tenga ventas solo se podrá archivar: se oculta de la tienda y conserva su historial.";
    } else {
        text =
            "Tiene ventas, así que no se puede borrar. Al archivarlo se oculta de la tienda y del Inventario, y conserva su historial.";
    }

    return (
        <FormSection title="Borrar o archivar">
            <p className="text-sm">{text}</p>
            {error && (
                <p role="alert" className="flex items-start gap-2 rounded-lg border border-alert bg-alert-soft px-3 py-2.5 text-sm font-semibold">
                    <AlertIcon />
                    <span>{error}</span>
                </p>
            )}
            <div className="flex flex-wrap gap-2">
                {archived && (
                    <Button variant="outline" onClick={onUnarchive} disabled={disabled} className="w-full sm:w-auto">
                        {busy === "unarchive" ? "Desarchivando…" : "Desarchivar"}
                    </Button>
                )}
                {!archived && !canDelete && (
                    <Button variant="outline" onClick={onArchive} disabled={disabled} className="w-full sm:w-auto">
                        {busy === "archive" ? "Archivando…" : "Archivar producto"}
                    </Button>
                )}
                {canDelete && (
                    <Button variant="outline" onClick={onDelete} disabled={disabled} className="w-full sm:w-auto">
                        {busy === "delete" ? "Borrando…" : "Borrar producto"}
                    </Button>
                )}
            </div>
        </FormSection>
    );
};
