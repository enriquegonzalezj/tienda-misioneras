// Pedido de una invitada (tarea 4.2, ruta GET /api/orders/<token> de
// src/api/checkout.py). El token largo y aleatorio es la única llave del pedido:
// quien tiene el enlace lo ve. Nunca se pide un pedido por su número.
//
// Respuesta: { folio, status, expired, replaced, created_at, reserved_until,
//   payment_available (false si el servidor aún no puede cobrar),
//   items [{ name, variant_label, quantity, list_unit_price, unit_price, line_total }],
//   subtotal, discount_amount, shipping { method, cost, discount }, total,
//   contact { first_name, last_name, email, phone },
//   shipping_address { recipient_name, phone, street, exterior_number,
//     interior_number, neighborhood, postal_code, municipality, state, references } }
// Importes como texto ("665.00"). Un token que no existe responde 404.
//
// payOrder (tarea 4.6, src/api/order_payments.py): crea la preferencia de
// Mercado Pago del pedido y responde { init_point }, la página de pago a la que
// se lleva a la clienta. 409 si el pedido ya no está pendiente o le queda muy
// poco tiempo; 503 si el servidor no tiene credenciales; 502 si Mercado Pago
// no responde.
import { apiRequest } from "./http";

export const getOrder = (token, { signal } = {}) =>
    apiRequest(`/api/orders/${encodeURIComponent(token)}`, { signal });

export const payOrder = (token) =>
    apiRequest(`/api/orders/${encodeURIComponent(token)}/pay`, { method: "POST" });
