import { Link, NavLink } from "react-router-dom";

// Menú del panel, escrito una sola vez: lo usan el menú lateral de escritorio
// y el desplegable de móvil (los dos en AdminLayout). Va sobre fondo azul
// (bg-primary), por eso el texto es blanco (text-surface).
//
// Cada tarea del panel añade aquí su sección (Categorías en el paso 4; más
// adelante Pedidos, Donativos y Campañas).
const SECTIONS = [{ to: "/admin", label: "Inventario", end: true, Icon: BoxIcon }];

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-surface";

const ITEM = `flex items-center gap-3 rounded-lg px-3.5 py-2.5 font-medium ${FOCUS}`;

const sectionClass = ({ isActive }) =>
    `${ITEM} ` + (isActive ? "bg-surface/15 font-bold text-surface" : "text-surface hover:bg-surface/10");

export const AdminNav = ({ user, onLogout, loggingOut }) => (
    <div className="flex flex-1 flex-col">
        <nav aria-label="Panel" className="flex flex-col gap-1 p-3">
            {SECTIONS.map(({ to, label, end, Icon }) => (
                <NavLink key={to} to={to} end={end} className={sectionClass}>
                    <Icon />
                    {label}
                </NavLink>
            ))}
        </nav>

        <div className="mt-auto flex flex-col gap-1 border-t border-surface/15 p-3">
            <Link to="/" className={`${ITEM} text-surface hover:bg-surface/10`}>
                <StoreIcon />
                Ver la tienda
            </Link>
            <p className="px-3.5 pt-2 text-sm text-surface/85">Sesión de</p>
            <p className="break-all px-3.5 pb-2 text-sm font-semibold text-surface">{user.email}</p>
            <button
                type="button"
                onClick={onLogout}
                disabled={loggingOut}
                className={`${ITEM} text-left text-surface hover:bg-surface/10 disabled:opacity-60`}
            >
                <LogoutIcon />
                {loggingOut ? "Cerrando sesión…" : "Cerrar sesión"}
            </button>
        </div>
    </div>
);

// Iconos dibujados aquí mismo (SVG), sin librerías ni recursos de terceros.
const iconProps = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
};

function BoxIcon() {
    return (
        <svg {...iconProps}>
            <path d="M3 7.5l9-4.5 9 4.5-9 4.5z" />
            <path d="M3 7.5V17l9 4.5 9-4.5V7.5" />
            <path d="M12 12v9.5" />
        </svg>
    );
}

function StoreIcon() {
    return (
        <svg {...iconProps}>
            <path d="M14 4h6v6" />
            <path d="M20 4l-9 9" />
            <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
        </svg>
    );
}

function LogoutIcon() {
    return (
        <svg {...iconProps}>
            <path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" />
            <path d="M10 17l-5-5 5-5" />
            <path d="M5 12h11" />
        </svg>
    );
}
