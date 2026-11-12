import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { changePassword, deleteAddress, getAccount, updateAddress, updateProfile } from "../api/account";
import { logout } from "../api/auth";
import { getCheckoutOptions } from "../api/checkout";
import { AddressFields, addressFromForm, addressToForm } from "../components/AddressFields";
import { AUTH_LINK } from "../components/AuthCard";
import { Button } from "../components/Button";
import { AlertIcon, FormField } from "../components/FormField";
import { LoadError } from "../components/LoadError";
import { PasswordInput } from "../components/PasswordInput";
import { TextField } from "../components/TextField";
import { usePageTitle } from "../hooks/usePageTitle";
import { useRequest } from "../hooks/useRequest";
import { apiErrorText } from "../utils/apiErrorText";

// Página de la cuenta (/cuenta, tarea 4.4). Tres secciones, cada una con su
// propio botón de guardar: Tus datos, Tu dirección y Contraseña; y Cerrar sesión.
// - Sin sesión (401) lleva a Entrar; con sesión de administración (403) lo dice.
// - Todo lo valida el servidor (account.py): errores bajo cada campo y foco al
//   primero. Si la sesión se cierra a medio camino (401), lleva a Entrar.
// - El correo no se cambia aquí (sin correo de verificación, 5.2, no sería seguro).
// - El historial de pedidos llega en la 4.7.

const CONTAINER = "mx-auto max-w-3xl px-4 sm:px-6";
const SECTION = "rounded-2xl border border-line p-5 sm:p-6";
const SECTION_TITLE = "text-xl font-semibold uppercase tracking-wide";

const loadAccount = (signal) => getAccount(signal);
const loadOptions = (signal) => getCheckoutOptions({ signal });

// Lleva el foco al primer campo con error del formulario; si no hay, al aviso.
const useFocusFirstError = (formRef, errors, fallbackRef) => {
    const [request, setRequest] = useState(0);
    useEffect(() => {
        if (request === 0) return;
        const firstError = [...(formRef.current?.elements ?? [])].find((element) => errors[element.name]);
        const target = firstError ?? fallbackRef.current;
        target?.focus({ preventScroll: true });
        target?.scrollIntoView({ block: "center" });
    }, [request]); // eslint-disable-line react-hooks/exhaustive-deps
    return () => setRequest((count) => count + 1);
};

// Aviso de cada sección: bien (amarillo suave) o error (rojo). role distinto para
// que el lector de pantalla lea el error al momento y el éxito cuando pueda.
const SectionNotice = ({ notice, noticeRef }) => (
    <div ref={noticeRef} tabIndex={-1} className="outline-none">
        <div role="status">
            {notice?.tone === "ok" && (
                <p className="mt-4 rounded-xl bg-highlight-soft px-4 py-3 text-sm text-primary">{notice.text}</p>
            )}
        </div>
        <div role="alert">
            {notice?.tone === "error" && (
                <p className="mt-4 flex items-start gap-2.5 rounded-xl border border-alert bg-alert-soft px-4 py-3 text-sm font-semibold text-primary">
                    <AlertIcon />
                    <span>{notice.text}</span>
                </p>
            )}
        </div>
    </div>
);

// Estado común de un formulario de la cuenta: valores, errores, aviso y envío.
// `save` recibe los valores y devuelve la respuesta del servidor.
const useAccountForm = (initial, save, onSaved, onSessionLost) => {
    const [form, setForm] = useState(initial);
    const [errors, setErrors] = useState({});
    const [notice, setNotice] = useState(null);
    const [sending, setSending] = useState(false);
    const formRef = useRef(null);
    const noticeRef = useRef(null);
    const focusFirstError = useFocusFirstError(formRef, errors, noticeRef);

    const setField = (name, value) => {
        setForm((current) => ({ ...current, [name]: value }));
        if (errors[name]) setErrors((current) => ({ ...current, [name]: undefined }));
    };

    const submit = async (values = form) => {
        setSending(true);
        setNotice(null);
        try {
            const data = await save(values);
            setErrors({});
            setNotice({ tone: "ok", text: data.message });
            onSaved?.(data);
        } catch (error) {
            if (error.status === 401) {
                onSessionLost();
                return;
            }
            setErrors(error.errors ?? {});
            setNotice({ tone: "error", text: apiErrorText(error) });
            focusFirstError();
        } finally {
            setSending(false);
        }
    };

    return { form, setForm, errors, notice, setNotice, sending, setField, submit, formRef, noticeRef };
};

const profileToForm = (user) => ({ first_name: user.first_name, last_name: user.last_name, phone: user.phone ?? "" });

const ProfileSection = ({ user, onSaved, onSessionLost }) => {
    // Al guardar, el formulario muestra lo que quedó en el servidor (por ejemplo,
    // el teléfono sin espacios ni +52).
    const saved = (data) => {
        onSaved(data);
        profile.setForm(profileToForm(data.user));
    };
    const profile = useAccountForm(profileToForm(user), updateProfile, saved, onSessionLost);
    const { form, errors, setField } = profile;

    return (
        <section aria-labelledby="account-profile" className={SECTION}>
            <h2 id="account-profile" className={SECTION_TITLE}>
                Tus datos
            </h2>
            <form
                ref={profile.formRef}
                noValidate
                onSubmit={(event) => {
                    event.preventDefault();
                    profile.submit();
                }}
            >
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <TextField label="Nombre(s)" name="first_name" value={form.first_name} error={errors.first_name} onChange={setField} autoComplete="given-name" maxLength={80} />
                    <TextField label="Apellidos" name="last_name" value={form.last_name} error={errors.last_name} onChange={setField} autoComplete="family-name" maxLength={80} />
                    <TextField label="Correo" name="email" type="email" value={user.email} onChange={() => {}} readOnly help="Es el correo con el que entras. Por ahora no se puede cambiar." />
                    <TextField label="Teléfono" name="phone" type="tel" inputMode="numeric" optional value={form.phone} error={errors.phone} onChange={setField} autoComplete="tel-national" maxLength={16} help="10 dígitos. Solo para avisarte de tus pedidos." />
                </div>
                <SectionNotice notice={profile.notice} noticeRef={profile.noticeRef} />
                <Button type="submit" disabled={profile.sending} className="mt-5 w-full sm:w-auto">
                    {profile.sending ? "Guardando…" : "Guardar datos"}
                </Button>
            </form>
        </section>
    );
};

const AddressSection = ({ address, states, onSaved, onSessionLost }) => {
    const saveAddress = (values) => updateAddress(addressFromForm(values));
    const saved = (data) => {
        onSaved(data);
        form.setForm(addressToForm(data.address));
    };
    const form = useAccountForm(addressToForm(address), saveAddress, saved, onSessionLost);
    const [removing, setRemoving] = useState(false);

    const remove = async () => {
        if (!window.confirm("¿Quitar tu dirección guardada? Tus pedidos no cambian.")) return;
        setRemoving(true);
        form.setNotice(null);
        try {
            const data = await deleteAddress();
            form.setForm(addressToForm(null));
            form.setNotice({ tone: "ok", text: data.message });
            onSaved(data);
        } catch (error) {
            if (error.status === 401) {
                onSessionLost();
                return;
            }
            form.setNotice({ tone: "error", text: apiErrorText(error) });
        } finally {
            setRemoving(false);
        }
    };

    return (
        <section aria-labelledby="account-address" className={SECTION}>
            <h2 id="account-address" className={SECTION_TITLE}>
                Tu dirección
            </h2>
            <p className="mt-1 text-sm text-muted">
                {address
                    ? "Viene escrita al pagar. Puedes cambiarla también desde la página de pago."
                    : "Aún no tienes una dirección guardada. Guárdala aquí o al pagar tu próximo pedido."}
            </p>
            <form
                ref={form.formRef}
                noValidate
                onSubmit={(event) => {
                    event.preventDefault();
                    form.submit();
                }}
            >
                <div className="mt-4 grid gap-4 sm:grid-cols-6">
                    <AddressFields form={form.form} errors={form.errors} onChange={form.setField} states={states} />
                </div>
                <SectionNotice notice={form.notice} noticeRef={form.noticeRef} />
                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Button type="submit" disabled={form.sending || removing} className="w-full sm:w-auto">
                        {form.sending ? "Guardando…" : "Guardar dirección"}
                    </Button>
                    {address && (
                        <Button variant="outline" disabled={form.sending || removing} onClick={remove} className="w-full sm:w-auto">
                            {removing ? "Quitando…" : "Quitar dirección"}
                        </Button>
                    )}
                </div>
            </form>
        </section>
    );
};

const EMPTY_PASSWORDS = { current_password: "", new_password: "" };

const PasswordSection = ({ email, onSessionLost }) => {
    const save = (values) => changePassword(values.current_password, values.new_password);
    const passwords = useAccountForm(EMPTY_PASSWORDS, save, () => passwords.setForm(EMPTY_PASSWORDS), onSessionLost);
    const { form, errors, setField } = passwords;

    return (
        <section aria-labelledby="account-password" className={SECTION}>
            <h2 id="account-password" className={SECTION_TITLE}>
                Contraseña
            </h2>
            <p className="mt-1 text-sm text-muted">Al cambiarla, cerramos tu sesión en los demás dispositivos.</p>
            <form
                ref={passwords.formRef}
                noValidate
                onSubmit={(event) => {
                    event.preventDefault();
                    passwords.submit();
                }}
            >
                {/* Para que el gestor de contraseñas sepa de qué cuenta es la nueva. */}
                <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <FormField label="Contraseña actual" error={errors.current_password}>
                        {(field) => (
                            <PasswordInput {...field} name="current_password" maxLength={128} value={form.current_password}
                                onChange={(event) => setField("current_password", event.target.value)} />
                        )}
                    </FormField>
                    <FormField label="Contraseña nueva" error={errors.new_password} help="Al menos 10 caracteres. Una frase de varias palabras es fácil de recordar y difícil de adivinar.">
                        {(field) => (
                            <PasswordInput {...field} name="new_password" autoComplete="new-password" maxLength={128} value={form.new_password}
                                onChange={(event) => setField("new_password", event.target.value)} />
                        )}
                    </FormField>
                </div>
                <SectionNotice notice={passwords.notice} noticeRef={passwords.noticeRef} />
                <Button type="submit" disabled={passwords.sending} className="mt-5 w-full sm:w-auto">
                    {passwords.sending ? "Cambiando…" : "Cambiar contraseña"}
                </Button>
            </form>
        </section>
    );
};

export const Account = () => {
    usePageTitle("Tu cuenta");
    const navigate = useNavigate();
    const request = useRequest(loadAccount);
    const options = useRequest(loadOptions);
    const [account, setAccount] = useState(null);
    const [leaving, setLeaving] = useState(false);

    useEffect(() => {
        if (request.status === "ready") setAccount(request.data);
    }, [request]);

    const sessionLost = () => navigate("/cuenta/entrar", { replace: true });

    const signOut = async () => {
        setLeaving(true);
        try {
            await logout();
        } catch {
            // Aunque falle la petición, se sale: la cookie caduca sola en 1 h.
        }
        navigate("/", { replace: true });
    };

    let content;
    if (request.status === "error" && request.error?.status === 401) {
        return <Navigate to="/cuenta/entrar" replace />;
    } else if (request.status === "error" && request.error?.status === 403) {
        content = (
            <p className="mt-6 rounded-xl border border-line px-4 py-6 text-primary">
                Entraste con una cuenta de administración. Esta página es para cuentas de la tienda.{" "}
                <Link to="/admin" className={AUTH_LINK}>
                    Ir al panel
                </Link>
            </p>
        );
    } else if (request.status === "error" || options.status === "error") {
        content = <LoadError what="tu cuenta" />;
    } else if (!account || options.status !== "ready") {
        content = (
            <p role="status" className="mt-6 text-muted">
                Cargando tu cuenta…
            </p>
        );
    } else {
        content = (
            <>
                <p className="mt-2 text-muted">
                    Entraste como <span className="font-semibold text-primary">{account.user.email}</span>
                </p>
                <div className="mt-8 space-y-6">
                    <ProfileSection user={account.user} onSaved={setAccount} onSessionLost={sessionLost} />
                    <AddressSection address={account.address} states={options.data.states} onSaved={setAccount} onSessionLost={sessionLost} />
                    <PasswordSection email={account.user.email} onSessionLost={sessionLost} />
                </div>
            </>
        );
    }

    return (
        <main className={`${CONTAINER} pb-16 pt-8 lg:pb-20 lg:pt-10`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
                <h1 className="text-3xl font-semibold uppercase tracking-wide lg:text-4xl">Tu cuenta</h1>
                {account && (
                    <Button variant="outline" onClick={signOut} disabled={leaving}>
                        {leaving ? "Saliendo…" : "Cerrar sesión"}
                    </Button>
                )}
            </div>
            {content}
        </main>
    );
};
