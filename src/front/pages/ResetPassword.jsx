import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { resetPassword } from "../api/auth";
import { AUTH_LINK, AuthCard, AuthSuccess } from "../components/AuthCard";
import { Button } from "../components/Button";
import { FormField } from "../components/FormField";
import { PasswordInput } from "../components/PasswordInput";
import { usePageTitle } from "../hooks/usePageTitle";
import { apiErrorText } from "../utils/apiErrorText";

// Nueva contraseña (/restablecer-contrasena#token=..., tarea 4.4) con
// POST /api/auth/reset-password. Es la dirección que arma auth.py en el enlace.
// - El token va tras "#": el navegador no lo manda al servidor ni queda en sus
//   registros. Al abrir la página se lee y se quita de la barra de direcciones
//   (history.replaceState), para que no quede en el historial ni se comparta
//   por error al copiar la dirección.
// - No inicia sesión: se entra después con la nueva (así el gestor de
//   contraseñas la guarda). Sirve para clientes y para administración: Entrar
//   lleva al panel si la cuenta es de administración.

// El token del enlace (#token=...), o "" si falta o tiene un formato raro.
const readToken = () => {
    const match = window.location.hash.match(/^#token=([A-Za-z0-9_-]{1,100})$/);
    return match ? match[1] : "";
};

const InvalidLink = ({ text }) => (
    <>
        {text}{" "}
        <Link to="/cuenta/recuperar" className={AUTH_LINK}>
            Pide uno nuevo
        </Link>
        .
    </>
);

export const ResetPassword = () => {
    usePageTitle("Nueva contraseña");
    const [token, setToken] = useState(readToken);
    const [password, setPassword] = useState("");
    const [fieldError, setFieldError] = useState("");
    const [error, setError] = useState(token ? "" : <InvalidLink text="Este enlace no es válido." />);
    const [done, setDone] = useState("");
    const [sending, setSending] = useState(false);
    const inputRef = useRef(null);
    const errorRef = useRef(null);

    // Quitar el token de la barra de direcciones, sin recargar ni cambiar de página.
    // Si con la página abierta se pega otro enlace en la misma pestaña, el
    // navegador solo cambia lo de después de "#" (sin recargar): se lee el nuevo.
    useEffect(() => {
        const clearHash = () => {
            if (window.location.hash) {
                window.history.replaceState(window.history.state, "", window.location.pathname);
            }
        };
        const handleHashChange = () => {
            const newToken = readToken();
            if (newToken) {
                setToken(newToken);
                setError("");
                setFieldError("");
                setDone("");
            }
            clearHash();
        };
        clearHash();
        window.addEventListener("hashchange", handleHashChange);
        return () => window.removeEventListener("hashchange", handleHashChange);
    }, []);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setSending(true);
        setError("");
        setFieldError("");
        try {
            setDone(await resetPassword(token, password));
        } catch (resetError) {
            if (resetError.errors?.password) {
                setFieldError(resetError.errors.password);
                inputRef.current?.focus();
            } else {
                if (resetError.status === 400) {
                    // El enlace no vale (usado, caducado o inventado): sin formulario.
                    setToken("");
                    setError(<InvalidLink text="El enlace no es válido o ya caducó." />);
                } else {
                    setError(apiErrorText(resetError));
                }
                errorRef.current?.focus();
            }
        }
        setSending(false);
    };

    return (
        <AuthCard
            title="Nueva contraseña"
            intro={done ? undefined : "Elige la contraseña con la que vas a entrar desde ahora."}
            error={error}
            errorRef={errorRef}
        >
            {done ? (
                <>
                    <AuthSuccess>{done}</AuthSuccess>
                    <Button to="/cuenta/entrar" className="mt-6 w-full">
                        Entrar
                    </Button>
                </>
            ) : (
                token && (
                    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
                        <FormField
                            label="Contraseña nueva"
                            error={fieldError}
                            help="Al menos 10 caracteres (15 en cuentas de administración). Una frase de varias palabras es fácil de recordar y difícil de adivinar."
                        >
                            {(field) => (
                                <PasswordInput
                                    {...field}
                                    ref={inputRef}
                                    name="password"
                                    autoComplete="new-password"
                                    maxLength={128}
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                />
                            )}
                        </FormField>
                        <Button type="submit" disabled={sending} className="w-full">
                            {sending ? "Guardando…" : "Guardar contraseña"}
                        </Button>
                    </form>
                )
            )}
        </AuthCard>
    );
};
