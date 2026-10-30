import { useEffect, useRef, useState } from "react";
import { Link, useNavigationType, useParams } from "react-router-dom";
import { getCategories, getProducts, peekCategories } from "../api/catalog";
import { Button } from "../components/Button";
import { CategoryChips, CategorySidebar } from "../components/CategoryNav";
import { LoadError } from "../components/LoadError";
import { ProductGrid } from "../components/ProductGrid";
import { useRequest } from "../hooks/useRequest";

// Página Tienda (tarea 3.3), según la maqueta aprobada, para /tienda y /categoria/<slug>:
//   migas, título con el número de productos, categorías (columna en escritorio,
//   botones deslizables en móvil), rejilla de tarjetas y "Ver más productos".
// Los productos llegan de GET /api/products por tandas: 12 en escritorio y 8 en móvil.
// Colores y fuentes solo con los tokens de index.css.

// Mismo ancho y márgenes que la cabecera y el pie.
const CONTAINER = "mx-auto max-w-6xl px-4 sm:px-6";
const FOCUS = "rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

// Tamaño de cada tanda, como en la maqueta. Se decide una vez al abrir la página:
// si alguien gira el móvil después, la tanda no cambia (no hace falta).
const DESKTOP_QUERY = "(min-width: 1024px)";
const batchSizeForScreen = () => (window.matchMedia(DESKTOP_QUERY).matches ? 12 : 8);

// Lo ya cargado de cada categoría ("" es toda la tienda), para que al volver con
// Atrás desde un producto se vean los mismos productos y en la misma posición
// (ScrollRestoration de Layout devuelve la posición; para eso la página tiene que
// tener ya su altura completa en el primer dibujo). Solo vive mientras la pestaña
// está abierta: al recargar, o al entrar desde el menú o un enlace, se pide de nuevo.
const loaded = new Map();

const loadCategories = () => getCategories();

// Busca la categoría de la página en el árbol: { category, parent } o null si no está
// (no existe, o no tiene productos visibles y la API no la lista).
const findCategory = (categories, slug) => {
    for (const parent of categories) {
        if (parent.slug === slug) return { category: parent, parent: null };
        const child = parent.children.find((item) => item.slug === slug);
        if (child) return { category: child, parent };
    }
    return null;
};

const productsLabel = (count) => `${count} ${count === 1 ? "producto" : "productos"}`;

// Quita de `next` los productos que ya estaban (si entra un producto nuevo entre una
// tanda y otra, los demás se desplazan y uno podría llegar repetido).
const appendNew = (current, next) => {
    const seen = new Set(current.map((product) => product.slug));
    return [...current, ...next.filter((product) => !seen.has(product.slug))];
};

// Migas: Inicio » Tienda » (categoría madre) » página actual. La última no es enlace.
const Breadcrumbs = ({ trail }) => (
    <nav aria-label="Ruta de navegación" className="text-sm text-muted">
        <ol className="flex flex-wrap items-center gap-2">
            {trail.map((step, index) => (
                <li key={step.to} className="flex items-center gap-2">
                    {index > 0 && <span aria-hidden="true">»</span>}
                    {index < trail.length - 1 ? (
                        <Link to={step.to} className={`hover:text-primary hover:underline ${FOCUS}`}>
                            {step.label}
                        </Link>
                    ) : (
                        <span aria-current="page" className="text-primary">
                            {step.label}
                        </span>
                    )}
                </li>
            ))}
        </ol>
    </nav>
);

// Dirección de una categoría que no existe: mismo texto que el resto de la tienda.
// (El código 404 real para Google lo pone el servidor en la tarea 3.5.)
const NotFound = () => (
    <main className={`${CONTAINER} py-16 text-center lg:py-24`}>
        <h1 className="text-3xl font-semibold uppercase tracking-wide lg:text-4xl">Página no encontrada</h1>
        <p className="mt-4 text-muted">Esta categoría no existe o todavía no tiene productos.</p>
        <Button to="/tienda" className="mt-8">
            Ver la tienda
        </Button>
    </main>
);

const Catalog = ({ category, categories, found }) => {
    const navigationType = useNavigationType();
    const [batchSize] = useState(batchSizeForScreen);

    // Al volver con Atrás ("POP") se parte de lo que ya estaba cargado; si no, de cero.
    const [restored] = useState(() => (navigationType === "POP" ? loaded.get(category) ?? null : null));
    const [state, setState] = useState(() =>
        restored
            ? { status: "ready", items: restored.items, total: restored.total }
            : { status: "loading", items: [], total: 0 }
    );
    const [more, setMore] = useState("idle"); // "idle", "loading" o "error"

    const moreController = useRef(null);
    const listRef = useRef(null);
    const focusIndex = useRef(null);

    // Primera tanda (si no se recuperó de la memoria).
    useEffect(() => {
        if (restored) return undefined;
        const controller = new AbortController();
        getProducts({ category: category || undefined, limit: batchSize, offset: 0 }, { signal: controller.signal })
            .then((data) => {
                if (controller.signal.aborted) return;
                loaded.set(category, { items: data.items, total: data.total });
                setState({ status: "ready", items: data.items, total: data.total });
            })
            .catch(() => {
                if (!controller.signal.aborted) setState({ status: "error", items: [], total: 0 });
            });
        return () => controller.abort();
    }, [category, batchSize, restored]);

    // Al salir de la página se cancela un "Ver más" que siga en camino.
    useEffect(() => () => moreController.current?.abort(), []);

    // Tras "Ver más", el foco pasa al primer producto nuevo: quien navega con teclado o
    // lector de pantalla sigue donde lo dejó (el botón puede desaparecer en la última tanda).
    useEffect(() => {
        if (focusIndex.current === null || !listRef.current) return;
        const links = listRef.current.querySelectorAll("a");
        links[focusIndex.current]?.focus();
        focusIndex.current = null;
    }, [state.items]);

    const loadMore = async () => {
        const controller = new AbortController();
        moreController.current = controller;
        setMore("loading");
        try {
            const data = await getProducts(
                { category: category || undefined, limit: batchSize, offset: state.items.length },
                { signal: controller.signal }
            );
            if (controller.signal.aborted) return;
            const items = appendNew(state.items, data.items);
            loaded.set(category, { items, total: data.total });
            focusIndex.current = state.items.length;
            setState({ status: "ready", items, total: data.total });
            setMore("idle");
        } catch {
            if (!controller.signal.aborted) setMore("error");
        }
    };

    const { status, items, total } = state;
    const remaining = Math.max(total - items.length, 0);

    let content;
    if (status === "error") {
        content = <LoadError what="los productos" />;
    } else if (status === "ready" && total === 0) {
        content = (
            <p className="mt-6 text-muted">
                {category ? "Todavía no hay productos en esta categoría." : "Todavía no hay productos en la tienda."}
            </p>
        );
    } else {
        content = (
            <>
                <div ref={listRef}>
                    <ProductGrid
                        products={items}
                        loadingCount={status === "loading" ? batchSize : more === "loading" ? Math.min(batchSize, remaining) : 0}
                        className="mt-6 lg:mt-10"
                    />
                </div>
                {status === "ready" && (
                    <div className="mt-12 flex flex-col items-center gap-4 text-center">
                        {/* aria-live: el lector de pantalla anuncia el nuevo número tras "Ver más". */}
                        <p aria-live="polite" className="text-sm text-muted">
                            Mostrando {items.length} de {productsLabel(total)}
                        </p>
                        {more === "error" && (
                            <p role="status" className="text-sm text-muted">
                                No pudimos cargar más productos. Inténtalo de nuevo.
                            </p>
                        )}
                        {remaining > 0 && (
                            <Button variant="outline" onClick={loadMore} disabled={more === "loading"}>
                                {more === "loading" ? "Cargando…" : "Ver más productos"}
                            </Button>
                        )}
                    </div>
                )}
            </>
        );
    }

    const tree = categories.data?.categories ?? [];
    const title = category ? found?.category.name : "Tienda";
    const trail = [
        { to: "/", label: "Inicio" },
        { to: "/tienda", label: "Tienda" },
        ...(found?.parent ? [{ to: `/categoria/${found.parent.slug}`, label: found.parent.name }] : []),
        ...(found ? [{ to: `/categoria/${found.category.slug}`, label: found.category.name }] : []),
    ];

    return (
        <main className={`${CONTAINER} pb-16 pt-6 lg:pb-20 lg:pt-8`}>
            <Breadcrumbs trail={trail} />
            <div className="mt-6 lg:mt-8 lg:grid lg:grid-cols-[13rem_1fr] lg:items-start lg:gap-10">
                {categories.status === "ready" && (
                    <CategorySidebar
                        categories={tree}
                        totalProducts={categories.data.total_products}
                        slug={category}
                    />
                )}
                <div className="lg:col-start-2">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
                        {/* El único h1 de la página; en mayúsculas por CSS, como en Inicio.
                            Mientras llega el nombre de la categoría, un recuadro gris. */}
                        {title ? (
                            <h1 className="text-3xl font-semibold uppercase tracking-wide lg:text-4xl">{title}</h1>
                        ) : (
                            <div className="h-9 w-48 rounded-lg bg-surface-alt motion-safe:animate-pulse lg:h-10" />
                        )}
                        {status === "ready" && total > 0 && <p className="text-muted">{productsLabel(total)}</p>}
                    </div>
                    {categories.status === "ready" && <CategoryChips categories={tree} slug={category} />}
                    {content}
                </div>
            </div>
        </main>
    );
};

// Una sola página para /tienda y /categoria/<slug>. La ruta monta un catálogo nuevo
// para cada categoría (key): así cada una empieza limpia, sin productos ni estados
// de la anterior. Las categorías se piden una vez y se comparten con el pie.
export const Shop = () => {
    const { slug = "" } = useParams();
    const categories = useRequest(loadCategories, peekCategories());

    // Si la API de categorías falla en una categoría, no se sabe ni su nombre: aviso.
    if (slug && categories.status === "error") {
        return (
            <main className={`${CONTAINER} py-16`}>
                <LoadError what="la categoría" />
            </main>
        );
    }

    const found = slug && categories.status === "ready" ? findCategory(categories.data.categories, slug) : null;
    if (slug && categories.status === "ready" && !found) return <NotFound />;

    return <Catalog key={slug} category={slug} categories={categories} found={found} />;
};
