// Carrito (tarea 4.1, ruta POST /api/cart de src/api/cart.py).
// Se manda solo qué variante y cuántas; el servidor responde nombres, fotos,
// precios, disponibilidad y subtotal calculados con la base de datos. El navegador
// nunca calcula precios: solo muestra los que llegan.
//
// Respuesta: { items, removed, subtotal, count }
//   items    líneas en el orden enviado: variant_id, quantity, name, slug,
//            values [{ option, value }], image ({ url, alt } o null), price,
//            sale_price (null hasta las campañas, 4.8), available y line_total
//            (null si está agotada)
//   removed  ids que ya no existen o no se pueden comprar (producto oculto,
//            archivado o variante desactivada)
//   subtotal suma de las líneas disponibles, como texto ("500.00")
//   count    artículos disponibles
import { apiRequest } from "./http";

export const priceCart = (items, { signal } = {}) =>
    apiRequest("/api/cart", {
        method: "POST",
        body: { items: items.map(({ variant_id, quantity }) => ({ variant_id, quantity })) },
        signal,
    });
