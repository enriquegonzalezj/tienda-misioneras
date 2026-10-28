// Peticiones a la API pública del catálogo (contrato en el CLAUDE.md, tarea 3.2).
// Siempre rutas relativas /api: en desarrollo las reenvía el proxy de Vite a Flask
// y en producción Flask sirve la página y la API en la misma dirección.

// Las categorías cambian poco y las piden varias partes de la página (el pie y
// la página de Inicio). Se guarda la petición en curso y su resultado para no
// pedirlas dos veces mientras la pestaña está abierta; al recargar se piden de nuevo.
let categoriesRequest = null;

export const getCategories = () => {
    if (!categoriesRequest) {
        categoriesRequest = fetch("/api/categories")
            .then((response) => {
                if (!response.ok) throw new Error(`Error ${response.status} al cargar las categorías`);
                return response.json();
            })
            .catch((error) => {
                // Si falla, se olvida la petición para que el siguiente intento vuelva a probar.
                categoriesRequest = null;
                throw error;
            });
    }
    return categoriesRequest;
};
