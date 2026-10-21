import { Outlet } from "react-router-dom";
import ScrollToTop from "../components/ScrollToTop";

// Estructura común a todas las páginas. Aquí irán la cabecera y el pie
// cuando se construyan según las maquetas aprobadas.
export const Layout = () => {
    return (
        <ScrollToTop>
            <Outlet />
        </ScrollToTop>
    );
};