import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { createCampaign, deleteCampaign, getCampaign, updateCampaign } from "../../api/admin";
import { Button } from "../../components/Button";
import { AlertIcon, FIELD, FormField } from "../../components/FormField";
import { LoadError } from "../../components/LoadError";
import { CampaignProducts } from "../../components/admin/CampaignProducts";
import { AUDIENCE_LABELS, CampaignStatus } from "../../components/admin/CampaignStatus";
import { FormSection } from "../../components/admin/ProductDetails";
import { SaveBar } from "../../components/admin/SaveBar";
import { Toggle } from "../../components/admin/Toggle";
import { useRequest } from "../../hooks/useRequest";
import { useUnsavedChanges } from "../../hooks/useUnsavedChanges";
import { AdminNotFound } from "./AdminLayout";

// Formulario de campaña del panel (tarea 4.8). Estructura aprobada por Enrique
// el 13 nov (decisión 9):
//   /admin/campanas/nueva   campaña nueva
//   /admin/campanas/<id>    editar una que existe
//
// Una sola página con secciones (Datos, Descuento, Público y Alcance) y, al
// lado, Estado y "Borrar o desactivar". Un solo "Guardar cambios" (SaveBar):
// el servidor recibe el formulario entero y guarda todo o nada
// (admin_campaigns.py). Las reglas las comprueba el servidor; sus errores salen
// bajo cada campo, y el de "coincide con otra campaña" arriba del formulario.
// Salir con cambios sin guardar pide confirmación (useUnsavedChanges).

// El mismo límite que el servidor.
const NAME_MAX = 100;

const newForm = () => ({
    name: "",
    start_date: "",
    end_date: "",
    discount_percent: "",
    shipping_discount_percent: "",
    // "Solo con cuenta" por defecto (CLAUDE.md, Reglas de negocio).
    audience: "customers",
    scope: "store",
    is_active: true,
    products: [],
});

// Lo guardado, en la forma del formulario: números y precios como texto, que
// es lo que se escribe en los campos.
const formFrom = (campaign) => ({
    name: campaign.name,
    start_date: campaign.start_date,
    end_date: campaign.end_date,
    discount_percent: campaign.discount_percent === null ? "" : String(campaign.discount_percent),
    shipping_discount_percent:
        campaign.shipping_discount_percent === null ? "" : String(campaign.shipping_discount_percent),
    audience: campaign.audience,
    scope: campaign.scope,
    is_active: campaign.is_active,
    products: campaign.products.map((product) => ({
        id: product.id,
        name: product.name,
        status: product.status,
        missing_variants: product.missing_variants,
        variants: product.variants.map((variant) => ({
            id: variant.id,
            label: variant.label,
            sku: variant.sku,
            price: variant.price,
            is_active: variant.is_active,
            fixed_price: variant.fixed_price ?? "",
        })),
    })),
});

const blankToNull = (text) => (text.trim() === "" ? null : text.trim());

// Lo que se manda al servidor. También sirve para saber si hay cambios.
const bodyOf = (form) => ({
    name: form.name,
    start_date: form.start_date,
    end_date: form.end_date,
    discount_percent: blankToNull(form.discount_percent),
    shipping_discount_percent: blankToNull(form.shipping_discount_percent),
    audience: form.audience,
    scope: form.scope,
    is_active: form.is_active,
    products: form.products.map((product) => ({
        id: product.id,
        variants: product.variants.map((variant) => ({ id: variant.id, fixed_price: blankToNull(variant.fixed_price) })),
    })),
});

const sameBody = (a, b) => JSON.stringify(bodyOf(a)) === JSON.stringify(bodyOf(b));

// Quita los errores cuyo nombre empieza por alguno de los prefijos.
const withoutErrors = (errors, prefixes) => {
    const next = Object.fromEntries(
        Object.entries(errors).filter(([key]) => !prefixes.some((prefix) => key === prefix || key.startsWith(`${prefix}.`)))
    );
    return Object.keys(next).length === Object.keys(errors).length ? errors : next;
};

// Grupo de opciones (Público y Alcance): botones de radio con su ayuda.
const ChoiceGroup = ({ legend, name, value, options, onChange }) => (
    <fieldset>
        <legend className="sr-only">{legend}</legend>
        <div className="grid gap-2 @lg:grid-cols-2">
            {options.map((option) => (
                <label
                    key={option.value}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-3 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary ${
                        value === option.value ? "border-primary bg-surface-alt" : "border-line"
                    }`}
                >
                    <input
                        type="radio"
                        name={name}
                        value={option.value}
                        checked={value === option.value}
                        onChange={() => onChange(option.value)}
                        className="mt-1 size-4 shrink-0 accent-primary"
                    />
                    <span>
                        <span className="block font-semibold">{option.label}</span>
                        <span className="mt-0.5 block text-sm text-muted">{option.help}</span>
                    </span>
                </label>
            ))}
        </div>
    </fieldset>
);

// Campo de porcentaje: un número entero con "%" al lado.
const PercentInput = (props) => (
    <div className="flex items-center gap-2">
        <input {...props} type="text" inputMode="numeric" autoComplete="off" className={`${FIELD} max-w-32`} />
        <span className="font-semibold" aria-hidden="true">
            %
        </span>
    </div>
);

// La dirección decide qué se edita. Con `key`, pasar de "nueva" a un id
// (después de crear) empieza el formulario de cero.
export const CampaignForm = () => {
    const { id } = useParams();
    if (id !== undefined && !/^\d+$/.test(id)) return <AdminNotFound />;
    return <CampaignEditor key={id ?? "new"} campaignId={id === undefined ? null : Number(id)} />;
};

const CampaignEditor = ({ campaignId }) => {
    const isNew = campaignId === null;
    const navigate = useNavigate();
    const location = useLocation();

    const loadCampaign = useCallback(
        (signal) => (isNew ? Promise.resolve({ campaign: null }) : getCampaign(campaignId, signal)),
        [isNew, campaignId]
    );
    const loaded = useRequest(loadCampaign);

    // Lo guardado (la última respuesta del servidor) y lo que hay en pantalla.
    const [campaign, setCampaign] = useState(null);
    const [blank] = useState(newForm);
    const [form, setForm] = useState(blank);
    const [errors, setErrors] = useState({});
    const [saveError, setSaveError] = useState("");
    const [actionError, setActionError] = useState(""); // de borrar o desactivar
    const [notice, setNotice] = useState(() => location.state?.notice ?? null);
    const [busy, setBusy] = useState(null); // "save", "delete" o "deactivate"
    // { to, notice }: a dónde ir tras crear o borrar, y el aviso que se lleva.
    const [leaving, setLeaving] = useState(null);
    const formRef = useRef(null);

    useEffect(() => {
        if (location.state?.notice) navigate(location.pathname, { replace: true, state: null });
        // Solo al abrir la pantalla.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (loaded.status !== "ready" || !loaded.data.campaign) return;
        setCampaign(loaded.data.campaign);
        setForm(formFrom(loaded.data.campaign));
    }, [loaded]);

    const savedForm = useMemo(() => (campaign ? formFrom(campaign) : blank), [campaign, blank]);
    const isReady = isNew || campaign !== null;
    const isDirty = isReady && leaving === null && !sameBody(form, savedForm);
    const confirmDiscard = useUnsavedChanges(isDirty);

    useEffect(() => {
        if (leaving !== null) navigate(leaving.to, { replace: true, state: { notice: leaving.notice } });
    }, [leaving, navigate]);

    // Sesión caducada en cualquier petición: de vuelta a Entrar.
    const isExpired = useCallback(
        (error) => {
            if (error.status !== 401) return false;
            navigate("/admin/entrar", { replace: true });
            return true;
        },
        [navigate]
    );

    // Cambiar un campo quita su error, el de "coincide" y el aviso de guardado.
    const setField = (key) => (value) => {
        setForm((current) => ({ ...current, [key]: value }));
        setErrors((current) => withoutErrors(current, [key, "overlap"]));
        setNotice(null);
    };
    const onText = (key) => (event) => setField(key)(event.target.value);

    // Los errores de productos van por posición, que cambia al agregar o quitar.
    const setProducts = (products) => {
        setForm((current) => ({ ...current, products }));
        setErrors((current) => withoutErrors(current, ["products", "overlap", "discount_percent"]));
        setNotice(null);
    };

    const applySaved = (saved, message) => {
        setCampaign(saved);
        setForm(formFrom(saved));
        setErrors({});
        setSaveError("");
        setNotice(message ?? null);
    };

    const focusFirstError = () =>
        requestAnimationFrame(() => {
            // Centrado: la barra fija de guardar no lo tapa.
            const field = formRef.current?.querySelector('[aria-invalid="true"], [data-error-focus]');
            field?.focus({ preventScroll: true });
            field?.scrollIntoView({ block: "center" });
        });

    const handleSave = async () => {
        if (busy || !isDirty) return;
        setBusy("save");
        setSaveError("");
        setActionError("");
        setNotice(null);
        try {
            if (isNew) {
                const data = await createCampaign(bodyOf(form));
                setLeaving({ to: `/admin/campanas/${data.campaign.id}`, notice: data.message });
                return;
            }
            const data = await updateCampaign(campaign.id, bodyOf(form));
            applySaved(data.campaign, data.message);
        } catch (error) {
            if (isExpired(error)) return;
            setErrors(error.errors ?? {});
            setSaveError(error.message);
            focusFirstError();
        } finally {
            setBusy(null);
        }
    };

    const discard = () => {
        setForm(savedForm);
        setErrors({});
        setSaveError("");
    };

    // Desactivar una campaña usada: lo guardado con is_active en false. Lo
    // escrito sin guardar se perdería, así que antes se pregunta.
    const handleDeactivate = async () => {
        if (busy || !confirmDiscard()) return;
        setBusy("deactivate");
        setActionError("");
        setNotice(null);
        try {
            const data = await updateCampaign(campaign.id, { ...bodyOf(savedForm), is_active: false });
            applySaved(data.campaign, "Campaña desactivada: ya no se aplica.");
        } catch (error) {
            if (!isExpired(error)) setActionError(error.message);
        } finally {
            setBusy(null);
        }
    };

    const handleDelete = async () => {
        if (busy) return;
        const question = isDirty
            ? `¿Borrar la campaña «${campaign.name}»? Se perderán también los cambios sin guardar. No se puede deshacer.`
            : `¿Borrar la campaña «${campaign.name}»? No se puede deshacer.`;
        if (!window.confirm(question)) return;
        setBusy("delete");
        setActionError("");
        setNotice(null);
        try {
            const data = await deleteCampaign(campaign.id);
            setLeaving({ to: "/admin/campanas", notice: data.message });
        } catch (error) {
            if (isExpired(error)) return;
            setActionError(error.message);
            // 409: se usó en un pedido mientras tanto. Se recarga lo guardado
            // para que la sección ofrezca desactivar (lo escrito se conserva).
            if (error.status === 409) {
                getCampaign(campaign.id)
                    .then((data) => setCampaign(data.campaign))
                    .catch(() => {});
            }
            setBusy(null);
        }
    };

    if (loaded.status === "error" && loaded.error?.status === 401) return <Navigate to="/admin/entrar" replace />;
    if (loaded.status === "error" && loaded.error?.status === 404) return <CampaignNotFound />;

    const title = isNew ? "Nueva campaña" : (campaign?.name ?? "Campaña");
    const showNotice = !isDirty && notice !== null;

    return (
        <div className={isDirty || showNotice ? "pb-40 sm:pb-24" : ""}>
            <nav aria-label="Migas" className="text-sm text-muted">
                <ol className="flex flex-wrap items-center gap-x-1.5">
                    <li>
                        <Link
                            to="/admin/campanas"
                            className="rounded-sm font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        >
                            Campañas
                        </Link>
                    </li>
                    <li aria-hidden="true">»</li>
                    <li aria-current="page" className="min-w-0 wrap-break-word">
                        {title}
                    </li>
                </ol>
            </nav>

            <div className="mt-3 flex flex-wrap items-center gap-3">
                <h1 className="min-w-0 wrap-break-word text-3xl font-semibold uppercase lg:text-4xl">{title}</h1>
                {campaign && <CampaignStatus status={campaign.status} />}
            </div>

            {loaded.status === "loading" && (
                <p role="status" className="mt-6 text-muted">
                    Cargando la campaña…
                </p>
            )}
            {loaded.status === "error" && <LoadError what="la campaña" />}

            {isReady && (
                // Escritorio (xl): secciones a la izquierda; Estado y "Borrar o
                // desactivar" a la derecha. Móvil: una columna, Estado primero.
                // Sin botón de enviar dentro: se guarda solo con la barra.
                <form
                    ref={formRef}
                    noValidate
                    onSubmit={(event) => event.preventDefault()}
                    className="mt-6 grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]"
                >
                    <div className="flex min-w-0 flex-col gap-5 xl:col-start-2 xl:row-start-1">
                        <FormSection title="Estado">
                            <Toggle
                                label="Activa"
                                help={
                                    form.is_active
                                        ? "Se aplica en sus fechas. Pausada, deja de aplicarse sin borrarla."
                                        : "Pausada: no se aplica aunque esté en fechas. Al reactivarla se comprueba otra vez que no coincida con otra."
                                }
                                error={errors.is_active}
                                checked={form.is_active}
                                onChange={setField("is_active")}
                            />
                        </FormSection>

                        {campaign && (
                            <CampaignRemoval
                                campaign={campaign}
                                busy={busy}
                                error={actionError}
                                onDelete={handleDelete}
                                onDeactivate={handleDeactivate}
                            />
                        )}
                    </div>

                    <div className="flex min-w-0 flex-col gap-5 xl:col-start-1 xl:row-start-1">
                        {errors.overlap && (
                            <p
                                tabIndex={-1}
                                data-error-focus
                                className="flex items-start gap-2 rounded-lg border border-alert bg-alert-soft px-3.5 py-3 text-sm font-semibold outline-none"
                            >
                                <AlertIcon />
                                <span>{errors.overlap}</span>
                            </p>
                        )}

                        <FormSection title="Datos">
                            <FormField
                                label="Nombre"
                                error={errors.name}
                                length={form.name.length}
                                maxLength={NAME_MAX}
                                help="Se ve en la franja de la tienda, por ejemplo «Buen Fin: 15 % en toda la tienda»."
                            >
                                {(field) => (
                                    <input {...field} type="text" value={form.name} onChange={onText("name")} className={FIELD} />
                                )}
                            </FormField>
                            <div className="@container">
                                <div className="grid gap-5 @md:grid-cols-2">
                                    <FormField label="Empieza" error={errors.start_date}>
                                        {(field) => (
                                            <input {...field} type="date" value={form.start_date} onChange={onText("start_date")} className={FIELD} />
                                        )}
                                    </FormField>
                                    <FormField label="Termina" error={errors.end_date}>
                                        {(field) => (
                                            <input {...field} type="date" value={form.end_date} onChange={onText("end_date")} className={FIELD} />
                                        )}
                                    </FormField>
                                </div>
                            </div>
                            <p className="-mt-2 text-sm text-muted">
                                Días completos en hora de México: desde las 0:00 del primer día hasta las 23:59 del último.
                            </p>
                        </FormSection>

                        <FormSection
                            title="Descuento"
                            description="Llena uno o los dos. En cada producto se cobra el precio más bajo entre el normal, el del porcentaje y el fijo: nunca se suman."
                        >
                            <div className="@container">
                                <div className="grid gap-5 @lg:grid-cols-2">
                                    <FormField
                                        label="Porcentaje en productos"
                                        optional
                                        error={errors.discount_percent}
                                        help="De 1 a 99. Vacío si la campaña solo pone precios fijos o descuenta el envío."
                                    >
                                        {(field) => (
                                            <PercentInput {...field} value={form.discount_percent} onChange={onText("discount_percent")} />
                                        )}
                                    </FormField>
                                    <FormField
                                        label="Descuento en el envío"
                                        optional
                                        error={errors.shipping_discount_percent}
                                        help={
                                            form.scope === "selected"
                                                ? "De 1 a 100 (100 = envío gratis). Solo si el pedido lleva alguno de los productos de la campaña."
                                                : "De 1 a 100 (100 = envío gratis). Vacío = el envío se cobra completo."
                                        }
                                    >
                                        {(field) => (
                                            <PercentInput
                                                {...field}
                                                value={form.shipping_discount_percent}
                                                onChange={onText("shipping_discount_percent")}
                                            />
                                        )}
                                    </FormField>
                                </div>
                            </div>
                        </FormSection>

                        <FormSection title="Público">
                            <div className="@container">
                                <ChoiceGroup
                                    legend="Público"
                                    name="audience"
                                    value={form.audience}
                                    onChange={setField("audience")}
                                    options={[
                                        {
                                            value: "customers",
                                            label: AUDIENCE_LABELS.customers,
                                            help: "Sin sesión se ve el precio normal y la franja invita a entrar o crear cuenta. No es un precio secreto: cualquiera puede crear una cuenta.",
                                        },
                                        {
                                            value: "everyone",
                                            label: AUDIENCE_LABELS.everyone,
                                            help: "Con cuenta o sin ella. También se publica en Google y en las vistas previas de WhatsApp.",
                                        },
                                    ]}
                                />
                            </div>
                        </FormSection>

                        <FormSection title="Alcance">
                            <div className="@container">
                                <ChoiceGroup
                                    legend="Alcance"
                                    name="scope"
                                    value={form.scope}
                                    onChange={setField("scope")}
                                    options={[
                                        { value: "store", label: "Toda la tienda", help: "Todos los productos, también los que se agreguen después." },
                                        { value: "selected", label: "Productos seleccionados", help: "Solo los productos que elijas abajo." },
                                    ]}
                                />
                            </div>
                            <CampaignProducts
                                scope={form.scope}
                                products={form.products}
                                errors={errors}
                                onChange={setProducts}
                                onExpired={isExpired}
                            />
                        </FormSection>
                    </div>
                </form>
            )}

            {isDirty && (
                <SaveBar
                    message={isNew ? "Campaña nueva sin guardar" : "Tienes cambios sin guardar"}
                    saveLabel={isNew ? "Crear campaña" : "Guardar cambios"}
                    saving={busy === "save"}
                    saveDisabled={busy !== null}
                    error={saveError}
                    onDiscard={discard}
                    onSave={handleSave}
                />
            )}

            {/* Resultado de guardar o desactivar, donde estaba la barra. */}
            <div role="status" className="empty:hidden">
                {showNotice && (
                    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface lg:left-64">
                        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-10">
                            <p className="flex items-start gap-2.5 text-sm font-semibold">
                                <CheckIcon />
                                <span>{notice}</span>
                            </p>
                            <button
                                type="button"
                                onClick={() => setNotice(null)}
                                aria-label="Cerrar aviso"
                                className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
                            >
                                <CloseIcon />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// Borrar solo si nunca se usó en un pedido; si se usó, desactivar (decisión 8).
const CampaignRemoval = ({ campaign, busy, error, onDelete, onDeactivate }) => {
    const disabled = busy !== null;
    let text;
    if (!campaign.used) {
        text = "Todavía no se usó en ningún pedido: puedes borrarla.";
    } else if (campaign.is_active) {
        text = "Ya se usó en pedidos, así que no se puede borrar. Desactívala para que deje de aplicarse; los pedidos conservan sus precios.";
    } else {
        text = "Ya se usó en pedidos y está desactivada. Los pedidos conservan sus precios.";
    }
    return (
        <FormSection title="Borrar o desactivar">
            <p className="text-sm">{text}</p>
            {error && (
                <p role="alert" className="flex items-start gap-2 rounded-lg border border-alert bg-alert-soft px-3 py-2.5 text-sm font-semibold">
                    <AlertIcon />
                    <span>{error}</span>
                </p>
            )}
            {!campaign.used && (
                <Button variant="outline" onClick={onDelete} disabled={disabled} className="w-full sm:w-auto">
                    {busy === "delete" ? "Borrando…" : "Borrar campaña"}
                </Button>
            )}
            {campaign.used && campaign.is_active && (
                <Button variant="outline" onClick={onDeactivate} disabled={disabled} className="w-full sm:w-auto">
                    {busy === "deactivate" ? "Desactivando…" : "Desactivar campaña"}
                </Button>
            )}
        </FormSection>
    );
};

const CampaignNotFound = () => (
    <>
        <h1 className="text-3xl font-semibold uppercase lg:text-4xl">Campaña no encontrada</h1>
        <p className="mt-2 text-muted">Puede que se haya borrado. Búscala en la lista de campañas.</p>
        <Button to="/admin/campanas" className="mt-6">
            Ir a Campañas
        </Button>
    </>
);

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
});

const CheckIcon = () => (
    <svg {...iconProps(20, 2.2)} className="shrink-0 text-accent">
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12.5l2.5 2.5L16 9.5" />
    </svg>
);

const CloseIcon = () => (
    <svg {...iconProps(18, 2.2)} className="shrink-0">
        <path d="M6 6l12 12M18 6L6 18" />
    </svg>
);
