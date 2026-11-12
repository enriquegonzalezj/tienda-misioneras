import { useId } from "react";
import { FIELD, FormField, PrefixInput, TEXTAREA } from "../FormField";

// Formulario de producto (tarea 2.1, paso 7a): la sección "Datos del producto"
// y el recuadro de sección que comparten todas las partes del formulario.
//
// Los datos y los errores los lleva la página (pages/admin/ProductForm.jsx);
// aquí solo se dibujan los campos. `errors` usa las claves del servidor
// (product_form.py): name, slug, subtitle, card_subtitle, description y
// seo_description.

// Los mismos límites que el servidor (product_form.py).
const NAME_MAX = 150;
const SLUG_MAX = 170;
const SUBTITLE_MAX = 150;
const CARD_SUBTITLE_MAX = 60;
const DESCRIPTION_MAX = 5000;
const SEO_DESCRIPTION_MAX = 160;

// Recuadro blanco con su título. Cada sección del formulario es uno
// (Datos, Estado, Categoría, Resumen; en el 7b, Opciones y Variantes).
// El título queda enlazado a la sección: el lector de pantalla la anuncia
// por su nombre al entrar.
export const FormSection = ({ title, description, children }) => {
    const id = useId();
    return (
        <section aria-labelledby={id} className="rounded-xl border border-line bg-surface p-5 sm:p-6">
            <h2 id={id} className="text-xl font-semibold uppercase tracking-wide">
                {title}
            </h2>
            {description && <p className="mt-1 text-sm text-muted">{description}</p>}
            <div className="mt-5 flex flex-col gap-5">{children}</div>
        </section>
    );
};

// setField(key)(texto): cambia un campo del formulario.
export const ProductDetails = ({ form, errors, isNew, computedCardSubtitle, setField }) => {
    const onText = (key) => (event) => setField(key)(event.target.value);

    return (
        <FormSection title="Datos del producto">
            <FormField label="Nombre" error={errors.name} length={form.name.length} maxLength={NAME_MAX}>
                {(field) => <input {...field} type="text" value={form.name} onChange={onText("name")} className={FIELD} />}
            </FormField>

            <FormField
                label="Dirección en la tienda"
                error={errors.slug}
                help={
                    isNew
                        ? "Si la dejas vacía, se crea a partir del nombre."
                        : "Se creó con el nombre y no cambia si renombras el producto. Si la cambias, los enlaces que ya se compartieron dejarán de funcionar."
                }
            >
                {(field) => (
                    <PrefixInput
                        {...field}
                        maxLength={SLUG_MAX}
                        prefix="/producto/"
                        type="text"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        value={form.slug}
                        onChange={onText("slug")}
                    />
                )}
            </FormField>

            <FormField
                label="Frase bajo el nombre"
                optional
                help="Se ve en la ficha del producto, debajo del nombre."
                error={errors.subtitle}
                length={form.subtitle.length}
                maxLength={SUBTITLE_MAX}
            >
                {(field) => (
                    <input {...field} type="text" value={form.subtitle} onChange={onText("subtitle")} className={FIELD} />
                )}
            </FormField>

            {/* El ejemplo gris (placeholder) es el texto que la tienda calcula hoy
                con las opciones; con un producto nuevo todavía no hay ejemplo. */}
            <FormField
                label="Texto de la tarjeta"
                optional
                help={
                    computedCardSubtitle
                        ? "Si lo dejas vacío, se calcula solo con las opciones, como en el ejemplo gris."
                        : "Si lo dejas vacío, se calcula solo con las opciones (por ejemplo, «2 colores · 3 tallas»)."
                }
                error={errors.card_subtitle}
                length={form.card_subtitle.length}
                maxLength={CARD_SUBTITLE_MAX}
            >
                {(field) => (
                    <input
                        {...field}
                        type="text"
                        value={form.card_subtitle}
                        placeholder={computedCardSubtitle || undefined}
                        onChange={onText("card_subtitle")}
                        className={FIELD}
                    />
                )}
            </FormField>

            {/* Sin contador: el límite es solo contra textos absurdos. */}
            <FormField label="Descripción" help="Para separar párrafos, deja una línea en blanco." error={errors.description}>
                {(field) => (
                    <textarea
                        {...field}
                        rows={6}
                        maxLength={DESCRIPTION_MAX}
                        value={form.description}
                        onChange={onText("description")}
                        className={TEXTAREA}
                    />
                )}
            </FormField>

            <FormField
                label="Descripción para Google"
                help="Es el texto corto que Google muestra bajo el nombre en los resultados de búsqueda."
                error={errors.seo_description}
                length={form.seo_description.length}
                maxLength={SEO_DESCRIPTION_MAX}
            >
                {(field) => (
                    <textarea
                        {...field}
                        rows={3}
                        value={form.seo_description}
                        onChange={onText("seo_description")}
                        className={TEXTAREA}
                    />
                )}
            </FormField>
        </FormSection>
    );
};
