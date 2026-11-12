import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { forgotPassword } from "../api/auth";
import { AUTH_LINK, AuthCard, AuthSuccess } from "../components/AuthCard";
import { Button } from "../components/Button";
import { FIELD, FormField } from "../components/FormField";
import { usePageTitle } from "../hooks/usePageTitle";
import { apiErrorText } from "../utils/apiErrorText";

// Recuperar contraseña (/cuenta/recuperar, tarea 4.4) con POST /api/auth/forgot-password.
// El servidor responde lo mismo exista o no la cuenta (así nadie averigua qué
// correos están registrados), y la pantalla muestra ese mensaje tal cual.
// Sirve también para las cuentas de administración (enlace en /admin/entrar).
// Hasta conectar Resend (5.2) el enlace solo sale en la consola del servidor en local.

export const ForgotPassword = () => {
    usePageTitle("Recuperar contraseña");
    const [email, setEmail] = useState("");
    const [fieldError, setFieldError] = useState("");
    const [error, setError] = useState("");
    const [sent, setSent] = useState("");
    const [sending, setSending] = useState(false);
    const inputRef = useRef(null);
    const errorRef = useRef(null);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setSending(true);
        setError("");
        setFieldError("");
        try {
            setSent(await forgotPassword(email.trim()));
        } catch (forgotError) {
            if (forgotError.errors?.email) {
                setFieldError(forgotError.errors.email);
                inputRef.current?.focus();
            } else {
                setError(apiErrorText(forgotError));
                errorRef.current?.focus();
            }
        }
        setSending(false);
    };

    return (
        <AuthCard
            title="Recuperar contraseña"
            intro="Escribe el correo de tu cuenta y te enviamos un enlace para crear una contraseña nueva."
            error={error}
            errorRef={errorRef}
            footer={
                <p>
                    <Link to="/cuenta/entrar" className={AUTH_LINK}>
                        Volver a Entrar
                    </Link>
                </p>
            }
        >
            {sent ? (
                <AuthSuccess>
                    <p>{sent}</p>
                    <p className="mt-2 text-sm">El enlace sirve una sola vez y durante 1 hora.</p>
                </AuthSuccess>
            ) : (
                <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
                    <FormField label="Correo" error={fieldError}>
                        {(field) => (
                            <input
                                {...field}
                                ref={inputRef}
                                type="email"
                                name="email"
                                autoComplete="email"
                                maxLength={254}
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                className={FIELD}
                            />
                        )}
                    </FormField>
                    <Button type="submit" disabled={sending} className="w-full">
                        {sending ? "Enviando…" : "Enviar enlace"}
                    </Button>
                </form>
            )}
        </AuthCard>
    );
};
