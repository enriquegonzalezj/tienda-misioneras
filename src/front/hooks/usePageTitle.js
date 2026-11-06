import { useEffect } from "react";

// Título de la pestaña al navegar dentro de React (tarea 3.5).
// Al entrar por una dirección, el título ya lo pone Flask (src/api/seo.py); al
// pasar de una página a otra con un enlace, Flask no interviene y lo cambia este
// hook. Los dos usan el mismo formato: si cambia uno, se cambia el otro.
//   usePageTitle("Libretas")  ->  "Libretas | Vocaciones MHPVM"
//   usePageTitle("")          ->  "Tienda Vocaciones MHPVM" (Inicio)
//   usePageTitle(undefined)   ->  no cambia nada (mientras llegan los datos)
const SITE_NAME = "Vocaciones MHPVM";
const STORE_NAME = "Tienda Vocaciones MHPVM";

export const usePageTitle = (name) => {
    useEffect(() => {
        if (name === undefined || name === null) return;
        document.title = name ? `${name} | ${SITE_NAME}` : STORE_NAME;
    }, [name]);
};
