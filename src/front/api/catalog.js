// Peticiones a la API pública del catálogo (contrato en el CLAUDE.md, tarea 3.2).
// Siempre rutas relativas /api: en desarrollo las reenvía el proxy de Vite a Flask
// y en producción Flask sirve la página y la API en la misma dirección.

// Pide una ruta de la API y devuelve el JSON. Si el servidor responde con error,
// lanza una excepción para que la página muestre su aviso en vez de datos a medias.
const getJson = async (path, what, signal) => {
    const response = await fetch(path, { signal });
    if (!response.ok) throw new Error(`Error ${response.status} al cargar ${what}`);
    return response.json();
};

// Las categorías cambian poco y las piden varias partes de la página (el pie y
// la página de Inicio). Se guarda la petición en curso y su resultado para no
// pedirlas dos veces mientras la pestaña está abierta; al recargar se piden de nuevo.
let categoriesRequest = null;
let categoriesData = null;

export const getCategories = () => {
    if (!categoriesRequest) {
        categoriesRequest = getJson("/api/categories", "las categorías")
            .then((data) => {
                categoriesData = data;
                return data;
            })
            .catch((error) => {
                // Si falla, se olvida la petición para que el siguiente intento vuelva a probar.
                categoriesRequest = null;
                throw error;
            });
    }
    return categoriesRequest;
};

// Las categorías si ya llegaron, o null. Sirve para dibujar una página completa al
// instante (por ejemplo, la Tienda al volver con Atrás), sin esperar a la promesa.
export const peekCategories = () => categoriesData;

// Productos visibles, los más recientes primero. Todos los filtros son opcionales:
//   getProducts({ featured: true, limit: 4 })      destacados de Inicio
//   getProducts({ category: "ropa", offset: 12 })   una categoría, segunda página (3.3)
// No se guarda en memoria como las categorías: cada página pide lo suyo.
// `signal` (de un AbortController) cancela la petición si la página se cierra antes de que llegue.
export const getProducts = ({ category, featured, limit, offset } = {}, { signal } = {}) => {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (featured) params.set("featured", "true");
    if (limit !== undefined) params.set("limit", String(limit));
    if (offset !== undefined) params.set("offset", String(offset));
    const query = params.toString();
    return getJson(query ? `/api/products?${query}` : "/api/products", "los productos", signal);
};
