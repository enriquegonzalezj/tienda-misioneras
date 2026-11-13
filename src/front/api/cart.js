// Carrito (tarea 4.1, ruta POST /api/cart de src/api/cart.py).
// Se manda solo qué variante y cuántas; el servidor responde nombres, fotos,
// precios, disponibilidad y subtotal calculados con la base de datos. El navegador
// nunca calcula precios: solo muestra los que llegan.
//
// La página de pago (/pago, tarea 4.2) manda además la paquetería elegida
// (shippingMethodId) y recibe el envío y el total ya sumados por el servidor.
//
// Respuesta: { items, removed, subtotal, discount, items_total, shipping,
//              shipping_unavailable, total, count }
//   items    líneas en el orden enviado: variant_id, quantity, name, slug,
//            values [{ option, value }], image ({ url, alt } o null), price,
//            sale_price (precio con campaña, 4.8, o null sin rebaja), available,
//            line_total (lo que se cobra) y list_line_total (a precio normal);
//            los dos en null si está agotada
//   removed  ids que ya no existen o no se pueden comprar (producto oculto,
//            archivado o variante desactivada)
//   subtotal    suma de las líneas disponibles a precio normal ("500.00")
//   discount    lo que rebajan las campañas ("0.00" sin campañas)
//   items_total subtotal - discount
//   shipping { id, name, price, discount } de la paquetería elegida, o null
//   shipping_unavailable  true si la paquetería elegida ya no está activa
//   total    items_total + envío - descuento del envío, o null sin paquetería válida
//   count    artículos disponibles
import { apiRequest } from "./http";

export const priceCart = (items, { signal, shippingMethodId = null } = {}) => {
    const body = { items: items.map(({ variant_id, quantity }) => ({ variant_id, quantity })) };
    if (shippingMethodId !== null) body.shipping_method_id = shippingMethodId;
    return apiRequest("/api/cart", { method: "POST", body, signal });
};
