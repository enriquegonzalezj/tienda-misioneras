import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { registerFromOrder } from "../api/auth";
import { AUTH_LINK } from "./AuthCard";
import { Button } from "./Button";
import { AlertIcon, FormField } from "./FormField";
import { PasswordInput } from "./PasswordInput";
import { apiErrorText } from "../utils/apiErrorText";
import { nextQuery } from "../utils/safeRedirect";

// Oferta de cuenta al final del pago (tarea 4.4), en /pedido/<token>. Depende de
// `account_status` de GET /api/orders/<token>:
//
// - "available": crear la cuenta con los datos de este pedido. Solo se pide una
//   contraseña y aceptar el aviso de privacidad: nombre, correo, teléfono y
//   dirección los toma el servidor del pedido (POST /api/auth/register-from-order),
//   nunca del navegador. Enlaza solo este pedido y deja la sesión iniciada.
// - "exists": el correo ya tiene cuenta; se ofrece entrar y volver aquí. Entrar
//   no enlaza este pedido: los pedidos no se enlazan por coincidir el correo,
//   porque el correo no está verificado.
// - "linked" (u otro): no se muestra nada.
//
//   <CreateAccountOffer token={token} order={order} onCreated={...} onStale={...} />
//
// `onCreated()`: la cuenta quedó creada (quien lo usa vuelve a pedir el pedido,
// que pasa a "linked", y muestra el aviso de éxito). `onStale()`: el servidor
// dice que el pedido ya cambió (409); quien lo usa vuelve a pedirlo.
// La página no lo muestra si ya hay una sesión iniciada.
const SECTION = "rounded-2xl border border-line p-5";
const TITLE = "text-lg font-semibold uppercase tracking-wide";

export const CreateAccountOffer = ({ token, order, onCreated, onStale }) => {
    if (order.account_status === "exists") {
        return (
            <section aria-labelledby="account-offer" className={SECTION}>
                <h2 id="account-offer" className={TITLE}>
                    Ya tienes cuenta
                </h2>
                <p className="mt-2 text-primary">
                    El correo de este pedido ya tiene una cuenta. Entra para que tus próximas compras usen tus datos
                    guardados.
                </p>
                <Button to={`/cuenta/entrar${nextQuery(`/pedido/${token}`)}`} variant="outline" className="mt-4">
                    Entrar
                </Button>
            </section>
        );
    }
    if (order.account_status !== "available") return null;
    return <RegisterForm token={token} email={order.contact.email} onCreated={onCreated} onStale={onStale} />;
};

const RegisterForm = ({ token, email, onCreated, onStale }) => {
    const [password, setPassword] = useState("");
    const [privacyAccepted, setPrivacyAccepted] = useState(false);
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

    const handleSubmit = async (event) => {
        event.preventDefault();
        setSending(true);
        setError(null);
        try {
            await registerFromOrder(token, password, privacyAccepted);
            onCreated();
            return;
        } catch (registerError) {
            setErrors(registerError.errors ?? {});
            setError(Object.keys(registerError.errors ?? {}).length > 0 ? null : apiErrorText(registerError));
            // 409: alguien creó la cuenta o enlazó el pedido mientras tanto. El
            // pedido se vuelve a pedir y la oferta cambia sola (entrar o nada).
            if (registerError.status === 409) onStale();
        }
        setSending(false);
        setFocusRequest((count) => count + 1);
    };

    return (
        <section aria-labelledby="account-offer" className={SECTION}>
            <h2 id="account-offer" className={TITLE}>
                Crea tu cuenta con estos datos
            </h2>
            <p className="mt-2 text-primary">
                Guardamos tus datos y tu dirección para tus próximas compras. Solo falta una contraseña para{" "}
                <span className="font-semibold break-all">{email}</span>.
            </p>

            {/* role="alert" siempre presente: el lector de pantalla lee cada aviso nuevo. */}
            <div ref={errorRef} tabIndex={-1} role="alert" className="mt-4 outline-none empty:hidden">
                {error && (
                    <div className="flex items-start gap-2.5 rounded-xl border border-alert bg-alert-soft px-4 py-3 text-sm font-semibold text-primary">
                        <AlertIcon />
                        <div>{error}</div>
                    </div>
                )}
            </div>

            <form ref={formRef} onSubmit={handleSubmit} noValidate className="mt-4 flex flex-col gap-5">
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
                            value={password}
                            onChange={(event) => {
                                setPassword(event.target.value);
                                if (errors.password) setErrors((current) => ({ ...current, password: undefined }));
                            }}
                        />
                    )}
                </FormField>

                <div>
                    <label className="flex cursor-pointer items-start gap-3 text-primary">
                        <input
                            type="checkbox"
                            name="privacy_accepted"
                            checked={privacyAccepted}
                            onChange={(event) => {
                                setPrivacyAccepted(event.target.checked);
                                if (errors.privacy_accepted) setErrors((current) => ({ ...current, privacy_accepted: undefined }));
                            }}
                            aria-invalid={errors.privacy_accepted ? true : undefined}
                            aria-describedby={errors.privacy_accepted ? "offer-privacy-error" : undefined}
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
                        <p id="offer-privacy-error" className="mt-2 flex items-start gap-1.5 text-sm font-semibold">
                            <AlertIcon className="text-alert" />
                            <span>{errors.privacy_accepted}</span>
                        </p>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                    <Button type="submit" disabled={sending} aria-busy={sending}>
                        {sending ? "Creando tu cuenta…" : "Crear cuenta"}
                    </Button>
                    <p className="text-sm text-muted">Es opcional: tu pedido sigue igual sin cuenta.</p>
                </div>
            </form>
        </section>
    );
};

// Aviso tras crear la cuenta desde el pedido. Se enfoca al aparecer para que el
// lector de pantalla lo lea y el teclado no se quede en el formulario que ya no está.
export const AccountCreated = () => {
    const ref = useRef(null);
    useEffect(() => {
        ref.current?.focus({ preventScroll: true });
        ref.current?.scrollIntoView({ block: "center" });
    }, []);
    return (
        <section ref={ref} tabIndex={-1} role="status" aria-labelledby="account-created" className="rounded-2xl bg-highlight-soft p-5 text-primary outline-none">
            <h2 id="account-created" className={TITLE}>
                Tu cuenta quedó creada
            </h2>
            <p className="mt-2">
                Ya tienes la sesión iniciada y este pedido está en tu cuenta.{" "}
                <Link to="/cuenta" className={AUTH_LINK}>
                    Ver tu cuenta
                </Link>
            </p>
        </section>
    );
};
