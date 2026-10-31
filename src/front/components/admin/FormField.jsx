import { useId } from "react";

// Campo de formulario del panel, escrito una sola vez: etiqueta, contador,
// error y ayuda. Lo usan Entrar, Categorías y (en el paso 7) el formulario
// de producto.
//
// El campo en sí lo pone quien lo usa, porque cambia mucho (texto, área de
// texto, lista, contraseña con "Mostrar"). FormField le pasa las propiedades
// que lo enlazan con su etiqueta, su error y su ayuda:
//
//   <FormField label="Nombre" error={errors.name} length={name.length} maxLength={80}>
//       {(field) => <input {...field} className={FIELD} value={name} onChange={...} />}
//   </FormField>
//
// `field` trae id, aria-describedby (el lector de pantalla lee el error y la
// ayuda al entrar en el campo), aria-invalid (si hay error) y maxLength (si se
// indica: el navegador no deja escribir más).

// Clases del campo. El borde usa `field` (gris más oscuro que `line`, para que
// el borde se distinga del fondo); con error, borde rojo.
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary";
const INVALID = "aria-[invalid=true]:border-alert";

export const FIELD =
    "h-12 w-full rounded-lg border border-field bg-surface px-3.5 text-base text-primary " +
    `disabled:cursor-not-allowed disabled:bg-surface-alt disabled:text-muted ${INVALID} ${FOCUS}`;

export const TEXTAREA =
    "w-full rounded-lg border border-field bg-surface px-3.5 py-2.5 text-base leading-normal text-primary " +
    `${INVALID} ${FOCUS}`;

export const FormField = ({ label, optional = false, help, error, length, maxLength, children }) => {
    const id = useId();
    const errorId = `${id}-error`;
    const helpId = `${id}-help`;
    const describedBy = [error && errorId, help && helpId].filter(Boolean).join(" ") || undefined;

    return (
        <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <label htmlFor={id} className="block text-sm font-semibold">
                    {label}
                    {optional && <span className="font-medium text-muted"> (opcional)</span>}
                </label>
                {/* El contador es una ayuda visual; el límite real lo pone maxLength. */}
                {maxLength && (
                    <span className="shrink-0 text-xs font-medium text-muted" aria-hidden="true">
                        {length ?? 0} / {maxLength}
                    </span>
                )}
            </div>
            {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined, maxLength })}
            {error && (
                <p id={errorId} className="mt-1.5 flex items-start gap-1.5 text-sm font-semibold">
                    <AlertIcon className="text-alert" />
                    <span>{error}</span>
                </p>
            )}
            {help && (
                <p id={helpId} className="mt-1.5 text-sm text-muted">
                    {help}
                </p>
            )}
        </div>
    );
};

// Campo con un texto fijo delante, por ejemplo "/categoria/" o "/producto/"
// para la dirección en la tienda. `prefix` es solo visual; el valor es lo
// que se escribe después. El borde va en el recuadro de fuera, así que el rojo
// del error se decide aquí con aria-invalid (lo manda FormField).
export const PrefixInput = ({ prefix, ...inputProps }) => (
    <div
        className={
            "flex h-12 overflow-hidden rounded-lg border bg-surface " +
            (inputProps["aria-invalid"] ? "border-alert " : "border-field ") +
            "focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-primary"
        }
    >
        <span className="flex shrink-0 items-center border-r border-line bg-surface-alt px-3 text-sm text-muted">
            {prefix}
        </span>
        <input {...inputProps} className="min-w-0 flex-1 bg-surface px-3 text-base text-primary outline-none" />
    </div>
);

// Icono de aviso (también el de Entrar). `className` para el color: bajo un
// campo va en rojo; el rojo va en el icono, nunca en el texto pequeño, que no
// tendría contraste suficiente.
export const AlertIcon = ({ className = "" }) => (
    <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
        className={`shrink-0 ${className}`}
    >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5M12 16.5v.01" />
    </svg>
);
