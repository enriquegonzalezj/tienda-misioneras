// Texto de un error de la API para mostrarlo en pantalla. Con 429 (demasiados
// intentos) añade cuánto falta, a partir de la cabecera Retry-After.
// Lo usan Entrar del panel y las pantallas de la cuenta (tarea 4.4).
export const apiErrorText = (error) => {
    if (error.status === 429 && error.retryAfter) {
        const minutes = Math.ceil(error.retryAfter / 60);
        return `${error.message} Podrás intentarlo de nuevo en ${minutes} ${minutes === 1 ? "minuto" : "minutos"}.`;
    }
    return error.message;
};
