import { useId } from "react";
import { AlertIcon } from "./FormField";

// Interruptor de sí o no del panel ("Visible en la tienda", "Destacado en
// Inicio"; en el paso 7b también "Con círculo de color" y "Activa").
//
//   <Toggle label="Destacado en Inicio" help="..." checked={on} onChange={setOn} />
//
// Es un botón con role="switch": el lector de pantalla dice "activado" o
// "desactivado" según aria-checked, y se cambia con Espacio o Intro como
// cualquier botón. El estado no depende solo del color: la bolita cambia de
// lado. La etiqueta, la ayuda y el error quedan enlazados con aria-labelledby
// y aria-describedby, y pulsar la etiqueta también cambia el interruptor.
export const Toggle = ({ label, help, error, checked, disabled = false, onChange }) => {
    const id = useId();
    const labelId = `${id}-label`;
    const errorId = `${id}-error`;
    const helpId = `${id}-help`;
    const describedBy = [error && errorId, help && helpId].filter(Boolean).join(" ") || undefined;

    return (
        <div className="flex items-start gap-3">
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-labelledby={labelId}
                aria-describedby={describedBy}
                aria-invalid={error ? true : undefined}
                disabled={disabled}
                onClick={() => onChange(!checked)}
                className={`relative mt-0.5 h-7 w-11.5 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 ${
                    checked ? "bg-primary" : "bg-field"
                }`}
            >
                <span
                    className={`absolute left-1 top-1 size-5 rounded-full bg-surface transition-transform ${
                        checked ? "translate-x-4.5" : ""
                    }`}
                    aria-hidden="true"
                />
            </button>
            <div className="min-w-0">
                {/* Pulsar el texto también cambia el interruptor, como una etiqueta normal. */}
                <span
                    id={labelId}
                    onClick={disabled ? undefined : () => onChange(!checked)}
                    className={`font-semibold ${disabled ? "" : "cursor-pointer"}`}
                >
                    {label}
                </span>
                {error && (
                    <p id={errorId} className="mt-1 flex items-start gap-1.5 text-sm font-semibold">
                        <AlertIcon className="text-alert" />
                        <span>{error}</span>
                    </p>
                )}
                {help && (
                    <p id={helpId} className="mt-0.5 text-sm text-muted">
                        {help}
                    </p>
                )}
            </div>
        </div>
    );
};
