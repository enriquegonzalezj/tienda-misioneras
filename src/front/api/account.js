// Cuenta de cliente (tarea 4.4, rutas de src/api/account.py). Todas exigen sesión
// de cliente: sin sesión responden 401 y con sesión de administración, 403.
//
// getAccount y las de guardar responden { user, address } (y `message` al guardar):
//   user     { email, first_name, last_name, phone }
//   address  { recipient_name, recipient_phone, street, exterior_number,
//              interior_number, neighborhood, postal_code, municipality, state,
//              references } o null. Sin quien recibe (null), la recibe la titular.
// Los errores de cada campo llegan en `errors` (400).
import { apiRequest } from "./http";

export const getAccount = (signal) => apiRequest("/api/account", { signal });

export const updateProfile = (fields) => apiRequest("/api/account/profile", { method: "PUT", body: fields });

export const updateAddress = (fields) => apiRequest("/api/account/address", { method: "PUT", body: fields });

export const deleteAddress = () => apiRequest("/api/account/address", { method: "DELETE" });

// Cambia la contraseña con la actual. Cierra las demás sesiones y deja esta abierta.
export const changePassword = (currentPassword, newPassword) =>
    apiRequest("/api/account/password", {
        method: "POST",
        body: { current_password: currentPassword, new_password: newPassword },
    });

// Historial de pedidos de la cuenta (tarea 4.7), del más reciente al más viejo,
// en tandas de 10: { total, items }. Cada pedido: { token, folio, status,
// expired, replaced, created_at, item_count, total }; el token es para el enlace
// a /pedido/<token>.
export const getAccountOrders = (offset = 0, signal) =>
    apiRequest(`/api/account/orders?offset=${offset}`, { signal });
