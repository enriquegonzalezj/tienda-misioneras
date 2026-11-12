// A dónde ir después de entrar o de crear la cuenta (tarea 4.4).
//
// La dirección llega en la URL (/cuenta/entrar?siguiente=/pago), y cualquiera
// puede armar un enlace con otra. Si se pasara tal cual a <Link> o a
// useNavigate, un enlace con "//otra-web.com" o con "javascript:" llevaría
// fuera de la tienda después de entrar (redirección abierta, anotada en el
// estado para React Router 6). Por eso solo se aceptan estas direcciones
// internas, escritas aquí; cualquier otra cosa lleva a /cuenta.
const ALLOWED = [/^\/pago$/, /^\/carrito$/, /^\/cuenta$/, /^\/pedido\/[A-Za-z0-9_-]{1,64}$/];

export const DEFAULT_AFTER_LOGIN = "/cuenta";

export const safeRedirect = (value) =>
    typeof value === "string" && ALLOWED.some((pattern) => pattern.test(value)) ? value : DEFAULT_AFTER_LOGIN;

// "?siguiente=/pago" para pasar la dirección de una pantalla de la cuenta a
// otra (de Entrar a Crear cuenta y al revés). Vacío si es la de siempre.
export const nextQuery = (next) =>
    next && next !== DEFAULT_AFTER_LOGIN ? `?siguiente=${encodeURIComponent(next)}` : "";
