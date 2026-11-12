import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { getSession, login } from "../../api/auth";
import { AlertIcon, FIELD, FormField } from "../../components/FormField";
import { PasswordInput } from "../../components/PasswordInput";
import { BrandStripe } from "../../components/BrandStripe";
import { Button } from "../../components/Button";
import { useNoIndex } from "../../hooks/useNoIndex";
import { useRequest } from "../../hooks/useRequest";
import { apiErrorText } from "../../utils/apiErrorText";
import logo from "../../assets/logo.webp";

// Entrar al panel (/admin/entrar). Usa POST /api/auth/login de la tarea 1.5.
//
// Después de entrar siempre se va a /admin, nunca a una dirección que llegue en
// la URL (?volver=...): así nadie puede armar un enlace que, tras entrar, lleve
// a otra página (la "redirección abierta" de React Router 6 anotada en el estado).
// Si la cuenta es de cliente, el panel le dice que no tiene acceso.
//
// "¿Olvidaste tu contraseña?" lleva a la recuperación de la tienda (tarea 4.4),
// la misma para clientes y administración: el enlace del correo abre
// /restablecer-contrasena, y al entrar desde la tienda una cuenta de
// administración va al panel.

const FOCUS = "rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export const AdminLogin = () => {
    useNoIndex();
    const navigate = useNavigate();
    const session = useRequest(getSession);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
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
            setError(apiErrorText(loginError));
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
                        <FormField label="Correo">
                            {(field) => (
                                <input
                                    {...field}
                                    type="email"
                                    autoComplete="username"
                                    value={email}
                                    onChange={(event) => setEmail(event.target.value)}
                                    className={FIELD}
                                />
                            )}
                        </FormField>
                        <div>
                            <FormField label="Contraseña">
                                {(field) => (
                                    <PasswordInput
                                        {...field}
                                        value={password}
                                        onChange={(event) => setPassword(event.target.value)}
                                    />
                                )}
                            </FormField>
                            <p className="mt-2 text-sm">
                                <Link to="/cuenta/recuperar" className={`underline ${FOCUS}`}>
                                    ¿Olvidaste tu contraseña?
                                </Link>
                            </p>
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
