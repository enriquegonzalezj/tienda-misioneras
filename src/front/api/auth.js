// Sesión (rutas /api/auth de la tarea 1.5). Las respuestas traen la cuenta como
// { id, email, first_name, last_name, phone, role }; role es "admin" o "customer".
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
