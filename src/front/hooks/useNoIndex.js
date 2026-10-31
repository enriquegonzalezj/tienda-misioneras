import { useEffect } from "react";

// Pide a Google que no muestre la página en sus resultados (panel, y más
// adelante carrito, pago y cuenta) mientras la página está abierta.
// Es provisional: en la tarea 3.5 Flask manda además la cabecera X-Robots-Tag,
// que funciona aunque el buscador no ejecute JavaScript.
export const useNoIndex = () => {
    useEffect(() => {
        const meta = document.createElement("meta");
        meta.name = "robots";
        meta.content = "noindex";
        document.head.appendChild(meta);
        return () => meta.remove();
    }, []);
};
