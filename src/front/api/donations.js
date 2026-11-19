// Donativos (tarea 4.9, src/api/donations.py). Flujo aparte del carrito:
// monto libre, nombre completo y correo, sin envío ni campañas.
//
// getDonationOptions: { min_amount, max_amount, payment_available }.
// createDonation({ amount, donor_name, email, privacy_accepted }): 201 con
//   { access_token, folio }; 400 con errors por campo; 429 al pasar el límite.
// payDonation(token): crea la preferencia de Mercado Pago y responde
//   { init_point }; 409 si ya no está pendiente, 503 sin credenciales, 502 si
//   Mercado Pago no responde.
// getDonation(token): { folio, status, in_process, refunded, amount,
//   donor_name, created_at, paid_at, payment_available }. 404 si no existe.
// Importes como texto ("250.00"). El token es la única llave del donativo.
import { apiRequest } from "./http";

export const getDonationOptions = (signal) => apiRequest("/api/donations/options", { signal });

export const createDonation = (body) => apiRequest("/api/donations", { method: "POST", body });

export const payDonation = (token) =>
    apiRequest(`/api/donations/${encodeURIComponent(token)}/pay`, { method: "POST" });

export const getDonation = (token, { signal } = {}) =>
    apiRequest(`/api/donations/${encodeURIComponent(token)}`, { signal });
