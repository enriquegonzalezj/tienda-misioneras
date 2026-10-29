import { Outlet, ScrollRestoration } from "react-router-dom";
import { SiteHeader } from "../components/SiteHeader";
import { SiteFooter } from "../components/SiteFooter";

// Estructura común a todas las páginas: cabecera, contenido de la página
// (Outlet) y pie. flex-1 en el contenido empuja el pie al fondo de la
// pantalla aunque la página tenga poco contenido.
//
// ScrollRestoration (de React Router): al ir a otra página, vuelve arriba; al
// volver con Atrás o Adelante, devuelve la posición en la que estabas (por
// ejemplo, a media Tienda después de ver un producto).
export const Layout = () => {
    return (
        <>
            <div className="flex min-h-screen flex-col">
                <SiteHeader />
                <div className="flex-1">
                    <Outlet />
                </div>
                <SiteFooter />
            </div>
            <ScrollRestoration />
        </>
    );
};
