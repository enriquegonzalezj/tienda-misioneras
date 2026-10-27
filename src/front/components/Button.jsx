import { Link } from "react-router-dom";

// Botón de la tienda, escrito una sola vez para todas las páginas.
// Los colores salen de los tokens de index.css (primary, surface, surface-alt):
// si cambia la marca, este archivo no se toca.
//
// Uso:
//   <Button to="/tienda">Ver la tienda</Button>                    enlace interno
//   <Button to="/donaciones" variant="outline">Hacer un donativo</Button>
//   <Button type="submit">Pagar</Button>                            botón de formulario
//
// `className` es solo para colocación (por ejemplo, ancho completo en móvil:
// "w-full sm:w-auto"), nunca para colores ni tipografía.

// Comunes a las dos variantes. El borde de 2 px va siempre (transparente en la
// rellena) para que los dos botones midan lo mismo cuando están juntos.
const BASE =
    "inline-flex items-center justify-center rounded-full border-2 px-8 py-3 " +
    "font-sans text-base font-semibold transition-colors " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary " +
    "disabled:cursor-not-allowed disabled:opacity-50";

const VARIANTS = {
    // Relleno azul: la acción principal de la pantalla.
    primary: "border-primary bg-primary text-surface hover:bg-primary/90",
    // Contorno azul: la acción secundaria, al lado de la principal.
    outline: "border-primary bg-surface text-primary hover:bg-surface-alt",
};

export const Button = ({ to, variant = "primary", type = "button", className = "", children, ...rest }) => {
    const classes = `${BASE} ${VARIANTS[variant] ?? VARIANTS.primary} ${className}`.trim();

    // Con `to` es un enlace de React Router: cambia de página sin recargar.
    if (to) {
        return (
            <Link to={to} className={classes} {...rest}>
                {children}
            </Link>
        );
    }

    return (
        <button type={type} className={classes} {...rest}>
            {children}
        </button>
    );
};
