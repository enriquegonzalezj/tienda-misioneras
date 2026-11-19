// Último pedido pendiente creado en este navegador (tarea 4.2).
//
// Al volver a pagar se manda su token como previous_token y el servidor lo
// cancela ("Reemplazado por un pedido nuevo"), para no apartar dos veces las
// mismas unidades. Si ese pedido ya está pagado, vencido o cancelado, el
// servidor no lo toca. Aun así, cuando la página del pedido ve que se pagó
// (tarea 4.6), lo borra con clearPendingOrder: ya no hay nada que reemplazar.
//
// Solo se guarda el token, nunca datos de la persona. localStorage puede fallar
// (modo privado, almacenamiento lleno o bloqueado): todo va con try/catch y, si
// falla, simplemente no se manda.
const STORAGE_KEY = "mhpvm-pedido-pendiente";

// Lo que genera secrets.token_urlsafe(32): letras, números, "-" y "_". Hasta 64,
// el largo de la columna. Cualquier otra cosa se ignora.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export const readPendingOrder = () => {
    try {
        const token = window.localStorage.getItem(STORAGE_KEY);
        return token && TOKEN_PATTERN.test(token) ? token : null;
    } catch {
        return null;
    }
};

export const savePendingOrder = (token) => {
    if (!TOKEN_PATTERN.test(token ?? "")) return;
    try {
        window.localStorage.setItem(STORAGE_KEY, token);
    } catch {
        // Sin localStorage: el siguiente pedido no reemplazará a este.
    }
};

export const clearPendingOrder = () => {
    try {
        window.localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Sin localStorage no había nada guardado.
    }
};
