import { useCallback, useState } from "react";
import { useNavigationType, useParams } from "react-router-dom";
import { getProduct, peekProduct } from "../api/catalog";
import { Availability } from "../components/Availability";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { Button } from "../components/Button";
import { ImagePlaceholder } from "../components/ImagePlaceholder";
import { LoadError } from "../components/LoadError";
import { NotFound } from "../components/NotFound";
import { QuantityInput } from "../components/QuantityInput";
import { findVariant, VariantPicker } from "../components/VariantPicker";
import { useRequest } from "../hooks/useRequest";
import { formatPrice } from "../utils/formatPrice";

// Ficha de producto (tarea 3.4), según la maqueta aprobada, para /producto/<slug>:
//   migas, fotos con miniaturas, categoría, nombre, frase, precio, disponibilidad,
//   selector de opciones, cantidad, botón del carrito, envío y pago, y descripción.
//   Los datos llegan de GET /api/products/<slug>. Precio y disponibilidad son los de
//   la variante elegida.
// Colores y fuentes solo con los tokens de index.css.

// Mismo ancho y márgenes que la cabecera y el pie.
const CONTAINER = "mx-auto max-w-6xl px-4 sm:px-6";
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
// Escritorio: fotos a la izquierda, un poco más anchas que los datos (como en la maqueta).
const COLUMNS = "grid gap-8 lg:grid-cols-[7fr_6fr] lg:items-start lg:gap-16";

// Variante que se muestra al abrir la ficha: la primera disponible, en el orden del
// panel; si todas están agotadas, la primera (el producto sale como "Agotado").
const defaultVariant = (variants) => variants.find((variant) => variant.available) ?? variants[0];

// La descripción es texto plano: una línea en blanco separa párrafos. Se muestra como
// texto (React lo escapa), nunca como HTML, para que nadie pueda meter código en la página.
const paragraphsOf = (text) =>
    (text ?? "")
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);

// Foto grande y, si hay más de una, miniaturas para cambiarla.
const Gallery = ({ images }) => {
    const [current, setCurrent] = useState(0);
    const image = images[current];

    return (
        <div>
            <div className="aspect-square overflow-hidden rounded-2xl border border-line bg-surface">
                {image ? (
                    // Sin loading="lazy": es lo primero que se ve, tiene que cargar ya.
                    <img
                        src={image.url}
                        alt={image.alt}
                        width="1200"
                        height="1200"
                        decoding="async"
                        className="h-full w-full object-contain p-6"
                    />
                ) : (
                    <ImagePlaceholder />
                )}
            </div>

            {images.length > 1 && (
                <ul className="mt-4 flex flex-wrap gap-3">
                    {images.map((item, index) => (
                        <li key={item.url}>
                            {/* aria-pressed: el lector de pantalla dice cuál está puesta.
                                La miniatura no repite el alt (ya va en aria-label). */}
                            <button
                                type="button"
                                onClick={() => setCurrent(index)}
                                aria-pressed={index === current}
                                aria-label={`Ver foto ${index + 1} de ${images.length}: ${item.alt}`}
                                className={`size-18 overflow-hidden rounded-xl border-2 bg-surface lg:size-24 ${
                                    index === current ? "border-primary" : "border-line hover:border-muted"
                                } ${FOCUS}`}
                            >
                                <img
                                    src={item.thumb_url}
                                    alt=""
                                    width="240"
                                    height="240"
                                    loading="lazy"
                                    decoding="async"
                                    className="h-full w-full object-contain p-1"
                                />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

// Precio de la variante elegida. Con campaña (tarea 4.8), el rebajado en grande y el
// normal tachado; hasta entonces la API manda sale_price en null y solo sale el normal.
const Price = ({ variant }) => {
    const onSale = variant.sale_price != null && Number(variant.sale_price) < Number(variant.price);
    return (
        <p className="flex flex-wrap items-baseline gap-x-3 text-primary">
            {onSale ? (
                <>
                    <span className="text-3xl font-bold">
                        <span className="sr-only">Precio con descuento: </span>
                        {formatPrice(variant.sale_price)}
                    </span>
                    <s className="text-lg text-muted">
                        <span className="sr-only">Precio normal: </span>
                        {formatPrice(variant.price)}
                    </s>
                </>
            ) : (
                <span className="text-3xl font-bold">{formatPrice(variant.price)}</span>
            )}
            <span className="text-base text-muted">MXN</span>
        </p>
    );
};

const TruckIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true">
        <path d="M3 6h11v9H3z" />
        <path d="M14 9h4l3 3v3h-7" />
        <circle cx="7" cy="17.5" r="1.8" />
        <circle cx="17" cy="17.5" r="1.8" />
    </svg>
);

const LockIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true">
        <rect x="5" y="10" width="14" height="10" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
);

// La bolsa de la cabecera: el mismo dibujo para "carrito" en toda la tienda.
const BagIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mr-3 size-6 shrink-0" aria-hidden="true">
        <path d="M6 8h12l-1 12H7L6 8z" />
        <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
);

// Cantidad y "Agregar al carrito". El carrito llega en la tarea 4.1: hasta entonces
// el botón se ve pero va desactivado, con el aviso debajo (decisión 1 de la 3.4).
// En móvil, la cantidad sola y el botón a todo el ancho debajo; desde 640 px, en fila.
const AddToCart = ({ quantity, onQuantityChange, available }) => (
    <div className="mt-8">
        <label htmlFor="product-quantity" className="text-base font-semibold text-primary">
            Cantidad
        </label>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
            <div>
                <QuantityInput
                    id="product-quantity"
                    value={quantity}
                    onChange={onQuantityChange}
                    disabled={!available}
                />
            </div>
            <Button disabled aria-describedby="add-to-cart-soon" className="w-full sm:w-auto sm:flex-1">
                <BagIcon />
                Agregar al carrito
            </Button>
        </div>
        <p id="add-to-cart-soon" className="mt-3 text-sm text-muted">
            Muy pronto podrás comprar desde aquí.
        </p>
    </div>
);

// Recuadro de envío y pago. Textos fijos de la maqueta.
const PurchaseInfo = () => (
    <ul className="mt-8 space-y-3 rounded-2xl bg-surface-alt p-5 text-sm text-muted lg:p-6">
        <li className="flex gap-3">
            <TruckIcon />
            <span>Envíos a todo México. El costo del envío se calcula al pagar.</span>
        </li>
        <li className="flex gap-3">
            <LockIcon />
            <span>Pago seguro con Mercado Pago. Puedes comprar sin crear cuenta.</span>
        </li>
    </ul>
);

const Description = ({ text }) => {
    const paragraphs = paragraphsOf(text);
    if (paragraphs.length === 0) return null;
    return (
        <section aria-labelledby="product-description" className="mt-10 lg:mt-8 lg:border-t lg:border-line lg:pt-8">
            <h2 id="product-description" className="text-2xl font-semibold uppercase tracking-wide">
                Descripción
            </h2>
            {/* whitespace-pre-line: respeta los saltos de línea sueltos dentro de un párrafo. */}
            <div className="mt-4 space-y-4 leading-relaxed text-muted">
                {paragraphs.map((paragraph, index) => (
                    <p key={index} className="whitespace-pre-line">
                        {paragraph}
                    </p>
                ))}
            </div>
        </section>
    );
};

// Datos del producto ya recibido. Guarda qué variante está elegida (un valor por
// opción, por ejemplo ["Beige", "G"]); al abrir, la de defaultVariant.
const ProductDetails = ({ product }) => {
    const [selected, setSelected] = useState(() => defaultVariant(product.variants).values);
    const [quantity, setQuantity] = useState(1);
    const variant = findVariant(product.variants, selected) ?? defaultVariant(product.variants);

    return (
        <div className={`mt-6 lg:mt-8 ${COLUMNS}`}>
            <Gallery images={product.images} />
            <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted">{product.category.name}</p>
                {/* El único h1 de la página; en mayúsculas por CSS, como en la Tienda. */}
                <h1 className="mt-2 text-4xl font-semibold uppercase tracking-wide lg:text-5xl">{product.name}</h1>
                {product.subtitle && <p className="mt-2 text-lg text-muted">{product.subtitle}</p>}

                {/* aria-live: si el precio cambia al elegir otra opción, el lector de pantalla lo lee. */}
                <div
                    aria-live="polite"
                    className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 lg:justify-start"
                >
                    <Price variant={variant} />
                    <Availability available={variant.available} className="text-sm" />
                </div>

                <VariantPicker
                    options={product.options}
                    variants={product.variants}
                    selected={selected}
                    onChange={setSelected}
                    className="mt-8"
                />

                <AddToCart quantity={quantity} onQuantityChange={setQuantity} available={variant.available} />

                <PurchaseInfo />
                <Description text={product.description} />
            </div>
        </div>
    );
};

// Recuadros grises con la forma de la ficha mientras llegan los datos.
const PULSE = "rounded-lg bg-surface-alt motion-safe:animate-pulse";
const Loading = () => (
    <div className={`mt-6 lg:mt-8 ${COLUMNS}`} aria-busy="true">
        <span className="sr-only">Cargando el producto…</span>
        <div className={`aspect-square rounded-2xl ${PULSE}`} />
        <div className="space-y-4">
            <div className={`h-4 w-20 ${PULSE}`} />
            <div className={`h-12 w-3/4 ${PULSE}`} />
            <div className={`h-6 w-1/2 ${PULSE}`} />
            <div className={`h-10 w-40 ${PULSE}`} />
        </div>
    </div>
);

const ProductPage = ({ slug }) => {
    const navigationType = useNavigationType();
    const load = useCallback((signal) => getProduct(slug, { signal }), [slug]);
    // Al volver con Atrás ("POP") se usa la ficha ya recibida, para dibujarla completa
    // al instante; entrando desde un enlace se pide de nuevo (disponibilidad al día).
    const { status, data: product, error } = useRequest(load, navigationType === "POP" ? peekProduct(slug) : null);

    if (status === "error" && error?.status === 404) {
        return <NotFound message="Este producto no existe o ya no está disponible." />;
    }

    const trail = [
        { to: "/", label: "Inicio" },
        { to: "/tienda", label: "Tienda" },
    ];
    if (product) {
        const { category, parent_category: parent } = product;
        if (parent) trail.push({ to: `/categoria/${parent.slug}`, label: parent.name });
        trail.push({ to: `/categoria/${category.slug}`, label: category.name });
        trail.push({ to: `/producto/${product.slug}`, label: product.name });
    }

    let content;
    if (status === "error") {
        content = <LoadError what="el producto" />;
    } else if (status === "loading") {
        content = <Loading />;
    } else {
        content = <ProductDetails product={product} />;
    }

    return (
        <main className={`${CONTAINER} pb-16 pt-6 lg:pb-20 lg:pt-8`}>
            <Breadcrumbs trail={trail} />
            {content}
        </main>
    );
};

// La ruta monta una ficha nueva para cada producto (key): así, al pasar de un
// producto a otro, no se ven ni la foto ni los datos del anterior.
export const Product = () => {
    const { slug } = useParams();
    return <ProductPage key={slug} slug={slug} />;
};
