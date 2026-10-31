// Peticiones a la API que usan la sesión (panel de administración y, más
// adelante, cuenta y carrito). El catálogo público tiene las suyas en catalog.js.
//
//   const data = await apiRequest("/api/auth/login", { method: "POST", body: { email, password } });
//
// Siempre rutas relativas /api (ver CLAUDE.md): la cookie de sesión viaja sola
// porque la página y la API están en la misma dirección.

// Métodos que cambian datos: el servidor exige la cabecera X-CSRF-TOKEN (tarea 1.5).
const CHANGES_DATA = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Lee una cookie que el navegador sí deja leer. La de sesión es httpOnly y no se
// puede leer desde JavaScript (así un script malicioso no la roba); la de CSRF
// está hecha para leerse y copiarse en la cabecera.
const readCookie = (name) => {
    const prefix = `${name}=`;
    const found = document.cookie.split("; ").find((cookie) => cookie.startsWith(prefix));
    return found ? decodeURIComponent(found.slice(prefix.length)) : null;
};

// Error de la API con lo que la pantalla necesita para explicarlo:
//   status      código HTTP (0 si no hubo conexión)
//   message     texto en español que manda el servidor
//   errors      errores por campo ({ email: "..." }), si los hay
//   retryAfter  segundos que faltan para reintentar tras demasiados intentos (429)
//   data        la respuesta completa, por si trae algo más (por ejemplo, los
//               `conflicts` del Inventario cuando algo cambió mientras se editaba)
export class ApiError extends Error {
    constructor(message, { status, errors = {}, retryAfter = null, data = null }) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.errors = errors;
        this.retryAfter = retryAfter;
        this.data = data;
    }
}

export const apiRequest = async (path, { method = "GET", body, signal } = {}) => {
    const headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (CHANGES_DATA.has(method)) {
        const csrfToken = readCookie("csrf_access_token");
        if (csrfToken) headers["X-CSRF-TOKEN"] = csrfToken;
    }

    let response;
    try {
        response = await fetch(path, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
            signal,
            credentials: "same-origin",
        });
    } catch (error) {
        // Una petición cancelada (al salir de la página) no es un error que mostrar.
        if (error.name === "AbortError") throw error;
        throw new ApiError("No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.", {
            status: 0,
        });
    }

    // Algunas respuestas de error pueden no traer JSON (por ejemplo, un fallo del proxy).
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        const retryAfter = Number(response.headers.get("Retry-After"));
        throw new ApiError(data?.message ?? "Algo salió mal. Inténtalo de nuevo.", {
            status: response.status,
            errors: data?.errors ?? {},
            retryAfter: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
            data,
        });
    }
    return data;
};
