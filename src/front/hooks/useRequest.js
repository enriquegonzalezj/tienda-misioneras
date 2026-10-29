import { useEffect, useState } from "react";

// Pide datos al abrir una página o sección y dice en qué punto está:
// "loading" (esperando), "ready" (llegaron, en `data`) o "error" (falló).
//
//   const loadFeatured = (signal) => getProducts({ featured: true, limit: 4 }, { signal });
//   const { status, data } = useRequest(loadFeatured);
//
// `request` recibe un `signal` de AbortController y devuelve una promesa. Tiene que
// ser siempre la misma función (definida fuera del componente, o con useCallback si
// depende de algo, por ejemplo la categoría): si cambia, se vuelven a pedir los datos.
// Al salir de la página (o en el doble montaje de StrictMode en desarrollo) se
// cancela la petición y se ignora su respuesta, para no actualizar algo que ya no está.
export const useRequest = (request) => {
    const [state, setState] = useState({ status: "loading", data: null });

    useEffect(() => {
        const controller = new AbortController();
        setState({ status: "loading", data: null });
        request(controller.signal)
            .then((data) => {
                if (!controller.signal.aborted) setState({ status: "ready", data });
            })
            .catch(() => {
                if (!controller.signal.aborted) setState({ status: "error", data: null });
            });
        return () => controller.abort();
    }, [request]);

    return state;
};
