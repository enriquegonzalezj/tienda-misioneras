import { Link } from "react-router-dom";
import { ImagePlaceholder } from "./ImagePlaceholder";

// Tarjeta de categoría de la sección "Explora por categoría" de Inicio.
// Recibe un elemento de `categories` de GET /api/categories tal cual:
//   { name, slug, card_text, image, product_count, children }
// (product_count y children no se muestran aquí).
//
// Según la maqueta aprobada de Inicio, cambia de forma con el ancho:
//   - Móvil: un renglón con la imagen pequeña a la izquierda, el texto
//     a la derecha y una flecha al final.
//   - Desde sm (640 px): un recuadro con la imagen arriba, y debajo el nombre,
//     la frase y "Ver productos".
// Es el mismo componente con clases distintas por tamaño (prefijo sm:),
// así el contenido y el enlace existen una sola vez.

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary";

// Flecha › dibujada con SVG para no depender de un paquete de iconos.
const Chevron = ({ className = "" }) => (
    <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`size-4 shrink-0 ${className}`}
        aria-hidden="true"
    >
        <path d="M8 5l5 5-5 5" />
    </svg>
);

export const CategoryCard = ({ category }) => {
    const { name, slug, card_text, image } = category;

    return (
        <Link
            to={`/categoria/${slug}`}
            className={`group flex items-center gap-4 overflow-hidden rounded-xl border border-line bg-surface p-3 transition-colors hover:border-primary sm:flex-col sm:items-stretch sm:gap-0 sm:p-0 ${FOCUS}`}
        >
            {/* Imagen: cuadrito de 80 px en móvil; ancho completo y proporción 4:3 desde sm. */}
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg sm:aspect-4/3 sm:h-auto sm:w-full sm:rounded-none">
                {image ? (
                    <img
                        src={image.url}
                        alt={image.alt}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-contain p-2 sm:p-6"
                    />
                ) : (
                    <ImagePlaceholder />
                )}
            </div>

            <div className="min-w-0 flex-1 sm:px-6 sm:pt-2 sm:pb-6">
                <h3 className="font-display text-lg font-semibold uppercase tracking-wide text-primary sm:text-2xl">
                    {name}
                </h3>
                {card_text && <p className="mt-1 text-sm text-muted">{card_text}</p>}
                {/* En móvil este texto se oculta y queda solo la flecha del final. */}
                <span className="mt-4 hidden items-center gap-1 text-sm font-semibold text-primary group-hover:underline sm:inline-flex">
                    Ver productos
                    <Chevron />
                </span>
            </div>

            <Chevron className="text-primary sm:hidden" />
        </Link>
    );
};
