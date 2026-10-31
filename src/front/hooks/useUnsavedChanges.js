import { useCallback, useEffect } from "react";
import { useBlocker } from "react-router-dom";

// Avisa antes de perder cambios sin guardar en un formulario del panel
// (Categorías y, en el paso 7, Producto). Cubre tres casos:
//   1. Ir a otra dirección dentro de la app (menú, "Ver la tienda", Atrás, o
//      cambiar los filtros del Inventario, que van en la dirección como
//      ?q=...): useBlocker de React Router detiene la navegación y se pregunta.
//   2. Cerrar o recargar la pestaña: el aviso propio del navegador
//      (beforeunload; el texto lo pone el navegador, no se puede cambiar).
//   3. Cambios dentro de la misma pantalla (por ejemplo, elegir otra categoría
//      de la lista): la pantalla llama a la función que devuelve este hook.
//
//   const confirmDiscard = useUnsavedChanges(isDirty);
//   const select = (id) => { if (confirmDiscard()) setSelectedId(id); };
//
// No se pregunta al ir a /admin/entrar: es "Cerrar sesión" (lo pidió quien
// usa el panel) o la sesión caducada (los cambios ya no se pueden guardar).

const QUESTION = "Tienes cambios sin guardar. Si sigues, se perderán. ¿Quieres salir sin guardar?";

export const useUnsavedChanges = (isDirty) => {
    const shouldBlock = useCallback(
        ({ currentLocation, nextLocation }) =>
            isDirty &&
            (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search) &&
            nextLocation.pathname !== "/admin/entrar",
        [isDirty]
    );
    const blocker = useBlocker(shouldBlock);

    // Caso 1: la navegación quedó detenida; se pregunta y se continúa o se cancela.
    useEffect(() => {
        if (blocker.state !== "blocked") return;
        if (window.confirm(QUESTION)) blocker.proceed();
        else blocker.reset();
    }, [blocker]);

    // Caso 2: solo mientras hay cambios, para no molestar al cerrar sin ellos.
    useEffect(() => {
        if (!isDirty) return undefined;
        const onBeforeUnload = (event) => {
            event.preventDefault();
            event.returnValue = "";
        };
        window.addEventListener("beforeunload", onBeforeUnload);
        return () => window.removeEventListener("beforeunload", onBeforeUnload);
    }, [isDirty]);

    // Caso 3: true si se puede seguir (no hay cambios, o se aceptó perderlos).
    return useCallback(() => !isDirty || window.confirm(QUESTION), [isDirty]);
};
