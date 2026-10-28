import { Outlet } from "react-router-dom";
import ScrollToTop from "../components/ScrollToTop";
import { SiteHeader } from "../components/SiteHeader";
import { SiteFooter } from "../components/SiteFooter";

// Estructura común a todas las páginas: cabecera, contenido de la página
// (Outlet) y pie. flex-1 en el contenido empuja el pie al fondo de la
// pantalla aunque la página tenga poco contenido.
export const Layout = () => {
    return (
        <ScrollToTop>
            <div className="flex min-h-screen flex-col">
                <SiteHeader />
                <div className="flex-1">
                    <Outlet />
                </div>
                <SiteFooter />
            </div>
        </ScrollToTop>
    );
};
