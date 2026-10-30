import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";

// Navegación por categorías de la Tienda (tarea 3.3), según la maqueta aprobada:
//   - CategorySidebar: columna izquierda en escritorio (lg), con el número de
//     productos y las subcategorías sangradas debajo de su categoría.
//   - CategoryChips: en móvil y tablet, fila de botones que se desliza de lado.
//     Si la categoría elegida tiene subcategorías (o es una), aparece una
//     segunda fila con ellas (decisión del 29 oct).
// Las dos reciben el árbol de GET /api/categories y el slug de la página actual
// ("" en /tienda). Son enlaces: cada categoría tiene su dirección.

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const categoryPath = (slug) => (slug ? `/categoria/${slug}` : "/tienda");

// La categoría principal de la página actual: la misma, o la madre si es una subcategoría.
const activeParentOf = (categories, slug) =>
    categories.find((parent) => parent.slug === slug || parent.children.some((child) => child.slug === slug)) ?? null;

const SidebarLink = ({ slug, label, count, active, child = false }) => (
    <Link
        to={categoryPath(slug)}
        aria-current={active ? "page" : undefined}
        className={
            `flex items-center justify-between gap-3 rounded-lg ${FOCUS} ` +
            (child ? "py-2 pl-6 pr-3 text-sm " : "px-3 py-2.5 ") +
            (active ? "bg-surface-alt font-semibold text-primary" : "text-primary hover:bg-surface-alt")
        }
    >
        <span>{label}</span>
        <span className="text-sm font-normal text-muted">{count}</span>
    </Link>
);

export const CategorySidebar = ({ categories, totalProducts, slug }) => (
    <nav aria-label="Categorías" className="hidden lg:block">
        <h2 className="px-3 text-sm uppercase tracking-wider text-muted">Categorías</h2>
        <ul className="mt-3 space-y-1">
            <li>
                <SidebarLink slug="" label="Todo" count={totalProducts} active={slug === ""} />
            </li>
            {categories.map((parent) => (
                <li key={parent.slug}>
                    <SidebarLink
                        slug={parent.slug}
                        label={parent.name}
                        count={parent.product_count}
                        active={slug === parent.slug}
                    />
                    {parent.children.length > 0 && (
                        <ul className="mt-1 space-y-1">
                            {parent.children.map((child) => (
                                <li key={child.slug}>
                                    <SidebarLink
                                        slug={child.slug}
                                        label={child.name}
                                        count={child.product_count}
                                        active={slug === child.slug}
                                        child
                                    />
                                </li>
                            ))}
                        </ul>
                    )}
                </li>
            ))}
        </ul>
    </nav>
);

// Una fila de botones deslizable. Al abrir la página, la fila se desliza sola hasta
// el botón activo si quedaba fuera (por ejemplo, Accesorios en un móvil estrecho).
// Se mueve solo la fila, nunca la página: así no estorba a la posición de Atrás.
const ChipRow = ({ chips, label, className = "" }) => {
    const rowRef = useRef(null);
    const activeRef = useRef(null);

    useEffect(() => {
        const row = rowRef.current;
        const chip = activeRef.current;
        if (!row || !chip) return;
        if (chip.offsetLeft + chip.offsetWidth > row.scrollLeft + row.clientWidth) {
            row.scrollLeft = chip.offsetLeft - 16;
        }
    }, []);

    return (
        <ul
            ref={rowRef}
            aria-label={label}
            className={`relative -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 ${className}`}
        >
            {chips.map((chip) => (
                <li key={chip.slug || "todo"} ref={chip.highlighted ? activeRef : undefined} className="shrink-0">
                    <Link
                        to={categoryPath(chip.slug)}
                        aria-current={chip.current ? "page" : undefined}
                        className={
                            `block whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium ${FOCUS} ` +
                            (chip.highlighted
                                ? "border-primary bg-primary text-surface"
                                : "border-line text-primary hover:border-primary")
                        }
                    >
                        {chip.label}
                    </Link>
                </li>
            ))}
        </ul>
    );
};

export const CategoryChips = ({ categories, slug }) => {
    const activeParent = activeParentOf(categories, slug);

    // Primera fila: Todo y las categorías principales. La madre queda marcada también
    // cuando se está en una de sus subcategorías.
    const mainChips = [
        { slug: "", label: "Todo", highlighted: slug === "", current: slug === "" },
        ...categories.map((parent) => ({
            slug: parent.slug,
            label: parent.name,
            highlighted: parent === activeParent,
            current: parent.slug === slug,
        })),
    ];

    // Segunda fila, solo si la categoría elegida tiene subcategorías.
    const subChips =
        activeParent && activeParent.children.length > 0
            ? [
                  {
                      slug: activeParent.slug,
                      label: `Todo en ${activeParent.name}`,
                      highlighted: slug === activeParent.slug,
                      current: slug === activeParent.slug,
                  },
                  ...activeParent.children.map((child) => ({
                      slug: child.slug,
                      label: child.name,
                      highlighted: slug === child.slug,
                      current: slug === child.slug,
                  })),
              ]
            : null;

    return (
        <nav aria-label="Categorías" className="mt-5 lg:hidden">
            <ChipRow chips={mainChips} label="Categorías principales" />
            {subChips && <ChipRow chips={subChips} label={`Subcategorías de ${activeParent.name}`} className="mt-2" />}
        </nav>
    );
};
