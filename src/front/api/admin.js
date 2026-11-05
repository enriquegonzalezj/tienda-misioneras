// Peticiones del panel de administración (rutas /api/admin del servidor).
// Todas pasan por apiRequest, que manda la cookie de sesión y la cabecera CSRF.
// Si la sesión caducó, el servidor responde 401 y la pantalla vuelve a Entrar.
//
// Categorías (tarea 2.1, paso 4a). Cada cambio devuelve el árbol completo
// ({ categories: [...] }) y, si aplica, un `message` para mostrar.
import { apiRequest } from "./http";

const CATEGORIES = "/api/admin/categories";

export const getAdminCategories = (signal) => apiRequest(CATEGORIES, { signal });

// fields: { name, slug, parent_id, card_text, seo_description }
export const createCategory = (fields) => apiRequest(CATEGORIES, { method: "POST", body: fields });

export const updateCategory = (id, fields) => apiRequest(`${CATEGORIES}/${id}`, { method: "PUT", body: fields });

// direction: "up" o "down"
export const moveCategory = (id, direction) =>
    apiRequest(`${CATEGORIES}/${id}/move`, { method: "POST", body: { direction } });

export const deleteCategory = (id) => apiRequest(`${CATEGORIES}/${id}`, { method: "DELETE" });

// Productos (tarea 2.1, paso 5). Lista del Inventario: filtros opcionales
// { q, category, status, sold_out, offset }; responde { total, limit, offset, counts, items }.
const PRODUCTS = "/api/admin/products";

export const getAdminProducts = (filters, signal) => {
    const query = new URLSearchParams(filters).toString();
    return apiRequest(query ? `${PRODUCTS}?${query}` : PRODUCTS, { signal });
};

// Precio y existencias desde el Inventario. Cada variante manda solo lo que
// cambió y, en `previous`, lo que se veía en pantalla:
//   [{ id: 43, stock: 8, previous: { stock: 5 } }]
// Si algo cambió mientras tanto, responde 409 con `conflicts` y no guarda nada.
export const updateVariants = (variants) =>
    apiRequest("/api/admin/variants", { method: "PATCH", body: { variants } });

// Formulario de producto (paso 7). Ficha completa, con costo y ventas:
// { id, name, slug, ..., options, variants, has_sales, units_sold, status, archived_at }.
export const getAdminProduct = (id, signal) => apiRequest(`${PRODUCTS}/${id}`, { signal });

// El formulario entero en una sola petición (datos, estado, categoría, opciones
// y variantes): se guarda todo o nada. Responden { product, message }.
export const createProduct = (fields) => apiRequest(PRODUCTS, { method: "POST", body: fields });

export const updateProduct = (id, fields) => apiRequest(`${PRODUCTS}/${id}`, { method: "PUT", body: fields });

// Solo si nunca se vendió; con ventas responde 409 (se archiva en su lugar).
export const deleteProduct = (id) => apiRequest(`${PRODUCTS}/${id}`, { method: "DELETE" });

// Archivar lo oculta y lo saca de la vista normal del Inventario; desarchivar
// lo devuelve como oculto. Responden { product, message }.
export const archiveProduct = (id) => apiRequest(`${PRODUCTS}/${id}/archive`, { method: "POST" });

export const unarchiveProduct = (id) => apiRequest(`${PRODUCTS}/${id}/unarchive`, { method: "POST" });
