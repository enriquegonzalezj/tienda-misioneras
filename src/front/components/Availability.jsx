// "Disponible" o "Agotado" con su punto de color, escrito una sola vez para las
// tarjetas y la ficha. Nunca dice cuántas unidades quedan (regla de existencias).
// El punto es solo decoración: el texto ya dice si se puede comprar.
// `className` es solo para colocación y tamaño de letra (por ejemplo "mt-1 text-sm").
export const Availability = ({ available, className = "" }) => (
    <p className={`flex items-center gap-2 text-muted ${className}`.trim()}>
        <span className={`size-2 shrink-0 rounded-full ${available ? "bg-accent" : "bg-muted/50"}`} aria-hidden="true" />
        {available ? "Disponible" : "Agotado"}
    </p>
);
