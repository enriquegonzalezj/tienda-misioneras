// Aviso cuando la API falla: mejor decirlo que dejar la sección vacía sin explicación.
// `what` completa la frase: "No pudimos cargar los productos."
// `className` es solo para colocación (márgenes).
export const LoadError = ({ what, className = "mt-6" }) => (
    <p role="status" className={`rounded-xl border border-line px-4 py-6 text-center text-muted ${className}`}>
        No pudimos cargar {what}. Recarga la página para intentarlo de nuevo.
    </p>
);
