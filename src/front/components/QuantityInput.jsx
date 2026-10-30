import { useState } from "react";

// Selector de cantidad "− 1 +" de la maqueta de Producto, escrito una sola vez para
// la ficha y, más adelante, el carrito (tarea 4.1).
//   <QuantityInput id="quantity" value={quantity} onChange={setQuantity} />
// Va de 1 a 99. El 99 es solo un tope contra errores de dedo: cuántas unidades
// hay de verdad lo comprueba el servidor al ir a pagar (tarea 4.5), sin decir
// cuántas quedan. La etiqueta visible ("Cantidad") la pone la página con htmlFor.

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const STEP_BUTTON = `flex size-11 shrink-0 items-center justify-center rounded-full text-primary hover:bg-surface-alt disabled:cursor-not-allowed disabled:text-muted/40 disabled:hover:bg-transparent ${FOCUS}`;

const MinusIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-5" aria-hidden="true">
        <path d="M6 12h12" />
    </svg>
);

const PlusIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-5" aria-hidden="true">
        <path d="M6 12h12M12 6v12" />
    </svg>
);

export const QuantityInput = ({ id, value, onChange, min = 1, max = 99, disabled = false }) => {
    // Lo que se ve escrito. Puede quedar vacío un momento mientras se teclea;
    // `value` (la cantidad de verdad) siempre es un número entre min y max.
    const [draft, setDraft] = useState(String(value));

    const commit = (number) => {
        const clamped = Math.min(max, Math.max(min, number));
        setDraft(String(clamped));
        onChange(clamped);
    };

    // Solo dígitos y como mucho tantos como tiene el máximo (2 para el 99).
    // Si lo escrito ya es válido, cuenta al momento; si no, se corrige al salir.
    const handleChange = (event) => {
        const digits = event.target.value.replace(/\D/g, "").slice(0, String(max).length);
        setDraft(digits);
        const number = Number(digits);
        if (digits !== "" && number >= min && number <= max) onChange(number);
    };

    // Al salir del campo: vacío o 0 vuelve al mínimo.
    const handleBlur = () => commit(Number(draft) || min);

    // Flechas arriba y abajo, como en un campo numérico normal.
    const handleKeyDown = (event) => {
        if (event.key === "ArrowUp") {
            event.preventDefault();
            commit(value + 1);
        } else if (event.key === "ArrowDown") {
            event.preventDefault();
            commit(value - 1);
        }
    };

    return (
        <div className={`inline-flex h-13 items-center rounded-full border border-line bg-surface px-1 ${disabled ? "opacity-50" : ""}`}>
            <button
                type="button"
                onClick={() => commit(value - 1)}
                disabled={disabled || value <= min}
                aria-label="Quitar una unidad"
                className={STEP_BUTTON}
            >
                <MinusIcon />
            </button>
            {/* type="text" con teclado numérico: type="number" deja escribir "e", "-" o
                decimales y cambia la cantidad sin querer al girar la rueda del ratón. */}
            <input
                id={id}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={draft}
                onChange={handleChange}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                disabled={disabled}
                // spinbutton: el lector de pantalla lo anuncia como cantidad de min a max.
                role="spinbutton"
                aria-valuenow={value}
                aria-valuemin={min}
                aria-valuemax={max}
                className={`w-12 rounded-md bg-transparent text-center text-lg font-semibold text-primary ${FOCUS}`}
            />
            <button
                type="button"
                onClick={() => commit(value + 1)}
                disabled={disabled || value >= max}
                aria-label="Agregar una unidad"
                className={STEP_BUTTON}
            >
                <PlusIcon />
            </button>
        </div>
    );
};
