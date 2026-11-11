// Pago como invitada (tarea 4.2, rutas de src/api/checkout.py).
//
// getCheckoutOptions: { shipping_methods [{ id, name, delivery_time, price }],
//   states [los 32 estados], reservation_minutes }
//
// createOrder(body) crea el pedido pendiente y aparta las unidades. `body` va
// plano: items, datos de contacto y dirección, shipping_method_id,
// privacy_accepted, expected_total (el total que se mostró, como texto) y
// previous_token (opcional: el pedido pendiente anterior, que se cancela).
//   201  { access_token, folio, reserved_until }
//   400  errores por campo en `errors`
//   409  `code` en data: unavailable (+ removed), insufficient (+ insufficient),
//        shipping_unavailable (+ shipping_methods), total_changed (+ total)
//   429  demasiados pedidos seguidos (retryAfter en segundos)
import { apiRequest } from "./http";

export const getCheckoutOptions = ({ signal } = {}) => apiRequest("/api/checkout/options", { signal });

export const createOrder = (body) => apiRequest("/api/checkout", { method: "POST", body });
