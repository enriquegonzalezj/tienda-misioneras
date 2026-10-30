import { Link } from "react-router-dom";
import { formatPrice } from "../utils/formatPrice";
import { Availability } from "./Availability";
import { ImagePlaceholder } from "./ImagePlaceholder";

// Tarjeta de producto del catálogo (Inicio, Tienda y categorías).
// Recibe un elemento de `items` de GET /api/products tal cual:
//   { name, slug, image, subtitle, price_min, price_varies, sale_price_min, available }
//
// Según las maquetas aprobadas de Inicio y Tienda:
//   - Foto cuadrada con esquinas redondeadas y borde gris, sobre fondo blanco.
//   - Nombre, texto corto ("2 colores · 3 tallas"), precio y disponibilidad.
//   - "Desde" cuando las variantes tienen precios distintos.
//   - Con campaña (tarea 4.8): precio rebajado en azul y el normal tachado.
//     Hasta entonces la API manda sale_price_min en null y solo se ve el normal.
// Toda la tarjeta es un enlace a la ficha del producto.

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary";

// "Desde" va más pequeño y en gris, como en la maqueta.
const From = () => <span className="text-sm font-normal text-muted">Desde </span>;

export const ProductCard = ({ product }) => {
    const { name, slug, image, subtitle, price_min, price_varies, sale_price_min, available } = product;

    // Solo se muestra como oferta si de verdad es más barato que el normal.
    const onSale = sale_price_min != null && Number(sale_price_min) < Number(price_min);

    return (
        <Link to={`/producto/${slug}`} className={`group block rounded-xl ${FOCUS}`}>
            {/* aspect-square: todas las fotos ocupan el mismo cuadrado, midan lo que midan. */}
            <div className="aspect-square overflow-hidden rounded-xl border border-line bg-surface">
                {image ? (
                    // object-contain: la foto entera, sin recortar; loading="lazy": se
                    // descarga solo cuando la tarjeta se acerca a la pantalla.
                    <img
                        src={image.url}
                        alt={image.alt}
                        width="600"
                        height="600"
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-contain p-4 transition-transform duration-300 group-hover:scale-105"
                    />
                ) : (
                    <ImagePlaceholder />
                )}
            </div>

            <h3 className="mt-3 font-sans text-base font-semibold text-primary group-hover:underline">{name}</h3>

            {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}

            <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-primary">
                {onSale ? (
                    <>
                        {/* Los textos sr-only solo los leen los lectores de pantalla:
                            sin ellos dirían dos precios seguidos sin explicar cuál es cuál. */}
                        <span className="text-lg font-semibold">
                            <span className="sr-only">Precio con descuento: </span>
                            {price_varies && <From />}
                            {formatPrice(sale_price_min)}
                        </span>
                        <s className="text-sm text-muted">
                            <span className="sr-only">Precio normal: </span>
                            {price_varies && "Desde "}
                            {formatPrice(price_min)}
                        </s>
                    </>
                ) : (
                    <span className="text-lg font-semibold">
                        {price_varies && <From />}
                        {formatPrice(price_min)}
                    </span>
                )}
            </p>

            <Availability available={available} className="mt-1 text-sm" />
        </Link>
    );
};
