// Muestra un importe en pesos mexicanos: "250.00" -> "$250.00", "1250" -> "$1,250.00".
//
// Solo da formato para la pantalla. Precios, descuentos, envío y totales los
// calcula siempre el servidor; el frontend nunca hace cuentas con dinero.
//
// La API manda los importes como texto ("15.00") para no perder centavos.
// Intl.NumberFormat es del propio navegador: pone el signo, las comas de miles
// y los dos decimales según la costumbre de México, sin armar el texto a mano.

const PESOS = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export const formatPrice = (amount) => {
    if (amount === null || amount === undefined || amount === "") return "";
    const value = Number(amount);
    // Si llega algo que no es un número, mejor no mostrar nada que mostrar "$NaN".
    if (!Number.isFinite(value)) return "";
    return PESOS.format(value);
};
