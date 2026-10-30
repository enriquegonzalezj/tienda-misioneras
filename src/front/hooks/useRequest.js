import { useEffect, useState } from "react";

// Pide datos al abrir una página o sección y dice en qué punto está:
// "loading" (esperando), "ready" (llegaron, en `data`) o "error" (falló; el motivo
// queda en `error`, por ejemplo error.status === 404 si no existe).
//
//   const loadFeatured = (signal) => getProducts({ featured: true, limit: 4 }, { signal });
//   const { status, data } = useRequest(loadFeatured);
//
// `request` recibe un `signal` de AbortController y devuelve una promesa. Tiene que
// ser siempre la misma función (definida fuera del componente, o con useCallback si
// depende de algo, por ejemplo la categoría): si cambia, se vuelven a pedir los datos.
// Al salir de la página (o en el doble montaje de StrictMode en desarrollo) se
// cancela la petición y se ignora su respuesta, para no actualizar algo que ya no está.
//
// `initialData` (opcional): datos que ya se tienen al abrir la página. Si llegan, se
// usan tal cual desde el primer dibujo y no se piden de nuevo.
//   const { status, data } = useRequest(loadCategories, peekCategories());
export const useRequest = (request, initialData = null) => {
    // Solo cuenta el valor del primer dibujo (useState lo guarda y no lo vuelve a leer).
    const [initial] = useState(initialData);
    const [state, setState] = useState(() =>
        initial !== null ? { status: "ready", data: initial } : { status: "loading", data: null }
    );

    useEffect(() => {
        if (initial !== null) return undefined;
        const controller = new AbortController();
        setState({ status: "loading", data: null });
        request(controller.signal)
            .then((data) => {
                if (!controller.signal.aborted) setState({ status: "ready", data });
            })
            .catch((error) => {
                if (!controller.signal.aborted) setState({ status: "error", data: null, error });
            });
        return () => controller.abort();
    }, [request, initial]);

    return state;
};
