import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
    createShippingMethod,
    deleteShippingMethod,
    getShippingMethods,
    moveShippingMethod,
    updateShippingMethod,
} from "../../api/admin";
import { AlertIcon, FIELD, FormField } from "../../components/admin/FormField";
import { Toggle } from "../../components/admin/Toggle";
import { Button } from "../../components/Button";
import { LoadError } from "../../components/LoadError";
import { useRequest } from "../../hooks/useRequest";
import { useUnsavedChanges } from "../../hooks/useUnsavedChanges";
import { formatPrice } from "../../utils/formatPrice";

// Envíos del panel (/admin/envios), tarea 4.5.
//
// Las paqueterías que se ofrecen al pagar, con su tarifa fija. Mismo patrón que
// Categorías: a la izquierda (arriba en móvil) la lista en el orden en que se
// ofrecen, con flechas; a la derecha (abajo en móvil) el formulario de la
// elegida o de una nueva. Cada cambio devuelve la lista completa del servidor
// (admin_shipping.py), así la pantalla siempre queda igual que la base.
//
// Cambiar una tarifa no altera los pedidos ya hechos: el pedido copia el
// nombre y el precio del momento.

// Los mismos límites que el servidor.
const NAME_MAX = 100;
const DELIVERY_TIME_MAX = 60;

const EMPTY_FORM = { name: "", price: "", delivery_time: "", is_active: true };

const formFrom = (method) => ({
    name: method.name,
    price: method.price,
    delivery_time: method.delivery_time ?? "",
    is_active: method.is_active,
});

const sameForm = (a, b) => Object.keys(EMPTY_FORM).every((key) => a[key] === b[key]);

const plural = (count, singular, pluralForm) => `${count} ${count === 1 ? singular : pluralForm}`;

const priceText = (price) => (Number(price) === 0 ? "Gratis" : formatPrice(price));

const summary = (methods) => {
    if (!methods.length) return "Todavía no hay paqueterías.";
    const active = methods.filter((method) => method.is_active).length;
    return `${plural(methods.length, "paquetería", "paqueterías")}, ${active} ${active === 1 ? "se ofrece" : "se ofrecen"} al pagar`;
};

const USED_REASON = "No se puede borrar: ya se usó en pedidos. Apágala para dejar de ofrecerla.";

export const Shipping = () => {
    const navigate = useNavigate();
    const loaded = useRequest(getShippingMethods);
    // Lista más reciente: la de la carga inicial hasta el primer cambio, después
    // la que devuelve el servidor con cada cambio.
    const [savedList, setSavedList] = useState(null);
    const methods = savedList ?? loaded.data?.methods ?? null;

    // Qué hay en el formulario: { mode: "edit", id } o { mode: "new" }.
    const [selection, setSelection] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [savedForm, setSavedForm] = useState(EMPTY_FORM);
    const [errors, setErrors] = useState({});
    const [notice, setNotice] = useState(null); // { kind: "success" | "error", text }
    const [listError, setListError] = useState("");
    const [busy, setBusy] = useState(null); // "save", "delete" o "move"
    const headingRef = useRef(null);
    const formRef = useRef(null);

    const isDirty = selection !== null && !sameForm(form, savedForm);
    const confirmDiscard = useUnsavedChanges(isDirty);

    const current = selection?.mode === "edit" ? methods?.find((method) => method.id === selection.id) : null;
    const noneActive = methods !== null && !methods.some((method) => method.is_active);

    const openEdit = (method) => {
        const values = formFrom(method);
        setSelection({ mode: "edit", id: method.id });
        setForm(values);
        setSavedForm(values);
        setErrors({});
    };

    const openNew = () => {
        setSelection({ mode: "new" });
        setForm(EMPTY_FORM);
        setSavedForm(EMPTY_FORM);
        setErrors({});
    };

    // Al abrir la pantalla: la primera paquetería, o una nueva si no hay ninguna.
    useEffect(() => {
        if (loaded.status !== "ready" || selection !== null) return;
        const first = loaded.data.methods[0];
        if (first) openEdit(first);
        else openNew();
        // Solo al terminar la carga inicial.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loaded.status]);

    // Lleva la vista y el foco al formulario (en móvil está debajo de la lista).
    const revealForm = () => {
        requestAnimationFrame(() => {
            const heading = headingRef.current;
            if (!heading) return;
            const { top } = heading.getBoundingClientRect();
            if (top < 0 || top > window.innerHeight - 160) heading.scrollIntoView({ block: "start", behavior: "smooth" });
            heading.focus({ preventScroll: true });
        });
    };

    // Elegir otra paquetería o empezar una nueva, avisando si hay cambios sin guardar.
    const choose = (open) => {
        if (!confirmDiscard()) return;
        open();
        setNotice(null);
        setListError("");
        revealForm();
    };

    // Errores del servidor. Con la sesión caducada (401), de vuelta a Entrar.
    const handleError = (error, showError) => {
        if (error.status === 401) {
            navigate("/admin/entrar", { replace: true });
            return;
        }
        showError(error.message);
    };

    const setField = (key) => (event) => setForm((values) => ({ ...values, [key]: event.target.value }));

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy("save");
        setErrors({});
        setNotice(null);
        const body = {
            name: form.name.trim(),
            price: form.price.trim(),
            delivery_time: form.delivery_time.trim(),
            is_active: form.is_active,
        };
        try {
            const data =
                selection.mode === "edit"
                    ? await updateShippingMethod(selection.id, body)
                    : await createShippingMethod(body);
            // La nueva es la que no estaba antes en la lista.
            const saved =
                selection.mode === "edit"
                    ? data.methods.find((method) => method.id === selection.id)
                    : data.methods.find((method) => !methods.some((old) => old.id === method.id));
            setSavedList(data.methods);
            if (saved) openEdit(saved);
            setNotice({ kind: "success", text: data.message });
        } catch (error) {
            handleError(error, (text) => {
                setErrors(error.errors ?? {});
                setNotice({ kind: "error", text });
                // El foco va al primer campo con error, centrado en pantalla.
                requestAnimationFrame(() => {
                    const field = formRef.current?.querySelector('[aria-invalid="true"]');
                    field?.focus({ preventScroll: true });
                    field?.scrollIntoView({ block: "center" });
                });
            });
        } finally {
            setBusy(null);
        }
    };

    const handleDelete = async () => {
        if (busy || !current) return;
        if (!window.confirm(`¿Borrar la paquetería «${current.name}»? No se puede deshacer.`)) return;
        setBusy("delete");
        setNotice(null);
        try {
            const data = await deleteShippingMethod(current.id);
            setSavedList(data.methods);
            if (data.methods[0]) openEdit(data.methods[0]);
            else openNew();
            setNotice({ kind: "success", text: data.message });
        } catch (error) {
            handleError(error, (text) => setNotice({ kind: "error", text }));
        } finally {
            setBusy(null);
        }
    };

    // Flechas de orden. No tocan el formulario: se pueden usar con cambios sin guardar.
    const handleMove = async (method, direction) => {
        if (busy) return;
        setBusy("move");
        setListError("");
        try {
            const data = await moveShippingMethod(method.id, direction);
            setSavedList(data.methods);
            // La fila cambió de sitio: el foco vuelve a su flecha (o a la otra,
            // si esa quedó desactivada en el borde) para seguir con el teclado.
            requestAnimationFrame(() => {
                const same = document.querySelector(`[data-move="${method.id}-${direction}"]`);
                const other = document.querySelector(`[data-move="${method.id}-${direction === "up" ? "down" : "up"}"]`);
                (same && !same.disabled ? same : other)?.focus();
            });
        } catch (error) {
            handleError(error, setListError);
        } finally {
            setBusy(null);
        }
    };

    if (loaded.status === "error" && loaded.error?.status === 401) {
        return <Navigate to="/admin/entrar" replace />;
    }

    return (
        <>
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-semibold uppercase lg:text-4xl">Envíos</h1>
                    {methods && <p className="mt-1 text-muted">{summary(methods)}</p>}
                </div>
                {methods && (
                    <Button onClick={() => choose(openNew)} className="gap-2">
                        <PlusIcon />
                        Nueva paquetería
                    </Button>
                )}
            </div>

            {loaded.status === "loading" && (
                <p role="status" className="mt-6 text-muted">
                    Cargando las paqueterías…
                </p>
            )}
            {loaded.status === "error" && <LoadError what="las paqueterías" />}

            {noneActive && (
                <p className="mt-6 flex items-start gap-2.5 rounded-lg border border-alert bg-alert-soft px-3.5 py-3 text-sm font-semibold">
                    <AlertIcon />
                    <span>No hay paqueterías activas: por ahora no se pueden recibir pedidos.</span>
                </p>
            )}

            {methods && selection && (
                <div className="mt-6 grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                    <MethodList
                        methods={methods}
                        selection={selection}
                        error={listError}
                        onEdit={(method) => choose(() => openEdit(method))}
                        onMove={handleMove}
                    />

                    <section
                        aria-labelledby="shipping-form-title"
                        className="rounded-xl border border-line bg-surface p-5 sm:p-6"
                    >
                        <h2
                            id="shipping-form-title"
                            ref={headingRef}
                            tabIndex={-1}
                            className="scroll-mt-4 text-xl font-semibold uppercase tracking-wide focus:outline-none"
                        >
                            {current ? `Editar ${savedForm.name}` : "Nueva paquetería"}
                        </h2>

                        <MethodForm
                            formRef={formRef}
                            form={form}
                            errors={errors}
                            current={current}
                            setField={setField}
                            setActive={(value) => setForm((values) => ({ ...values, is_active: value }))}
                            onSubmit={handleSubmit}
                            onDelete={handleDelete}
                            notice={notice}
                            busy={busy}
                        />
                    </section>
                </div>
            )}
        </>
    );
};

const MethodList = ({ methods, selection, error, onEdit, onMove }) => (
    <section aria-label="Lista de paqueterías" className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex justify-between px-4 pb-2.5 pt-3 text-xs font-bold uppercase tracking-wider text-muted">
            <span>Paquetería</span>
            <span>Orden</span>
        </div>
        {error && (
            <p
                role="alert"
                className="mx-3 mb-3 flex items-start gap-2 rounded-lg border border-alert bg-alert-soft px-3 py-2.5 text-sm font-semibold"
            >
                <AlertIcon />
                <span>{error}</span>
            </p>
        )}
        {!methods.length && <p className="border-t border-line px-4 py-6 text-muted">Todavía no hay paqueterías.</p>}
        <ul>
            {methods.map((method, index) => {
                const selected = selection.mode === "edit" && selection.id === method.id;
                return (
                    <li
                        key={method.id}
                        className={`flex items-center gap-1.5 border-t border-line py-2 pl-4 pr-2 ${selected ? "bg-surface-alt" : ""}`}
                    >
                        <div className="min-w-0 flex-1">
                            <button
                                type="button"
                                onClick={() => onEdit(method)}
                                aria-current={selected ? "true" : undefined}
                                className={`rounded-sm text-left font-semibold wrap-break-word hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${selected ? "underline" : ""}`}
                            >
                                {method.name}
                            </button>
                            <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
                                <span>{priceText(method.price)}</span>
                                <span aria-hidden="true">·</span>
                                {/* El texto acompaña al color: el punto solo no basta para leerlo. */}
                                <span className="inline-flex items-center gap-1.5">
                                    <span
                                        className={`size-2.5 rounded-full ${method.is_active ? "bg-accent" : "bg-field"}`}
                                        aria-hidden="true"
                                    />
                                    {method.is_active ? "Se ofrece" : "Apagada"}
                                </span>
                            </p>
                        </div>
                        <MoveButton method={method} direction="up" disabled={index === 0} onMove={onMove} />
                        <MoveButton method={method} direction="down" disabled={index === methods.length - 1} onMove={onMove} />
                    </li>
                );
            })}
        </ul>
        <p className="border-t border-line px-4 pb-4 pt-3 text-sm text-muted">
            Al pagar se ofrecen en este orden, solo las que están encendidas.
        </p>
    </section>
);

const MoveButton = ({ method, direction, disabled, onMove }) => (
    <button
        type="button"
        data-move={`${method.id}-${direction}`}
        disabled={disabled}
        onClick={() => onMove(method, direction)}
        aria-label={`${direction === "up" ? "Subir" : "Bajar"} ${method.name}`}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
    >
        <svg {...iconProps(18, 2)}>
            <path d={direction === "up" ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
        </svg>
    </button>
);

const MethodForm = ({ formRef, form, errors, current, setField, setActive, onSubmit, onDelete, notice, busy }) => {
    const blockedReason = current?.used ? USED_REASON : null;
    return (
        <form ref={formRef} onSubmit={onSubmit} noValidate className="mt-5 flex flex-col gap-5">
            <FormField
                label="Nombre"
                error={errors.name}
                help="Así lo ve quien compra al elegir el envío. Por ejemplo: Estafeta estándar."
                length={form.name.length}
                maxLength={NAME_MAX}
            >
                {(field) => <input {...field} type="text" value={form.name} onChange={setField("name")} className={FIELD} />}
            </FormField>

            <FormField label="Precio" error={errors.price} help="Escribe 0 si el envío es gratis.">
                {(field) => (
                    <div className="relative max-w-56">
                        <span
                            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
                            aria-hidden="true"
                        >
                            $
                        </span>
                        <input
                            {...field}
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            placeholder="0.00"
                            value={form.price}
                            onChange={setField("price")}
                            className={`${FIELD} pl-7`}
                        />
                    </div>
                )}
            </FormField>

            <FormField
                label="Plazo estimado"
                optional
                error={errors.delivery_time}
                help="Por ejemplo: 3 a 5 días hábiles. Déjalo vacío si no quieres mostrar un plazo."
                length={form.delivery_time.length}
                maxLength={DELIVERY_TIME_MAX}
            >
                {(field) => (
                    <input
                        {...field}
                        type="text"
                        value={form.delivery_time}
                        onChange={setField("delivery_time")}
                        className={FIELD}
                    />
                )}
            </FormField>

            <Toggle
                label="Se ofrece al pagar"
                help="Apágala para dejar de ofrecerla sin borrarla. Los pedidos ya hechos no cambian."
                error={errors.is_active}
                checked={form.is_active}
                onChange={setActive}
            />

            {/* Resultado de guardar o borrar. role="status": el lector de pantalla lo lee al aparecer. */}
            <div role="status" className="empty:hidden">
                {notice && (
                    <p
                        className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm font-semibold ${
                            notice.kind === "error" ? "border-alert bg-alert-soft" : "border-line bg-surface-alt"
                        }`}
                    >
                        {notice.kind === "error" ? <AlertIcon /> : <CheckIcon />}
                        <span>{notice.text}</span>
                    </p>
                )}
            </div>

            <div className="flex flex-wrap items-start justify-between gap-4 border-t border-line pt-5">
                <div className="min-w-0 flex-1 basis-56">
                    {current && (
                        <>
                            <Button
                                variant="outline"
                                onClick={onDelete}
                                disabled={Boolean(blockedReason) || busy !== null}
                                aria-describedby={blockedReason ? "shipping-delete-reason" : undefined}
                            >
                                {busy === "delete" ? "Borrando…" : "Borrar paquetería"}
                            </Button>
                            {blockedReason && (
                                <p id="shipping-delete-reason" className="mt-2 text-sm text-muted">
                                    {blockedReason}
                                </p>
                            )}
                        </>
                    )}
                </div>
                <Button type="submit" disabled={busy !== null}>
                    {busy === "save" ? "Guardando…" : "Guardar"}
                </Button>
            </div>
        </form>
    );
};

// Iconos dibujados aquí mismo (SVG), sin librerías.
const iconProps = (size, strokeWidth) => ({
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    className: "shrink-0",
});

const PlusIcon = ({ size = 18 }) => (
    <svg {...iconProps(size, 2.2)}>
        <path d="M12 5v14M5 12h14" />
    </svg>
);

const CheckIcon = () => (
    <svg {...iconProps(20, 2.2)} className="shrink-0 text-accent">
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12.5l2.5 2.5L16 9.5" />
    </svg>
);
