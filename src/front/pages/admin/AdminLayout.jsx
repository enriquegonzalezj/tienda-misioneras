import { useEffect, useId, useState } from "react";
import { Link, Navigate, Outlet, ScrollRestoration, useLocation, useNavigate } from "react-router-dom";
import { getSession, logout } from "../../api/auth";
import { AdminNav } from "../../components/admin/AdminNav";
import { BrandStripe } from "../../components/BrandStripe";
import { Button } from "../../components/Button";
import { useNoIndex } from "../../hooks/useNoIndex";
import { useRequest } from "../../hooks/useRequest";
import logoWhite from "../../assets/logo-blanco.webp";

// Marco de todas las pantallas del panel (/admin/...). No lleva la cabecera ni
// el pie de la tienda.
//
// Al abrir, pregunta al servidor quién tiene la sesión:
//   - sin sesión: manda a /admin/entrar;
//   - cuenta de cliente: aviso de que no tiene acceso, con "Cerrar sesión";
//   - cuenta de administración: el panel.
// Esto solo decide qué se dibuja. La protección real está en el servidor: cada
// ruta /api/admin lleva @admin_required, así que sin esa sesión no sale ningún dato.
//
// Escritorio (lg, 1024 px o más): menú lateral azul fijo a la izquierda.
// Móvil y tablet: barra azul arriba con un menú desplegable.

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-surface";

// Logo y nombre, en el menú lateral y en la barra de móvil.
const Brand = ({ compact = false }) => (
    <Link to="/admin" className={`flex items-center gap-3 rounded-md text-surface ${FOCUS}`}>
        <img src={logoWhite} alt="" width="235" height="240" className={compact ? "h-8 w-auto" : "h-11 w-auto"} />
        <span className="leading-tight">
            <span className={`block font-display uppercase tracking-wider ${compact ? "text-base" : "text-lg"}`}>
                Vocaciones MHPVM
            </span>
            <span className="block text-xs text-surface/85">Panel de administración</span>
        </span>
    </Link>
);

export const AdminLayout = () => {
    useNoIndex();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const menuId = useId();
    const [menuOpen, setMenuOpen] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);
    const session = useRequest(getSession);

    // Al cambiar de pantalla, el menú de móvil se cierra solo.
    useEffect(() => {
        setMenuOpen(false);
    }, [pathname]);

    // Con el menú de móvil abierto, Escape lo cierra.
    useEffect(() => {
        if (!menuOpen) return undefined;
        const onKeyDown = (event) => {
            if (event.key === "Escape") setMenuOpen(false);
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [menuOpen]);

    // Si el servidor no responde al cerrar sesión, se manda igual a Entrar: la
    // sesión caduca sola en 1 h sin uso.
    const handleLogout = async () => {
        setLoggingOut(true);
        try {
            await logout();
        } catch {
            // Sin acción: se sale igual.
        }
        navigate("/admin/entrar", { replace: true });
    };

    if (session.status === "loading") {
        return (
            <p role="status" className="flex min-h-screen items-center justify-center bg-surface-alt text-muted">
                Cargando el panel…
            </p>
        );
    }

    if (session.status === "error") {
        return (
            <CenteredMessage title="No pudimos abrir el panel">
                <p className="mt-3 text-muted">{session.error?.message} Recarga la página para intentarlo de nuevo.</p>
            </CenteredMessage>
        );
    }

    const user = session.data;
    if (!user) return <Navigate to="/admin/entrar" replace />;

    if (user.role !== "admin") {
        return (
            <CenteredMessage title="Sin acceso al panel">
                <p className="mt-3 text-muted">
                    La cuenta {user.email} no tiene acceso al panel de administración.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                    <Button onClick={handleLogout} disabled={loggingOut}>
                        {loggingOut ? "Cerrando sesión…" : "Cerrar sesión"}
                    </Button>
                    <Button to="/" variant="outline">
                        Ir a la tienda
                    </Button>
                </div>
            </CenteredMessage>
        );
    }

    return (
        <>
            <div className="min-h-screen bg-surface-alt lg:flex">
                {/* Escritorio: menú lateral. Se queda fijo al bajar por la página. */}
                <aside className="hidden bg-primary lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col lg:overflow-y-auto">
                    <BrandStripe />
                    <div className="border-b border-surface/15 px-5 py-6">
                        <Brand />
                    </div>
                    <AdminNav user={user} onLogout={handleLogout} loggingOut={loggingOut} />
                </aside>

                {/* Móvil y tablet: barra arriba con menú desplegable. */}
                <header className="bg-primary lg:hidden">
                    <BrandStripe />
                    <div className="flex items-center gap-2 px-2 py-2">
                        <button
                            type="button"
                            className={`rounded-md p-2.5 text-surface ${FOCUS}`}
                            aria-expanded={menuOpen}
                            aria-controls={menuId}
                            aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
                            onClick={() => setMenuOpen((open) => !open)}
                        >
                            {menuOpen ? <CloseIcon /> : <MenuIcon />}
                        </button>
                        <Brand compact />
                    </div>
                    {menuOpen && (
                        <div id={menuId} className="flex border-t border-surface/15">
                            <AdminNav user={user} onLogout={handleLogout} loggingOut={loggingOut} />
                        </div>
                    )}
                </header>

                <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
                    <Outlet context={{ user }} />
                </main>
            </div>
            <ScrollRestoration />
        </>
    );
};

// Pantalla con un solo aviso centrado (sin acceso o error al abrir).
const CenteredMessage = ({ title, children }) => (
    <div className="flex min-h-screen flex-col bg-surface-alt">
        <BrandStripe />
        <main className="flex flex-1 items-center justify-center px-4 py-12">
            <div className="w-full max-w-md rounded-2xl border border-line bg-surface px-6 py-10 text-center sm:px-9">
                <h1 className="text-2xl font-semibold uppercase tracking-wide">{title}</h1>
                {children}
            </div>
        </main>
    </div>
);

const iconProps = {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
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

// Dirección dentro de /admin que no existe: el aviso va dentro del panel.
export const AdminNotFound = () => (
    <>
        <h1 className="text-3xl font-semibold uppercase lg:text-4xl">Página no encontrada</h1>
        <p className="mt-2 text-muted">Esta sección del panel no existe.</p>
        <Button to="/admin" className="mt-6">
            Ir al inventario
        </Button>
    </>
);
