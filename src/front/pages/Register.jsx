import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { getSession, register } from "../api/auth";
import { AUTH_LINK, AuthCard } from "../components/AuthCard";
import { Button } from "../components/Button";
import { AlertIcon, FormField } from "../components/FormField";
import { PasswordInput } from "../components/PasswordInput";
import { TextField } from "../components/TextField";
import { usePageTitle } from "../hooks/usePageTitle";
import { useRequest } from "../hooks/useRequest";
import { apiErrorText } from "../utils/apiErrorText";
import { nextQuery, safeRedirect } from "../utils/safeRedirect";

// Crear cuenta (/cuenta/crear, tarea 4.4) con POST /api/auth/register.
// - Valida el servidor (noValidate): errores bajo cada campo y foco al primero.
// - Al crearla, la sesión queda iniciada y se va a ?siguiente= (validada) o a /cuenta.
// - Si el correo ya tiene cuenta (409), el aviso ofrece entrar o recuperar.
// - La compra sin cuenta siempre está disponible: crear cuenta es opcional.

const EMPTY = { first_name: "", last_name: "", email: "", phone: "", password: "", privacy_accepted: false };

export const Register = () => {
    usePageTitle("Crear cuenta");
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const next = safeRedirect(searchParams.get("siguiente"));
    const session = useRequest(getSession);
    const [form, setForm] = useState(EMPTY);
    const [errors, setErrors] = useState({});
    const [error, setError] = useState(null);
    const [sending, setSending] = useState(false);
    const [focusRequest, setFocusRequest] = useState(0);
    const formRef = useRef(null);
    const errorRef = useRef(null);

    // Foco tras un intento fallido: el primer campo con error; si no, el aviso.
    useEffect(() => {
        if (focusRequest === 0) return;
        const firstError = [...(formRef.current?.elements ?? [])].find((element) => errors[element.name]);
        const target = firstError ?? errorRef.current;
        target?.focus({ preventScroll: true });
        target?.scrollIntoView({ block: "center" });
    }, [focusRequest]); // eslint-disable-line react-hooks/exhaustive-deps

    if (session.status === "ready" && session.data?.role === "customer") {
        return <Navigate to={next} replace />;
    }

    const setField = (name, value) => {
        setForm((current) => ({ ...current, [name]: value }));
        if (errors[name]) setErrors((current) => ({ ...current, [name]: undefined }));
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        setSending(true);
        setError(null);
        try {
            await register({ ...form, email: form.email.trim() });
            navigate(next, { replace: true });
        } catch (registerError) {
            setErrors(registerError.errors ?? {});
            if (registerError.status === 409) {
                setError(
                    <>
                        {registerError.message}{" "}
                        <Link to={`/cuenta/entrar${nextQuery(next)}`} className={AUTH_LINK}>
                            Entrar
                        </Link>
                        {" o "}
                        <Link to="/cuenta/recuperar" className={AUTH_LINK}>
                            recuperar tu contraseña
                        </Link>
                        .
                    </>
                );
            } else {
                setError(apiErrorText(registerError));
            }
            setSending(false);
            setFocusRequest((count) => count + 1);
        }
    };

    return (
        <AuthCard
            title="Crear cuenta"
            intro="Guarda tus datos y tu dirección para tus próximas compras. Comprar sin cuenta siempre es posible."
            error={error}
            errorRef={errorRef}
            footer={
                <p>
                    ¿Ya tienes cuenta?{" "}
                    <Link to={`/cuenta/entrar${nextQuery(next)}`} className={AUTH_LINK}>
                        Entrar
                    </Link>
                </p>
            }
        >
            <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
                <div className="grid gap-5 sm:grid-cols-2">
                    <TextField label="Nombre(s)" name="first_name" value={form.first_name} error={errors.first_name}
                        onChange={setField} autoComplete="given-name" maxLength={80} />
                    <TextField label="Apellidos" name="last_name" value={form.last_name} error={errors.last_name}
                        onChange={setField} autoComplete="family-name" maxLength={80} />
                </div>
                <TextField label="Correo" name="email" type="email" value={form.email} error={errors.email}
                    onChange={setField} autoComplete="email" maxLength={254} />
                <TextField label="Teléfono" name="phone" type="tel" optional value={form.phone} error={errors.phone}
                    onChange={setField} autoComplete="tel-national" inputMode="tel"
                    help="10 dígitos. Solo para avisarte de tus pedidos." />
                <FormField
                    label="Contraseña"
                    error={errors.password}
                    help="Al menos 10 caracteres. Una frase de varias palabras es fácil de recordar y difícil de adivinar."
                >
                    {(field) => (
                        <PasswordInput
                            {...field}
                            name="password"
                            autoComplete="new-password"
                            maxLength={128}
                            value={form.password}
                            onChange={(event) => setField("password", event.target.value)}
                        />
                    )}
                </FormField>

                <div>
                    <label className="flex cursor-pointer items-start gap-3 text-primary">
                        <input
                            type="checkbox"
                            name="privacy_accepted"
                            checked={form.privacy_accepted}
                            onChange={(event) => setField("privacy_accepted", event.target.checked)}
                            aria-invalid={errors.privacy_accepted ? true : undefined}
                            aria-describedby={errors.privacy_accepted ? "register-privacy-error" : undefined}
                            className="mt-0.5 size-5 shrink-0 accent-primary"
                        />
                        <span>
                            He leído y acepto el{" "}
                            {/* En otra pestaña, para no perder lo escrito. Existe desde la 5.4. */}
                            <a href="/aviso-de-privacidad" target="_blank" rel="noopener" className={AUTH_LINK}>
                                aviso de privacidad
                                <span className="sr-only"> (se abre en otra pestaña)</span>
                            </a>
                            .
                        </span>
                    </label>
                    {errors.privacy_accepted && (
                        <p id="register-privacy-error" className="mt-2 flex items-start gap-1.5 text-sm font-semibold">
                            <AlertIcon className="text-alert" />
                            <span>{errors.privacy_accepted}</span>
                        </p>
                    )}
                </div>

                <Button type="submit" disabled={sending} className="mt-1 w-full">
                    {sending ? "Creando tu cuenta…" : "Crear cuenta"}
                </Button>
            </form>
        </AuthCard>
    );
};
