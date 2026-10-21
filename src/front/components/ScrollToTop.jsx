import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// Al cambiar de página, vuelve arriba. Sin esto, si bajas en el catálogo
// y abres un producto, la ficha se abre a media altura.
const ScrollToTop = ({ children }) => {
    const { pathname } = useLocation();

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [pathname]);

    return children;
};

export default ScrollToTop;