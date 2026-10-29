import { ProductCard } from "./ProductCard";

// Rejilla de tarjetas de producto, escrita una sola vez para Inicio, Tienda y categorías:
// 2 por fila en móvil y 4 en escritorio, como en las maquetas.
//
//   <ProductGrid products={items} />                     productos ya cargados
//   <ProductGrid products={[]} loadingCount={4} />       cargando: 4 recuadros grises
//   <ProductGrid products={items} loadingCount={12} />   "Ver más": los cargados y, debajo,
//                                                        recuadros para los que vienen
//
// `className` es solo para colocación (márgenes).

// Recuadros grises con la forma de la tarjeta mientras llegan los datos, para que
// la página no salte cuando aparecen. motion-safe: no parpadean si la persona pidió
// menos animaciones en su sistema.
const PULSE = "rounded-xl bg-surface-alt motion-safe:animate-pulse";

const ProductSkeleton = () => (
    <div>
        <div className={`aspect-square ${PULSE}`} />
        <div className={`mt-3 h-4 w-3/4 ${PULSE}`} />
        <div className={`mt-2 h-4 w-1/2 ${PULSE}`} />
    </div>
);

export const ProductGrid = ({ products, loadingCount = 0, className = "" }) => (
    <div
        className={`grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-4 lg:gap-x-6 ${className}`}
        aria-busy={loadingCount > 0}
    >
        {products.map((product) => (
            <ProductCard key={product.slug} product={product} />
        ))}
        {Array.from({ length: loadingCount }, (_, n) => (
            <ProductSkeleton key={`skeleton-${n}`} />
        ))}
    </div>
);
