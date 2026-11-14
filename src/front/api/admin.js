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

// Fotos (paso 8). Cada acción se guarda en el momento, aparte de "Guardar
// cambios". Las de producto responden { images, message }; las de categoría,
// el árbol completo { categories, message }, como el resto de Categorías.
// El archivo viaja en el campo "file" con un nombre fijo: el servidor no usa
// el nombre del archivo, así que tampoco se manda.
const fileForm = (file) => {
    const data = new FormData();
    data.append("file", file, "foto");
    return data;
};

export const uploadProductImage = (productId, file) =>
    apiRequest(`${PRODUCTS}/${productId}/images`, { method: "POST", body: fileForm(file) });

export const updateProductImage = (productId, imageId, altText) =>
    apiRequest(`${PRODUCTS}/${productId}/images/${imageId}`, { method: "PATCH", body: { alt_text: altText } });

// direction: "up" (antes) o "down" (después). La primera foto es la principal.
export const moveProductImage = (productId, imageId, direction) =>
    apiRequest(`${PRODUCTS}/${productId}/images/${imageId}/move`, { method: "POST", body: { direction } });

export const removeProductImage = (productId, imageId) =>
    apiRequest(`${PRODUCTS}/${productId}/images/${imageId}`, { method: "DELETE" });

// Imagen de la tarjeta en Inicio, solo en categorías principales.
export const uploadCategoryImage = (id, file) =>
    apiRequest(`${CATEGORIES}/${id}/image`, { method: "PUT", body: fileForm(file) });

export const removeCategoryImage = (id) => apiRequest(`${CATEGORIES}/${id}/image`, { method: "DELETE" });

// Paqueterías (tarea 4.5, /admin/envios). Cada cambio devuelve la lista completa
// ({ methods: [...] }) y, si aplica, un `message` para mostrar.
const SHIPPING = "/api/admin/shipping-methods";

export const getShippingMethods = (signal) => apiRequest(SHIPPING, { signal });

// fields: { name, price, delivery_time, is_active }
export const createShippingMethod = (fields) => apiRequest(SHIPPING, { method: "POST", body: fields });

export const updateShippingMethod = (id, fields) => apiRequest(`${SHIPPING}/${id}`, { method: "PUT", body: fields });

// direction: "up" o "down"
export const moveShippingMethod = (id, direction) =>
    apiRequest(`${SHIPPING}/${id}/move`, { method: "POST", body: { direction } });

export const deleteShippingMethod = (id) => apiRequest(`${SHIPPING}/${id}`, { method: "DELETE" });

// Campañas de descuento (tarea 4.8, /admin/campanas). La lista responde
// { campaigns, today }; la ficha, crear y editar responden { campaign, message }
// con sus productos y variantes. Pausar y reactivar van con updateCampaign
// (is_active), porque el Estado se guarda con "Guardar cambios".
const CAMPAIGNS = "/api/admin/campaigns";

export const getCampaigns = (signal) => apiRequest(CAMPAIGNS, { signal });

export const getCampaign = (id, signal) => apiRequest(`${CAMPAIGNS}/${id}`, { signal });

// fields: { name, start_date, end_date, audience, scope, discount_percent,
// shipping_discount_percent, is_active, products: [{ id, variants: [{ id, fixed_price }] }] }
export const createCampaign = (fields) => apiRequest(CAMPAIGNS, { method: "POST", body: fields });

export const updateCampaign = (id, fields) => apiRequest(`${CAMPAIGNS}/${id}`, { method: "PUT", body: fields });

// Solo si nunca se usó en un pedido; si se usó, responde 409 (se desactiva en su lugar).
export const deleteCampaign = (id) => apiRequest(`${CAMPAIGNS}/${id}`, { method: "DELETE" });

// Buscador del formulario: por nombre o SKU, hasta 20 productos con sus
// variantes activas. Responde { items }.
export const searchCampaignProducts = (q, signal) =>
    apiRequest(`${CAMPAIGNS}/products?${new URLSearchParams({ q })}`, { signal });

// Pedidos (tarea 5.5, /admin/pedidos). Lista: filtros opcionales
// { status, q, offset }; responde { total, limit, offset, counts, items }.
// La ficha y los cambios responden { order, message }.
const ORDERS = "/api/admin/orders";

export const getAdminOrders = (filters, signal) => {
    const query = new URLSearchParams(filters).toString();
    return apiRequest(query ? `${ORDERS}?${query}` : ORDERS, { signal });
};

export const getAdminOrder = (id, signal) => apiRequest(`${ORDERS}/${id}`, { signal });

// Un paso adelante o atrás. currentStatus: el estado que se veía en pantalla;
// si otra persona lo cambió, responde 409 (code "status_changed") sin tocar nada.
// trackingNumber solo cuenta al marcar como enviado.
export const setOrderStatus = (id, status, currentStatus, trackingNumber) =>
    apiRequest(`${ORDERS}/${id}/status`, {
        method: "POST",
        body: { status, current_status: currentStatus, tracking_number: trackingNumber },
    });

// Vacío quita la guía.
export const setOrderTracking = (id, trackingNumber) =>
    apiRequest(`${ORDERS}/${id}/tracking`, { method: "PUT", body: { tracking_number: trackingNumber } });
