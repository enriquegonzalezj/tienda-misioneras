import { Link } from "react-router-dom";
import { formatPrice } from "../utils/formatPrice";
import { Availability } from "./Availability";
import { ImagePlaceholder } from "./ImagePlaceholder";
import { QuantityInput } from "./QuantityInput";

// Una línea de la página del carrito (tarea 4.1): foto, nombre con enlace a la
// ficha, opciones elegidas, precio unitario, cantidad, total de la línea y "Quitar".
//
//   line      lo que respondió el servidor (POST /api/cart) para esta variante
//   quantity  la cantidad del carrito en el navegador: cambia al momento al pulsar
//             "+" o "−", antes de que el servidor recalcule
//   stale     true mientras el servidor recalcula: el total se ve atenuado para
//             que no se lea un número viejo como si fuera el bueno
//
// Precios y totales salen siempre del servidor; aquí solo se les da formato.
// Una línea agotada se queda (decisión de Enrique, 7 nov) para que la persona
// decida si la quita, pero sin total y fuera del subtotal.

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const optionsText = (values) => values.map(({ option, value }) => `${option}: ${value}`).join(" · ");

// Precio de una unidad. Con campaña (4.8) el rebajado y el normal tachado; hasta
// entonces la API manda sale_price en null y solo sale el normal.
const UnitPrice = ({ line }) => {
    const onSale = line.sale_price != null && Number(line.sale_price) < Number(line.price);
    return (
        <p className="mt-1 text-sm text-muted">
            {onSale ? (
                <>
                    <span className="sr-only">Precio con descuento: </span>
                    {formatPrice(line.sale_price)}{" "}
                    <s>
                        <span className="sr-only">Precio normal: </span>
                        {formatPrice(line.price)}
                    </s>
                </>
            ) : (
                formatPrice(line.price)
            )}{" "}
            c/u
        </p>
    );
};

const LineTotal = ({ line, stale, className = "" }) => {
    if (!line.available) return null;
    return (
        <p className={`font-semibold text-primary transition-opacity ${stale ? "opacity-50" : ""} ${className}`}>
            <span className="sr-only">Total de la línea: </span>
            {formatPrice(line.line_total)}
        </p>
    );
};

export const CartLine = ({ line, quantity, stale, onQuantityChange, onRemove }) => {
    const productUrl = `/producto/${line.slug}`;
    const quantityId = `cart-quantity-${line.variant_id}`;
    const options = optionsText(line.values);

    return (
        <li className="flex gap-4 border-b border-line py-6 first:pt-0 sm:gap-6">
            {/* La foto también lleva a la ficha, pero fuera del orden del tabulador y
                oculta al lector de pantalla: el nombre ya es ese mismo enlace. */}
            <Link
                to={productUrl}
                tabIndex={-1}
                aria-hidden="true"
                className="size-20 shrink-0 overflow-hidden rounded-xl border border-line bg-surface sm:size-28"
            >
                {line.image ? (
                    <img
                        src={line.image.url}
                        alt=""
                        width="240"
                        height="240"
                        loading="lazy"
                        decoding="async"
                        className={`h-full w-full object-contain p-1.5 ${line.available ? "" : "opacity-50"}`}
                    />
                ) : (
                    <ImagePlaceholder />
                )}
            </Link>

            <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        {/* h2 por línea: el lector de pantalla puede saltar de producto en producto. */}
                        <h2 className="font-sans text-base font-semibold text-primary">
                            <Link to={productUrl} className={`rounded-sm wrap-break-word hover:underline ${FOCUS}`}>
                                {line.name}
                            </Link>
                        </h2>
                        {options && <p className="mt-1 text-sm text-muted">{options}</p>}
                        <UnitPrice line={line} />
                        {!line.available && (
                            <Availability available={false} className="mt-2 text-sm font-medium" />
                        )}
                    </div>
                    {/* Escritorio: el total arriba a la derecha. */}
                    <LineTotal line={line} stale={stale} className="hidden sm:block" />
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                    <div className="flex items-center gap-4">
                        {/* Etiqueta solo para el lector de pantalla: "Cantidad de Playera Modelo 3". */}
                        <label htmlFor={quantityId} className="sr-only">
                            Cantidad de {line.name}
                        </label>
                        <QuantityInput
                            id={quantityId}
                            value={quantity}
                            onChange={onQuantityChange}
                            disabled={!line.available}
                        />
                        <button
                            type="button"
                            onClick={onRemove}
                            aria-label={`Quitar ${line.name} del carrito`}
                            className={`rounded-sm text-sm font-medium text-muted underline underline-offset-4 hover:text-primary ${FOCUS}`}
                        >
                            Quitar
                        </button>
                    </div>
                    {/* Móvil: el total abajo a la derecha, junto a la cantidad. */}
                    <LineTotal line={line} stale={stale} className="sm:hidden" />
                </div>
                {!line.available && (
                    <p className="mt-3 text-sm text-muted">No se incluye en el subtotal. Puedes quitarlo o esperar a que vuelva.</p>
                )}
            </div>
        </li>
    );
};
