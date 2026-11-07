import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import {
    archiveProduct,
    createProduct,
    deleteProduct,
    getAdminCategories,
    getAdminProduct,
    unarchiveProduct,
    updateProduct,
} from "../../api/admin";
import { ProductDetails } from "../../components/admin/ProductDetails";
import { ProductOptions } from "../../components/admin/ProductOptions";
import { ProductPhotos } from "../../components/admin/ProductPhotos";
import { ProductCategory, ProductRemoval, ProductStatus, ProductSummary } from "../../components/admin/ProductSidebar";
import { ProductVariants } from "../../components/admin/ProductVariants";
import { SaveBar } from "../../components/admin/SaveBar";
import { StatusDot } from "../../components/admin/StatusDot";
import { Button } from "../../components/Button";
import { LoadError } from "../../components/LoadError";
import { useRequest } from "../../hooks/useRequest";
import { useUnsavedChanges } from "../../hooks/useUnsavedChanges";
import { blankVariant, buildVariants, comboKey, missingCount, valueKeysOf, variantValues } from "../../utils/productVariants";
import { AdminNotFound } from "./AdminLayout";

// Formulario de producto del panel, tarea 2.1, pasos 7a y 7b.
//   /admin/productos/nuevo   producto nuevo
//   /admin/productos/<id>    editar uno que existe
//
// Una sola página con secciones y un solo "Guardar cambios": el servidor
// recibe el formulario entero (datos, estado, categoría, opciones y
// variantes) y guarda todo o nada (rutas /api/admin/products del paso 5b).
// Las reglas las comprueba el servidor; sus errores salen bajo cada campo.
//
// Las fotos (paso 8) van aparte: se guardan en el momento (opción A del 5 nov)
// y no son parte de `form` ni de "Guardar cambios". Cuando cambian, la lista
// nueva se pone en `product` (lo guardado), que bodyOf no mira: por eso no
// aparecen como cambios sin guardar y lo escrito en el formulario se conserva.
//
// Las variantes salen de las opciones (utils/productVariants.js): cada cambio
// en Opciones vuelve a armar la lista, conserva los datos de las combinaciones
// que ya existían y solo crea las que llevan un valor nuevo. Una combinación
// quitada a mano no vuelve sola, ni después de guardar.

const TEXT_FIELDS = ["name", "slug", "subtitle", "card_subtitle", "description", "seo_description"];

// Formulario vacío para un producto nuevo: sin opciones, una variante única.
const newForm = () => ({
    ...Object.fromEntries(TEXT_FIELDS.map((key) => [key, ""])),
    category_id: null,
    is_active: false,
    is_featured: false,
    options: [],
    variants: [blankVariant([])],
});

// Lo guardado, en la forma del formulario. Las keys salen de los ids, así que
// dos llamadas dan lo mismo. Las variantes llegan con sus valores como texto
// y aquí pasan a apuntar a la key de cada valor.
const formFrom = (product) => {
    const options = product.options.map((option) => ({
        key: `o${option.id}`,
        id: option.id,
        name: option.name,
        has_swatch: option.has_swatch,
        values: option.values.map((value) => ({
            key: `v${value.id}`,
            id: value.id,
            value: value.value,
            swatch_hex: value.swatch_hex,
        })),
    }));
    return {
        ...Object.fromEntries(TEXT_FIELDS.map((key) => [key, product[key]])),
        category_id: product.category_id,
        is_active: product.is_active,
        is_featured: product.is_featured,
        options,
        variants: product.variants.map((variant) => ({
            key: `variant-${variant.id}`,
            id: variant.id,
            valueKeys: variant.values.map(
                (text, index) => options[index]?.values.find((value) => value.value === text)?.key ?? ""
            ),
            sku: variant.sku,
            price: variant.price,
            cost: variant.cost ?? "",
            stock: String(variant.stock),
            // Las existencias que se veían al abrir (tarea 4.5): el servidor solo
            // escribe las existencias si cambian, y compara con estas.
            savedStock: variant.stock,
            is_active: variant.is_active,
            has_sales: variant.has_sales,
            units_sold: variant.units_sold,
        })),
    };
};

// Lo que se manda al servidor. También sirve para saber si hay cambios:
// se compara el de la pantalla con el de lo guardado.
const bodyOf = (form) => ({
    ...Object.fromEntries(TEXT_FIELDS.map((key) => [key, form[key]])),
    category_id: form.category_id,
    is_active: form.is_active,
    is_featured: form.is_featured,
    options: form.options.map((option) => ({
        id: option.id,
        name: option.name,
        has_swatch: option.has_swatch,
        // Sin círculo de color no se manda ninguno (el servidor tampoco lo guarda).
        values: option.values.map((value) => ({
            id: value.id,
            value: value.value,
            swatch_hex: option.has_swatch ? value.swatch_hex : null,
        })),
    })),
    variants: form.variants.map((variant) => {
        const stock = variant.stock.trim();
        return {
            id: variant.id,
            values: variantValues(variant, form.options),
            sku: variant.sku,
            price: variant.price,
            cost: variant.cost.trim() === "" ? null : variant.cost,
            // Existencias como número entero; si no lo es, va el texto y el
            // servidor dice qué escribir.
            stock: /^\d+$/.test(stock) ? Number(stock) : stock,
            // Solo en las que ya existen (las nuevas no tienen savedStock y JSON
            // deja fuera lo que vale undefined).
            previous_stock: variant.id ? variant.savedStock : undefined,
            is_active: variant.is_active,
        };
    }),
});

const sameBody = (a, b) => JSON.stringify(bodyOf(a)) === JSON.stringify(bodyOf(b));

// Quita los errores cuyo nombre empieza por alguno de los prefijos.
const withoutErrors = (errors, prefixes) => {
    const next = Object.fromEntries(
        Object.entries(errors).filter(([key]) => !prefixes.some((prefix) => key === prefix || key.startsWith(`${prefix}.`)))
    );
    return Object.keys(next).length === Object.keys(errors).length ? errors : next;
};

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
    const [blank] = useState(newForm); // lo "guardado" de un producto nuevo
    const [form, setForm] = useState(blank);
    // Variantes quitadas a mano en esta visita: { comboKey: variante }. Solo
    // guardan sus datos, para que "Volver a ponerlas" las devuelva tal cual.
    const [removed, setRemoved] = useState({});
    const [optionsBlocked, setOptionsBlocked] = useState(""); // cambio rechazado en Opciones
    const [errors, setErrors] = useState({});
    const [saveError, setSaveError] = useState("");
    const [actionError, setActionError] = useState(""); // de borrar, archivar o desarchivar
    // { kind: "success", text }. Puede llegar en el estado de la navegación
    // ("Producto creado" al pasar de nuevo a editar).
    const [notice, setNotice] = useState(() =>
        location.state?.notice ? { kind: "success", text: location.state.notice } : null
    );
    const [busy, setBusy] = useState(null); // "save", "delete", "archive" o "unarchive"
    // { to, notice }: a dónde ir tras crear o borrar, y el aviso que se lleva.
    const [leaving, setLeaving] = useState(null);
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

    const savedForm = useMemo(() => (product ? formFrom(product) : blank), [product, blank]);
    const isReady = (isNew || product !== null) && categories.status === "ready";
    const isDirty = isReady && leaving === null && !sameBody(form, savedForm);
    const confirmDiscard = useUnsavedChanges(isDirty);

    // Tras crear (a la ficha nueva) o borrar (al Inventario), ya sin preguntar
    // por cambios: leaving apaga isDirty en el dibujo anterior. Con replace,
    // Atrás no vuelve a "nuevo" ni a un producto que ya no existe.
    useEffect(() => {
        if (leaving !== null) navigate(leaving.to, { replace: true, state: { notice: leaving.notice } });
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

    // Opciones nuevas: se vuelven a armar las variantes. Si se perdiera una
    // variante con ventas, el cambio no se aplica y se explica por qué.
    const updateOptions = (options) => {
        const next = buildVariants(options, form.variants, valueKeysOf(form.options));
        const sold = next.dropped.filter((variant) => variant.has_sales);
        if (sold.length) {
            const skus = sold.map((variant) => variant.sku).join(", ");
            setOptionsBlocked(
                sold.length === 1
                    ? `No se puede: se quitaría la variante ${skus}, que tiene ventas. Desactívala en Variantes.`
                    : `No se puede: se quitarían las variantes ${skus}, que tienen ventas. Desactívalas en Variantes.`
            );
            return;
        }
        setOptionsBlocked("");
        setForm((current) => ({ ...current, options, variants: next.variants }));
        // Los errores de opciones y variantes van por posición, que puede haber cambiado.
        setErrors((current) => withoutErrors(current, ["options", "variants"]));
        setNotice(null);
    };

    const editVariant = (index, field, value) => {
        setForm((current) => ({
            ...current,
            variants: current.variants.map((variant, i) => (i === index ? { ...variant, [field]: value } : variant)),
        }));
        setErrors((current) => withoutErrors(current, [`variants.${index}.${field}`, "variants"]));
        setNotice(null);
    };

    const removeVariant = (index) => {
        const variant = form.variants[index];
        setRemoved((current) => ({ ...current, [comboKey(variant.valueKeys)]: variant }));
        setForm((current) => ({ ...current, variants: current.variants.filter((_, i) => i !== index) }));
        setErrors((current) => withoutErrors(current, ["variants"]));
        setNotice(null);
    };

    // Pone todas las combinaciones que faltan, en su lugar: las quitadas en
    // esta visita con sus datos; las de antes, en blanco.
    const restoreVariants = () => {
        const next = buildVariants(form.options, [...form.variants, ...Object.values(removed)]);
        setForm((current) => ({ ...current, variants: next.variants }));
        setRemoved({});
        setErrors((current) => withoutErrors(current, ["variants"]));
        setNotice(null);
    };

    // "Aplicar a todas": fields trae price, cost o los dos.
    const applyToAll = (fields) => {
        setForm((current) => ({
            ...current,
            variants: current.variants.map((variant) => ({ ...variant, ...fields })),
        }));
        setErrors((current) =>
            withoutErrors(
                current,
                Object.keys(fields).flatMap((field) => form.variants.map((_, i) => `variants.${i}.${field}`))
            )
        );
        setNotice(null);
    };

    // Fotos nuevas (subir, mover, quitar o texto alternativo): solo cambia lo
    // guardado, nunca lo que hay en el formulario.
    const setImages = useCallback((images) => setProduct((current) => ({ ...current, images })), []);

    // Pone en pantalla el producto que devolvió el servidor.
    const applySaved = (saved, message) => {
        setProduct(saved);
        setForm(formFrom(saved));
        setRemoved({});
        setOptionsBlocked("");
        setErrors({});
        setSaveError("");
        setNotice(message ? { kind: "success", text: message } : null);
    };

    const handleSave = async () => {
        if (busy || !isDirty) return;
        setBusy("save");
        setSaveError("");
        setActionError("");
        setNotice(null);
        try {
            if (isNew) {
                const data = await createProduct(bodyOf(form));
                setLeaving({ to: `/admin/productos/${data.product.id}`, notice: data.message });
                return;
            }
            const data = await updateProduct(product.id, bodyOf(form));
            applySaved(data.product, data.message);
        } catch (error) {
            if (isExpired(error)) return;
            setErrors(error.errors ?? {});
            setSaveError(error.message);
            // 409 de existencias: se vendió o se apartó algo mientras se editaba.
            // Lo escrito se conserva, pero se compara con las existencias
            // actuales: al guardar otra vez, el servidor ya no lo rechaza.
            const conflicts = error.status === 409 ? error.data?.stock_conflicts : null;
            if (Array.isArray(conflicts)) {
                const current = new Map(conflicts.map((conflict) => [conflict.id, conflict.stock]));
                setForm((previous) => ({
                    ...previous,
                    variants: previous.variants.map((variant) =>
                        current.has(variant.id) ? { ...variant, savedStock: current.get(variant.id) } : variant
                    ),
                }));
            }
            // El foco va al primer campo con error, para corregirlo sin buscarlo.
            // Se centra en pantalla: con focus() solo, el navegador lo deja en el
            // borde y la barra fija de guardar lo tapa (sobre todo en móvil).
            requestAnimationFrame(() => {
                const field = formRef.current?.querySelector('[aria-invalid="true"]');
                field?.focus({ preventScroll: true });
                field?.scrollIntoView({ block: "center" });
            });
        } finally {
            setBusy(null);
        }
    };

    const discard = () => {
        setForm(savedForm);
        setRemoved({});
        setOptionsBlocked("");
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
            setLeaving({ to: "/admin", notice: data.message });
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
                        <ProductPhotos
                            productId={product?.id ?? null}
                            images={product?.images ?? []}
                            onImagesChange={setImages}
                            onExpired={isExpired}
                        />
                        <ProductOptions
                            options={form.options}
                            errors={errors}
                            blocked={optionsBlocked}
                            onChange={updateOptions}
                        />
                        <ProductVariants
                            variants={form.variants}
                            options={form.options}
                            errors={errors}
                            removedCount={missingCount(form.options, form.variants)}
                            onEdit={editVariant}
                            onRemove={removeVariant}
                            onRestore={restoreVariants}
                            onApplyAll={applyToAll}
                        />
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
                    message={isNew ? "Producto nuevo sin guardar" : "Tienes cambios sin guardar"}
                    saveLabel={isNew ? "Crear producto" : "Guardar cambios"}
                    saving={busy === "save"}
                    saveDisabled={busy !== null}
                    error={saveError}
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
