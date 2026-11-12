import { useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { getSession, login } from "../api/auth";
import { AUTH_LINK, AuthCard } from "../components/AuthCard";
import { Button } from "../components/Button";
import { FIELD, FormField } from "../components/FormField";
import { PasswordInput } from "../components/PasswordInput";
import { usePageTitle } from "../hooks/usePageTitle";
import { useRequest } from "../hooks/useRequest";
import { apiErrorText } from "../utils/apiErrorText";
import { nextQuery, safeRedirect } from "../utils/safeRedirect";

// Entrar a la cuenta de la tienda (/cuenta/entrar, tarea 4.4). Usa la misma
// ruta que el panel (POST /api/auth/login).
// - ?siguiente= dice a dónde volver (por ejemplo /pago), pero solo se acepta
//   una dirección de la lista de utils/safeRedirect.js.
// - Si entra una cuenta de administración (por ejemplo, tras recuperar su
//   contraseña), va al panel.
// - Con sesión de cliente ya abierta, se salta esta pantalla.

export const Login = () => {
    usePageTitle("Entrar");
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const next = safeRedirect(searchParams.get("siguiente"));
    const session = useRequest(getSession);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [sending, setSending] = useState(false);
    const [error, setError] = useState("");
    const errorRef = useRef(null);

    if (session.status === "ready" && session.data?.role === "customer") {
        return <Navigate to={next} replace />;
    }

    const fail = (text) => {
        setError(text);
        setSending(false);
        errorRef.current?.focus();
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!email.trim() || !password) {
            fail("Escribe tu correo y tu contraseña.");
            return;
        }
        setSending(true);
        setError("");
        try {
            const user = await login(email.trim(), password);
            navigate(user.role === "admin" ? "/admin" : next, { replace: true });
        } catch (loginError) {
            fail(apiErrorText(loginError));
        }
    };

    return (
        <AuthCard
            title="Entrar"
            intro="Con tu cuenta, tus datos y tu dirección ya vienen escritos al pagar."
            error={error}
            errorRef={errorRef}
            footer={
                <p>
                    ¿No tienes cuenta?{" "}
                    <Link to={`/cuenta/crear${nextQuery(next)}`} className={AUTH_LINK}>
                        Crear cuenta
                    </Link>
                </p>
            }
        >
            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
                <FormField label="Correo">
                    {(field) => (
                        <input
                            {...field}
                            type="email"
                            name="email"
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
                                name="password"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                            />
                        )}
                    </FormField>
                    <p className="mt-2 text-sm">
                        <Link to="/cuenta/recuperar" className={AUTH_LINK}>
                            ¿Olvidaste tu contraseña?
                        </Link>
                    </p>
                </div>
                <Button type="submit" disabled={sending} className="mt-1 w-full">
                    {sending ? "Entrando…" : "Entrar"}
                </Button>
            </form>
            <p className="mt-5 text-center text-sm text-muted">
                También puedes comprar sin cuenta.{" "}
                <Link to="/carrito" className={AUTH_LINK}>
                    Ir al carrito
                </Link>
            </p>
        </AuthCard>
    );
};
