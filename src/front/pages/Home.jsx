import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getCategories, getProducts } from "../api/catalog";
import { Button } from "../components/Button";
import { CategoryCard } from "../components/CategoryCard";
import { ImagePlaceholder } from "../components/ImagePlaceholder";
import { ProductCard } from "../components/ProductCard";

// Página de Inicio (tarea 3.2), según la maqueta aprobada:
//   1. Portada con "Amar y consolar", título, frase y dos botones.
//   2. Explora por categoría (datos de GET /api/categories).
//   3. Destacados: los 4 más recientes que la administradora marcó (GET /api/products).
//   4. Franja de donativos.
// Colores y fuentes solo con los tokens de index.css.

// Mismo ancho y márgenes que la cabecera y el pie.
const CONTAINER = "mx-auto max-w-6xl px-4 sm:px-6";
const SECTION_TITLE = "text-3xl font-semibold uppercase tracking-wide lg:text-4xl";
const FOCUS = "rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const FEATURED_LIMIT = 4;

// PROVISIONAL: la congregación manda el texto definitivo (pendiente del 30 oct).
const DONATION_TEXT = "Tu donativo sostiene la misión de Vocaciones MHPVM. Tú decides el monto.";

// Peticiones de la página. Van fuera del componente para que no cambien en cada
// render (si cambiaran, el useEffect de abajo pediría los datos una y otra vez).
const loadCategories = () => getCategories();
const loadFeatured = (signal) => getProducts({ featured: true, limit: FEATURED_LIMIT }, { signal });

// Pide datos al abrir la página y dice en qué punto está: "loading", "ready" o "error".
// Al salir de la página (o en el doble montaje de StrictMode en desarrollo) se
// cancela la petición y se ignora su respuesta, para no actualizar algo que ya no está.
const useRequest = (request) => {
    const [state, setState] = useState({ status: "loading", data: null });

    useEffect(() => {
        const controller = new AbortController();
        request(controller.signal)
            .then((data) => {
                if (!controller.signal.aborted) setState({ status: "ready", data });
            })
            .catch(() => {
                if (!controller.signal.aborted) setState({ status: "error", data: null });
            });
        return () => controller.abort();
    }, [request]);

    return state;
};

// Aviso si la API falla: mejor decirlo que dejar la sección vacía sin explicación.
const LoadError = ({ what }) => (
    <p role="status" className="mt-6 rounded-xl border border-line px-4 py-6 text-center text-muted">
        No pudimos cargar {what}. Recarga la página para intentarlo de nuevo.
    </p>
);

// Recuadros grises con la forma de las tarjetas mientras llegan los datos, para que
// la página no salte cuando aparecen. motion-safe: no parpadean si la persona pidió
// menos animaciones en su sistema.
const PULSE = "rounded-xl bg-surface-alt motion-safe:animate-pulse";

const CategorySkeleton = () => <div className={`h-26 sm:aspect-9/10 sm:h-auto ${PULSE}`} />;

const ProductSkeleton = () => (
    <div>
        <div className={`aspect-square ${PULSE}`} />
        <div className={`mt-3 h-4 w-3/4 ${PULSE}`} />
        <div className={`mt-2 h-4 w-1/2 ${PULSE}`} />
    </div>
);

const Hero = () => (
    // Columnas 3 a 2 en escritorio: el título cabe en tres renglones, como en la maqueta.
    <section className={`${CONTAINER} grid items-center gap-10 py-12 lg:grid-cols-[3fr_2fr] lg:gap-16 lg:py-20`}>
        <div>
            {/* Rojo solo en tamaño grande: sobre blanco no da el contraste para texto pequeño. */}
            <p className="font-script text-3xl text-alert lg:text-4xl">Amar y consolar</p>
            {/* El único h1 de la página. Se escribe normal y se ve en mayúsculas por CSS:
                los lectores de pantalla y Google leen mejor el texto así. */}
            <h1 className="mt-3 text-4xl font-semibold uppercase leading-tight sm:text-5xl lg:text-6xl lg:leading-[1.1]">
                Merch con sentido para jóvenes con vocación
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted">
                Playeras, papelería y accesorios de Vocaciones MHPVM. Envíos a todo México.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:gap-4">
                <Button to="/tienda" className="w-full sm:w-auto">
                    Ver la tienda
                </Button>
                <Button to="/donaciones" variant="outline" className="w-full sm:w-auto">
                    Hacer un donativo
                </Button>
            </div>
        </div>
        {/* Foto de la portada: recuadro sin foto hasta que haya fotos oficiales de producto.
            Cuando llegue, se sustituye ImagePlaceholder por la imagen. */}
        <div className="aspect-4/3 overflow-hidden rounded-xl">
            <ImagePlaceholder />
        </div>
    </section>
);

const CategoriesSection = () => {
    const { status, data } = useRequest(loadCategories);
    const categories = data?.categories ?? [];

    // Sin categorías con productos visibles, la sección no se muestra.
    if (status === "ready" && categories.length === 0) return null;

    return (
        <section aria-labelledby="home-categories" className={`${CONTAINER} py-10 lg:py-14`}>
            <h2 id="home-categories" className={SECTION_TITLE}>
                Explora por categoría
            </h2>
            {status === "error" ? (
                <LoadError what="las categorías" />
            ) : (
                <div className="mt-6 grid gap-4 sm:grid-cols-3 sm:gap-6 lg:mt-8" aria-busy={status === "loading"}>
                    {status === "loading"
                        ? [1, 2, 3].map((n) => <CategorySkeleton key={n} />)
                        : categories.map((category) => <CategoryCard key={category.slug} category={category} />)}
                </div>
            )}
        </section>
    );
};

const FeaturedSection = () => {
    const { status, data } = useRequest(loadFeatured);
    const products = data?.items ?? [];

    // Si la administradora no marcó ningún destacado, la sección se oculta (decisión del 27 oct).
    if (status === "ready" && products.length === 0) return null;

    return (
        <section aria-labelledby="home-featured" className={`${CONTAINER} py-10 lg:py-14`}>
            <div className="flex items-end justify-between gap-4">
                <h2 id="home-featured" className={SECTION_TITLE}>
                    Destacados
                </h2>
                <Link
                    to="/tienda"
                    className={`inline-flex shrink-0 items-center gap-1 pb-1 text-sm font-semibold text-primary hover:underline ${FOCUS}`}
                >
                    Ver toda la tienda
                    <span aria-hidden="true">›</span>
                </Link>
            </div>
            {status === "error" ? (
                <LoadError what="los productos destacados" />
            ) : (
                <div
                    className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 lg:mt-8 lg:grid-cols-4 lg:gap-x-6"
                    aria-busy={status === "loading"}
                >
                    {status === "loading"
                        ? Array.from({ length: FEATURED_LIMIT }, (_, n) => <ProductSkeleton key={n} />)
                        : products.map((product) => <ProductCard key={product.slug} product={product} />)}
                </div>
            )}
        </section>
    );
};

// Franja de ancho completo con fondo alterno; sin foto hasta tenerla (decisión del 29 oct).
const DonationBand = () => (
    <section aria-labelledby="home-donations" className="mt-6 bg-surface-alt lg:mt-10">
        <div className={`${CONTAINER} py-14 lg:py-20`}>
            <div className="max-w-2xl">
                <p className="font-script text-3xl text-alert">Gracias por sumarte</p>
                <h2 id="home-donations" className={`mt-2 ${SECTION_TITLE}`}>
                    Apoya la misión con un donativo
                </h2>
                <p className="mt-4 text-lg text-muted">{DONATION_TEXT}</p>
                <Button to="/donaciones" className="mt-8 w-full sm:w-auto">
                    Hacer un donativo
                </Button>
            </div>
        </div>
    </section>
);

export const Home = () => {
    return (
        <main>
            <Hero />
            <CategoriesSection />
            <FeaturedSection />
            <DonationBand />
        </main>
    );
};
