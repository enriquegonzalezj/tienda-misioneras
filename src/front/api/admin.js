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
