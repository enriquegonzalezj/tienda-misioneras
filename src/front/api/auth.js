// Sesión (rutas /api/auth de las tareas 1.5 y 4.4). Las respuestas traen la cuenta
// como { id, email, first_name, last_name, phone, role }; role es "admin" o "customer".
import { apiRequest } from "./http";

export const login = async (email, password) => {
    const data = await apiRequest("/api/auth/login", { method: "POST", body: { email, password } });
    return data.user;
};

export const logout = () => apiRequest("/api/auth/logout", { method: "POST" });

// La cuenta con sesión iniciada, o null si no hay sesión (o ya caducó).
// Recibe el `signal` de useRequest para cancelarse al salir de la página.
export const getSession = async (signal) => {
    try {
        const data = await apiRequest("/api/auth/me", { signal });
        return data.user;
    } catch (error) {
        if (error.status === 401) return null;
        throw error;
    }
};

// Crear cuenta (tarea 4.4). `fields`: first_name, last_name, email, phone
// (opcional), password y privacy_accepted. Deja la sesión iniciada.
export const register = async (fields) => {
    const data = await apiRequest("/api/auth/register", { method: "POST", body: fields });
    return data.user;
};

// Pedir el enlace para crear una contraseña nueva. Siempre responde el mismo
// mensaje, exista o no la cuenta.
export const forgotPassword = async (email) => {
    const data = await apiRequest("/api/auth/forgot-password", { method: "POST", body: { email } });
    return data.message;
};

// Crear la contraseña nueva con el token del enlace. No inicia sesión.
export const resetPassword = async (token, password) => {
    const data = await apiRequest("/api/auth/reset-password", { method: "POST", body: { token, password } });
    return data.message;
};

// Crear la cuenta desde el pedido (/pedido/<token>, tarea 4.4). Nombre, correo,
// teléfono y dirección los toma el servidor del pedido: aquí solo viajan el
// token, la contraseña y el aviso de privacidad. Enlaza ese pedido y deja la
// sesión iniciada. 409 si el pedido ya está en una cuenta o el correo ya tiene una.
export const registerFromOrder = async (token, password, privacyAccepted) => {
    const data = await apiRequest("/api/auth/register-from-order", {
        method: "POST",
        body: { token, password, privacy_accepted: privacyAccepted },
    });
    return data.user;
};
