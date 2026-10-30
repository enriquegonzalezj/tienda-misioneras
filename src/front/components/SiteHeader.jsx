import { useEffect, useId, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import logo from "../assets/logo.webp";

// Cabecera de la tienda, igual en todas las páginas (la pone Layout).
// Según la maqueta aprobada de Inicio:
//   - Franja de 4 colores de la marca arriba.
//   - Escritorio (lg, 1024 px o más): logo y nombre a la izquierda, menú al
//     centro, "Mi cuenta" y carrito a la derecha.
//   - Móvil y tablet: botón de menú, logo y nombre, y carrito. El menú se
//     despliega debajo (sin diseño aprobado; propuesta aceptada el 27 oct).
// Colores y fuentes solo con los tokens de index.css.

const MAIN_LINKS = [
    { to: "/", label: "Inicio", end: true },
    // Categorías y fichas son parte de la Tienda: en /categoria/... y /producto/...
    // también se marca "Tienda".
    { to: "/tienda", label: "Tienda", alsoActiveOn: ["/categoria/", "/producto/"] },
    { to: "/donaciones", label: "Donaciones" },
];

// Contorno visible solo al navegar con teclado.
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

// NavLink marca solo su propia dirección; `alsoActiveOn` (lista de comienzos de
// dirección) marca además las páginas que cuelgan de esa sección (por ejemplo,
// "Tienda" en una categoría o en un producto).
const activeIn = (link, pathname, linkClass) => ({ isActive }) =>
    linkClass({ isActive: isActive || (link.alsoActiveOn ?? []).some((start) => pathname.startsWith(start)) });

// Enlace del menú de escritorio: la página actual va en azul y subrayada.
const desktopLinkClass = ({ isActive }) =>
    `border-b-2 py-1 font-medium transition-colors ${FOCUS} ` +
    (isActive ? "border-primary text-primary" : "border-transparent text-muted hover:text-primary");

// Enlace del menú desplegable de móvil: renglón ancho, fácil de tocar.
const mobileLinkClass = ({ isActive }) =>
    `block rounded-md px-3 py-3 font-medium ${FOCUS} ` +
    (isActive ? "bg-surface-alt text-primary" : "text-muted hover:bg-surface-alt hover:text-primary");

export const SiteHeader = () => {
    const [menuOpen, setMenuOpen] = useState(false);
    const { pathname } = useLocation();
    const menuId = useId();

    // Al cambiar de página, el menú de móvil se cierra solo.
    useEffect(() => {
        setMenuOpen(false);
    }, [pathname]);

    // Con el menú abierto, la tecla Escape lo cierra.
    useEffect(() => {
        if (!menuOpen) return;
        const onKeyDown = (event) => {
            if (event.key === "Escape") setMenuOpen(false);
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [menuOpen]);

    return (
        <header className="border-b border-line bg-surface">
            {/* Franja de la marca: decorativa, los lectores de pantalla la saltan. */}
            <div className="grid h-1 grid-cols-4" aria-hidden="true">
                <span className="bg-primary" />
                <span className="bg-accent" />
                <span className="bg-highlight" />
                <span className="bg-alert" />
            </div>

            <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 sm:px-6 lg:py-3">
                {/* Botón del menú: solo en móvil y tablet. */}
                <button
                    type="button"
                    className={`-ml-2 rounded-md p-2 text-primary lg:hidden ${FOCUS}`}
                    aria-expanded={menuOpen}
                    aria-controls={menuId}
                    aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
                    onClick={() => setMenuOpen((open) => !open)}
                >
                    {menuOpen ? <CloseIcon /> : <MenuIcon />}
                </button>

                {/* Logo y nombre: llevan a Inicio. El texto da el nombre al enlace,
                    por eso la imagen tiene alt vacío (si no, se leería dos veces). */}
                <Link to="/" className={`mr-auto flex items-center gap-3 rounded-md lg:mr-0 ${FOCUS}`}>
                    <img src={logo} alt="" width="234" height="240" className="h-10 w-auto lg:h-13" />
                    <span className="font-display text-lg uppercase tracking-wider text-primary lg:text-2xl">
                        Vocaciones MHPVM
                    </span>
                </Link>

                {/* Menú principal de escritorio, centrado. */}
                <nav aria-label="Principal" className="hidden flex-1 justify-center gap-10 lg:flex">
                    {MAIN_LINKS.map((link) => (
                        <NavLink
                            key={link.to}
                            to={link.to}
                            end={link.end}
                            className={activeIn(link, pathname, desktopLinkClass)}
                        >
                            {link.label}
                        </NavLink>
                    ))}
                </nav>

                <div className="flex items-center gap-6">
                    <NavLink
                        to="/cuenta"
                        className={({ isActive }) =>
                            `hidden items-center gap-2 font-medium lg:flex ${FOCUS} ` +
                            (isActive ? "text-primary" : "text-muted hover:text-primary")
                        }
                    >
                        <UserIcon />
                        Mi cuenta
                    </NavLink>

                    {/* El número de artículos se añade cuando exista el carrito (tarea 4.x). */}
                    <Link to="/carrito" aria-label="Carrito" className={`-mr-2 rounded-md p-2 text-primary ${FOCUS}`}>
                        <BagIcon />
                    </Link>
                </div>
            </div>

            {/* Menú desplegable de móvil. Solo existe en la página mientras está abierto. */}
            {menuOpen && (
                <nav id={menuId} aria-label="Menú" className="border-t border-line lg:hidden">
                    <ul className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3 sm:px-6">
                        {[...MAIN_LINKS, { to: "/cuenta", label: "Mi cuenta" }].map((link) => (
                            <li key={link.to}>
                                <NavLink to={link.to} end={link.end} className={activeIn(link, pathname, mobileLinkClass)}>
                                    {link.label}
                                </NavLink>
                            </li>
                        ))}
                    </ul>
                </nav>
            )}
        </header>
    );
};

// Iconos dibujados aquí mismo (SVG), sin librerías ni recursos de terceros.
// Toman el color del texto que los rodea (currentColor).
const iconProps = {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
};

const MenuIcon = () => (
    <svg {...iconProps}>
        <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
);

const CloseIcon = () => (
    <svg {...iconProps}>
        <path d="M6 6l12 12M18 6L6 18" />
    </svg>
);

const UserIcon = () => (
    <svg {...iconProps} width={20} height={20}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
);

const BagIcon = () => (
    <svg {...iconProps}>
        <path d="M6 8h12l-1 12H7L6 8z" />
        <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
);
