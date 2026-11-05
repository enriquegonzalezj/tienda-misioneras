import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import {
    archiveProduct,
    deleteProduct,
    getAdminCategories,
    getAdminProduct,
    unarchiveProduct,
    updateProduct,
} from "../../api/admin";
import { FormSection, ProductDetails } from "../../components/admin/ProductDetails";
import { ProductCategory, ProductRemoval, ProductStatus, ProductSummary } from "../../components/admin/ProductSidebar";
import { SaveBar } from "../../components/admin/SaveBar";
import { StatusDot } from "../../components/admin/StatusDot";
import { Button } from "../../components/Button";
import { LoadError } from "../../components/LoadError";
import { useRequest } from "../../hooks/useRequest";
import { useUnsavedChanges } from "../../hooks/useUnsavedChanges";
import { AdminNotFound } from "./AdminLayout";

// Formulario de producto del panel, tarea 2.1, paso 7a.
//   /admin/productos/nuevo   producto nuevo
//   /admin/productos/<id>    editar uno que existe
//
// Una sola página con secciones y un solo "Guardar cambios": el servidor
// recibe el formulario entero (datos, estado, categoría, opciones y
// variantes) y guarda todo o nada (rutas /api/admin/products del paso 5b).
// Las reglas las comprueba el servidor; sus errores salen bajo cada campo.
//
// En el 7a se editan datos, estado y categoría. Las opciones y variantes que
// ya existen se reenvían tal cual al guardar; su pantalla llega en el 7b, y
// hasta entonces un producto nuevo no se puede guardar (el servidor exige al
// menos una variante con SKU y precio). Las fotos llegan en el paso 8.

const EMPTY_FORM = {
    name: "",
    slug: "",
    subtitle: "",
    card_subtitle: "",
    description: "",
    seo_description: "",
    category_id: null,
    is_active: false,
    is_featured: false,
};

const formFrom = (product) => ({
    name: product.name,
    slug: product.slug,
    subtitle: product.subtitle,
    card_subtitle: product.card_subtitle,
    description: product.description,
    seo_description: product.seo_description,
    category_id: product.category_id,
    is_active: product.is_active,
    is_featured: product.is_featured,
});

const sameForm = (a, b) => Object.keys(EMPTY_FORM).every((key) => a[key] === b[key]);

// Opciones y variantes guardadas, en la forma que pide el servidor, para
// reenviarlas sin cambios (en el 7b saldrán de su propia sección).
const optionsBody = (product) =>
    product.options.map((option) => ({
        id: option.id,
        name: option.name,
        has_swatch: option.has_swatch,
        values: option.values.map((value) => ({ id: value.id, value: value.value, swatch_hex: value.swatch_hex })),
    }));

const variantsBody = (product) =>
    product.variants.map((variant) => ({
        id: variant.id,
        values: variant.values,
        sku: variant.sku,
        price: variant.price,
        cost: variant.cost,
        stock: variant.stock,
        is_active: variant.is_active,
    }));

// La dirección decide qué se edita. Con `key`, pasar de "nuevo" a un id
// (después de crear) empieza el formulario de cero, sin restos del anterior.
export const ProductForm = () => {
    const { id } = useParams();
    if (id !== undefined && !/^\d+$/.test(id)) return <AdminNotFound />;
    return <ProductEditor key={id ?? "new"} productId={id === undefined ? null : Number(id)} />;
};

const ProductEditor = ({ productId }) => {
    const isNew = productId === null;
    const navigate = useNavigate();
    const location = useLocation();

    const loadProduct = useCallback(
        (signal) => (isNew ? Promise.resolve({ product: null }) : getAdminProduct(productId, signal)),
        [isNew, productId]
    );
    const loaded = useRequest(loadProduct);
    const categories = useRequest(getAdminCategories);

    // Lo guardado (la última respuesta del servidor) y lo que hay en pantalla.
    const [product, setProduct] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [errors, setErrors] = useState({});
    const [saveError, setSaveError] = useState("");
    const [actionError, setActionError] = useState(""); // de borrar, archivar o desarchivar
    // { kind: "success", text }. Puede llegar en el estado de la navegación
    // (por ejemplo, "Producto creado" al pasar de nuevo a editar, en el 7b).
    const [notice, setNotice] = useState(() =>
        location.state?.notice ? { kind: "success", text: location.state.notice } : null
    );
    const [busy, setBusy] = useState(null); // "save", "delete", "archive" o "unarchive"
    const [leaving, setLeaving] = useState(null); // aviso para el Inventario tras borrar
    const formRef = useRef(null);

    // El aviso que llegó con la navegación se muestra una sola vez.
    useEffect(() => {
        if (location.state?.notice) navigate(location.pathname, { replace: true, state: null });
        // Solo al abrir la pantalla.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (loaded.status !== "ready" || !loaded.data.product) return;
        setProduct(loaded.data.product);
        setForm(formFrom(loaded.data.product));
    }, [loaded]);

    const savedForm = useMemo(() => (product ? formFrom(product) : EMPTY_FORM), [product]);
    const isReady = (isNew || product !== null) && categories.status === "ready";
    const isDirty = isReady && leaving === null && !sameForm(form, savedForm);
    const confirmDiscard = useUnsavedChanges(isDirty);

    // Tras borrar: al Inventario, ya sin preguntar por cambios (leaving apaga
    // isDirty en el dibujo anterior). Con replace, Atrás no vuelve a un
    // producto que ya no existe.
    useEffect(() => {
        if (leaving !== null) navigate("/admin", { replace: true, state: { notice: leaving } });
    }, [leaving, navigate]);

    // Sesión caducada en cualquier petición: de vuelta a Entrar.
    const isExpired = (error) => {
        if (error.status !== 401) return false;
        navigate("/admin/entrar", { replace: true });
        return true;
    };

    // Cambiar un campo quita su error y el aviso de "guardado".
    const setField = (key) => (value) => {
        setForm((current) => ({ ...current, [key]: value }));
        setErrors((current) => {
            if (!(key in current)) return current;
            const next = { ...current };
            delete next[key];
            return next;
        });
        setNotice(null);
    };

    // Pone en pantalla el producto que devolvió el servidor.
    const applySaved = (saved, message) => {
        setProduct(saved);
        setForm(formFrom(saved));
        setErrors({});
        setSaveError("");
        setNotice(message ? { kind: "success", text: message } : null);
    };

    const handleSave = async () => {
        if (busy || isNew || !isDirty) return;
        setBusy("save");
        setSaveError("");
        setActionError("");
        setNotice(null);
        try {
            const data = await updateProduct(product.id, {
                ...form,
                options: optionsBody(product),
                variants: variantsBody(product),
            });
            applySaved(data.product, data.message);
        } catch (error) {
            if (isExpired(error)) return;
            const found = error.errors ?? {};
            setErrors(found);
            // Errores de opciones o variantes: todavía no tienen campo en
            // pantalla (llegan en el 7b), así que se dicen en la barra.
            const unplaced = Object.entries(found)
                .filter(([key]) => key.startsWith("options") || key.startsWith("variants"))
                .map(([, text]) => text);
            setSaveError([error.message, ...unplaced].join(" "));
            // El foco va al primer campo con error, para corregirlo sin buscarlo.
            requestAnimationFrame(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus());
        } finally {
            setBusy(null);
        }
    };

    const discard = () => {
        setForm(savedForm);
        setErrors({});
        setSaveError("");
    };

    // Archivar y desarchivar devuelven el producto guardado: lo escrito sin
    // guardar se perdería, así que antes se pregunta.
    const runAction = async (kind, request) => {
        if (busy || !confirmDiscard()) return;
        setBusy(kind);
        setActionError("");
        setNotice(null);
        try {
            const data = await request(product.id);
            applySaved(data.product, data.message);
        } catch (error) {
            if (!isExpired(error)) setActionError(error.message);
        } finally {
            setBusy(null);
        }
    };

    const handleDelete = async () => {
        if (busy) return;
        const question = isDirty
            ? `¿Borrar el producto «${product.name}»? Se perderán también los cambios sin guardar. No se puede deshacer.`
            : `¿Borrar el producto «${product.name}»? No se puede deshacer.`;
        if (!window.confirm(question)) return;
        setBusy("delete");
        setActionError("");
        setNotice(null);
        try {
            const data = await deleteProduct(product.id);
            setLeaving(data.message);
        } catch (error) {
            if (isExpired(error)) return;
            setActionError(error.message);
            // 409: se vendió mientras tanto. Se recarga lo guardado para que la
            // sección ofrezca archivar (lo escrito en el formulario se conserva).
            if (error.status === 409) {
                getAdminProduct(product.id)
                    .then((data) => setProduct(data.product))
                    .catch(() => {});
            }
            setBusy(null);
        }
    };

    if (loaded.status === "error" && loaded.error?.status === 401) return <Navigate to="/admin/entrar" replace />;
    if (categories.status === "error" && categories.error?.status === 401) {
        return <Navigate to="/admin/entrar" replace />;
    }
    if (loaded.status === "error" && loaded.error?.status === 404) return <ProductNotFound />;

    const title = isNew ? "Nuevo producto" : (product?.name ?? "Producto");
    const archived = product?.archived_at != null;
    const showNotice = !isDirty && notice !== null;

    return (
        <div className={isDirty || showNotice ? "pb-40 sm:pb-24" : ""}>
            <nav aria-label="Migas" className="text-sm text-muted">
                <ol className="flex flex-wrap items-center gap-x-1.5">
                    <li>
                        <Link
                            to="/admin"
                            className="rounded-sm font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        >
                            Inventario
                        </Link>
                    </li>
                    <li aria-hidden="true">»</li>
                    <li aria-current="page" className="min-w-0 wrap-break-word">
                        {title}
                    </li>
                </ol>
            </nav>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
                <div className="flex min-w-0 flex-wrap items-center gap-3">
                    <h1 className="min-w-0 wrap-break-word text-3xl font-semibold uppercase lg:text-4xl">{title}</h1>
                    {product && <StatusDot status={product.status} />}
                </div>
                {/* Solo si la tienda lo muestra; en otra pestaña, para no dejar el panel. */}
                {product?.status === "visible" && (
                    <Button
                        to={`/producto/${product.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="outline"
                        className="gap-2 px-6 py-2.5"
                    >
                        <ExternalIcon />
                        Ver en la tienda
                        <span className="sr-only"> (se abre en otra pestaña)</span>
                    </Button>
                )}
            </div>

            {(loaded.status === "loading" || categories.status === "loading") && (
                <p role="status" className="mt-6 text-muted">
                    Cargando el producto…
                </p>
            )}
            {(loaded.status === "error" || categories.status === "error") && <LoadError what="el producto" />}

            {isReady && (
                // Escritorio (xl): datos a la izquierda; a la derecha, Estado y
                // Categoría arriba, Resumen y "Borrar o archivar" debajo.
                // Móvil: una columna en el orden del código (Estado y Categoría
                // primero, como en la maqueta). grid-rows-[auto_1fr] evita un
                // hueco entre los dos grupos de la derecha.
                // Sin botón de enviar dentro: se guarda solo con "Guardar cambios"
                // de la barra, para que un Enter sin querer no guarde todo.
                <form
                    ref={formRef}
                    noValidate
                    onSubmit={(event) => event.preventDefault()}
                    className="mt-6 grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_18rem] xl:grid-rows-[auto_1fr]"
                >
                    <div className="flex min-w-0 flex-col gap-5 xl:col-start-2 xl:row-start-1">
                        <ProductStatus form={form} errors={errors} archived={archived} setField={setField} />
                        <ProductCategory
                            value={form.category_id}
                            error={errors.category_id}
                            categories={categories.data.categories}
                            onChange={setField("category_id")}
                        />
                    </div>

                    <div className="flex min-w-0 flex-col gap-5 xl:col-start-1 xl:row-span-2 xl:row-start-1">
                        <ProductDetails
                            form={form}
                            errors={errors}
                            isNew={isNew}
                            computedCardSubtitle={product?.computed_card_subtitle ?? ""}
                            setField={setField}
                        />
                        {/* Provisional del 7a: el 7b pone aquí Opciones y Variantes. */}
                        <FormSection title="Opciones y variantes">
                            <p className="text-sm">
                                {isNew
                                    ? "Esta sección está en preparación. Un producto necesita al menos una variante con su SKU y su precio, así que todavía no se puede guardar un producto nuevo."
                                    : "Esta sección está en preparación. Mientras tanto, el precio y las existencias se cambian desde el Inventario."}
                            </p>
                        </FormSection>
                    </div>

                    {product && (
                        <div className="flex min-w-0 flex-col gap-5 xl:col-start-2 xl:row-start-2">
                            <ProductSummary product={product} />
                            <ProductRemoval
                                product={product}
                                busy={busy}
                                error={actionError}
                                onDelete={handleDelete}
                                onArchive={() => runAction("archive", archiveProduct)}
                                onUnarchive={() => runAction("unarchive", unarchiveProduct)}
                            />
                        </div>
                    )}
                </form>
            )}

            {isDirty && (
                <SaveBar
                    message="Tienes cambios sin guardar"
                    saveLabel="Guardar cambios"
                    saving={busy === "save"}
                    saveDisabled={isNew || busy !== null}
                    error={isNew ? "Un producto nuevo se podrá guardar cuando estén listas las opciones y variantes." : saveError}
                    onDiscard={discard}
                    onSave={handleSave}
                />
            )}

            {/* Resultado de guardar, archivar o desarchivar, en el mismo lugar que
                la barra (donde se pulsó Guardar). role="status": se lee al aparecer. */}
            <div role="status" className="empty:hidden">
                {showNotice && (
                    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface lg:left-64">
                        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-10">
                            <p className="flex items-start gap-2.5 text-sm font-semibold">
                                <CheckIcon />
                                <span>{notice.text}</span>
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

// El id no existe (o se borró en otra pestaña): el aviso va dentro del panel.
const ProductNotFound = () => (
    <>
        <h1 className="text-3xl font-semibold uppercase lg:text-4xl">Producto no encontrado</h1>
        <p className="mt-2 text-muted">Puede que se haya borrado. Búscalo en el Inventario.</p>
        <Button to="/admin" className="mt-6">
            Ir al inventario
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
    className: "shrink-0",
});

const ExternalIcon = () => (
    <svg {...iconProps(16, 2)}>
        <path d="M14 4h6v6" />
        <path d="M20 4l-9 9" />
        <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
    </svg>
);

const CheckIcon = () => (
    <svg {...iconProps(20, 2.2)} className="shrink-0 text-accent">
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12.5l2.5 2.5L16 9.5" />
    </svg>
);

const CloseIcon = () => (
    <svg {...iconProps(18, 2.2)}>
        <path d="M6 6l12 12M18 6L6 18" />
    </svg>
);
