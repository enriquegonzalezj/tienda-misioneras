import { Outlet, ScrollRestoration } from "react-router-dom";
import { CartProvider } from "../cart/CartContext";
import { CampaignBanner } from "../components/CampaignBanner";
import { SiteHeader } from "../components/SiteHeader";
import { SiteFooter } from "../components/SiteFooter";

// Estructura común a todas las páginas: cabecera, contenido de la página
// (Outlet) y pie. flex-1 en el contenido empuja el pie al fondo de la
// pantalla aunque la página tenga poco contenido.
//
// ScrollRestoration (de React Router): al ir a otra página, vuelve arriba; al
// volver con Atrás o Adelante, devuelve la posición en la que estabas (por
// ejemplo, a media Tienda después de ver un producto).
//
// CartProvider (tarea 4.1): el carrito, compartido por la cabecera y las páginas.
//
// CampaignBanner (tarea 4.8): la franja de campañas vigentes, bajo la cabecera.
// Solo en la tienda: el panel usa AdminLayout.
export const Layout = () => {
    return (
        <CartProvider>
            <div className="flex min-h-screen flex-col">
                <SiteHeader />
                <CampaignBanner />
                <div className="flex-1">
                    <Outlet />
                </div>
                <SiteFooter />
            </div>
            <ScrollRestoration />
        </CartProvider>
    );
};
