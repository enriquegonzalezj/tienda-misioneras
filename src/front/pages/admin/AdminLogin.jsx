import { useId, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { getSession, login } from "../../api/auth";
import { BrandStripe } from "../../components/BrandStripe";
import { Button } from "../../components/Button";
import { useNoIndex } from "../../hooks/useNoIndex";
import { useRequest } from "../../hooks/useRequest";
import logo from "../../assets/logo.webp";

// Entrar al panel (/admin/entrar). Usa POST /api/auth/login de la tarea 1.5.
//
// Después de entrar siempre se va a /admin, nunca a una dirección que llegue en
// la URL (?volver=...): así nadie puede armar un enlace que, tras entrar, lleve
// a otra página (la "redirección abierta" de React Router 6 anotada en el estado).
// Si la cuenta es de cliente, el panel le dice que no tiene acceso.
//
// "¿Olvidaste tu contraseña?" se añade cuando exista la página de recuperación
// (pantallas de cuenta, tarea 4.4); la ruta del servidor ya existe.

const FIELD =
    "h-12 w-full rounded-lg border border-field bg-surface px-3.5 text-base text-primary " +
    "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary";

const FOCUS = "rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

// "Demasiados intentos" + cuánto falta, a partir de la cabecera Retry-After.
const errorText = (error) => {
    if (error.status === 429 && error.retryAfter) {
        const minutes = Math.ceil(error.retryAfter / 60);
        return `${error.message} Podrás intentarlo de nuevo en ${minutes} ${minutes === 1 ? "minuto" : "minutos"}.`;
    }
    return error.message;
};

export const AdminLogin = () => {
    useNoIndex();
    const navigate = useNavigate();
    const ids = useId();
    const session = useRequest(getSession);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState("");

    // Ya hay una sesión de administración: directo al panel.
    if (session.status === "ready" && session.data?.role === "admin") {
        return <Navigate to="/admin" replace />;
    }

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!email.trim() || !password) {
            setError("Escribe tu correo y tu contraseña.");
            return;
        }
        setSending(true);
        setError("");
        try {
            await login(email.trim(), password);
            navigate("/admin", { replace: true });
        } catch (loginError) {
            setError(errorText(loginError));
            setSending(false);
        }
    };

    return (
        <div className="flex min-h-screen flex-col bg-surface-alt">
            <BrandStripe />
            <main className="flex flex-1 items-center justify-center px-4 py-12">
                <div className="w-full max-w-md rounded-2xl border border-line bg-surface px-6 py-10 sm:px-9">
                    <div className="flex flex-col items-center gap-3.5 text-center">
                        <img src={logo} alt="" width="234" height="240" className="h-18 w-auto" />
                        <div>
                            <h1 className="text-2xl font-semibold uppercase tracking-wide">Panel de administración</h1>
                            <p className="mt-1 text-muted">Vocaciones MHPVM</p>
                        </div>
                    </div>

                    {/* role="alert": el lector de pantalla lee el error en cuanto aparece. */}
                    <div role="alert" className="mt-6 empty:hidden">
                        {error && (
                            <p className="flex items-start gap-2.5 rounded-lg border border-alert bg-alert-soft px-3.5 py-3 text-sm font-semibold">
                                <AlertIcon />
                                <span>{error}</span>
                            </p>
                        )}
                    </div>

                    <form onSubmit={handleSubmit} noValidate className="mt-6 flex flex-col gap-4.5">
                        <div>
                            <label htmlFor={`${ids}-email`} className="mb-1.5 block text-sm font-semibold">
                                Correo
                            </label>
                            <input
                                id={`${ids}-email`}
                                type="email"
                                autoComplete="username"
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                className={FIELD}
                            />
                        </div>
                        <div>
                            <label htmlFor={`${ids}-password`} className="mb-1.5 block text-sm font-semibold">
                                Contraseña
                            </label>
                            <div className="relative">
                                <input
                                    id={`${ids}-password`}
                                    type={showPassword ? "text" : "password"}
                                    autoComplete="current-password"
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    className={`${FIELD} pr-24`}
                                />
                                <button
                                    type="button"
                                    aria-pressed={showPassword}
                                    onClick={() => setShowPassword((shown) => !shown)}
                                    className={`absolute right-1.5 top-1.5 h-9 rounded-md bg-surface-alt px-3 text-sm font-semibold ${FOCUS}`}
                                >
                                    {showPassword ? "Ocultar" : "Mostrar"}
                                </button>
                            </div>
                        </div>
                        <Button type="submit" disabled={sending} className="w-full">
                            {sending ? "Entrando…" : "Entrar"}
                        </Button>
                    </form>

                    <p className="mt-6 text-center text-sm">
                        <Link to="/" className={`underline ${FOCUS}`}>
                            Volver a la tienda
                        </Link>
                    </p>
                </div>
            </main>
        </div>
    );
};

const AlertIcon = () => (
    <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
        className="shrink-0"
    >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5M12 16.5v.01" />
    </svg>
);
