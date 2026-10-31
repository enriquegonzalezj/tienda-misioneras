import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { createCategory, deleteCategory, getAdminCategories, moveCategory, updateCategory } from "../../api/admin";
import { AlertIcon, FIELD, FormField, PrefixInput, TEXTAREA } from "../../components/admin/FormField";
import { Button } from "../../components/Button";
import { LoadError } from "../../components/LoadError";
import { useRequest } from "../../hooks/useRequest";
import { useUnsavedChanges } from "../../hooks/useUnsavedChanges";

// Categorías del panel (/admin/categorias), tarea 2.1, paso 4b.
//
// A la izquierda (arriba en móvil), la lista en el orden de la Tienda, con
// flechas para subir y bajar. A la derecha (abajo en móvil), el formulario de
// la categoría elegida o de una nueva. Usa las rutas /api/admin/categories del
// paso 4a: cada cambio devuelve el árbol completo, así la lista siempre queda
// igual que en el servidor.
//
// Las reglas las comprueba el servidor (nombre y dirección sin repetir, dos
// niveles, regla A). Aquí solo se avisa antes cuando ya se sabe la respuesta
// (borrar desactivado con el motivo, madres que no admiten subcategorías), y
// se muestran los errores que manda el servidor debajo de cada campo.
//
// La imagen de la tarjeta en Inicio se añade en el paso 8, con las fotos.

// Los mismos límites que el servidor (admin_catalog.py).
const NAME_MAX = 80;
const SLUG_MAX = 100;
const CARD_TEXT_MAX = 80;
const SEO_DESCRIPTION_MAX = 160;

const EMPTY_FORM = { name: "", slug: "", parent_id: null, card_text: "", seo_description: "" };

const plural = (count, singular, pluralForm) => `${count} ${count === 1 ? singular : pluralForm}`;

const formFrom = (category) => ({
    name: category.name,
    slug: category.slug,
    parent_id: category.parent_id,
    card_text: category.card_text ?? "",
    seo_description: category.seo_description ?? "",
});

const sameForm = (a, b) => Object.keys(EMPTY_FORM).every((key) => a[key] === b[key]);

// El árbol del servidor como lista en el orden en que se dibuja, con lo que
// necesita cada fila: si es la primera o la última de su grupo (flechas) y el
// nombre de su madre.
const flatten = (tree) =>
    tree.flatMap((category, index) => [
        { ...category, isFirst: index === 0, isLast: index === tree.length - 1, parentName: null },
        ...category.children.map((child, childIndex) => ({
            ...child,
            children: [],
            isFirst: childIndex === 0,
            isLast: childIndex === category.children.length - 1,
            parentName: category.name,
        })),
    ]);

// Por qué no se puede borrar (el mismo texto que da el servidor), o null.
const deleteBlockedReason = (category) => {
    if (category.children.length) {
        return `No se puede borrar: tiene ${plural(category.children.length, "subcategoría", "subcategorías")}. Solo se borra una categoría vacía.`;
    }
    if (category.own_product_count) {
        return `No se puede borrar: tiene ${plural(category.own_product_count, "producto", "productos")} (contando ocultos y archivados). Muévelos antes a otra categoría.`;
    }
    return null;
};

// Texto bajo el nombre en la lista.
const rowDetail = (category) => {
    if (category.children.length) {
        return `${plural(category.product_count, "producto", "productos")} en ${plural(category.children.length, "subcategoría", "subcategorías")}`;
    }
    return category.own_product_count ? plural(category.own_product_count, "producto", "productos") : "Sin productos";
};

const summary = (tree) => {
    if (!tree.length) return "Todavía no hay categorías.";
    const subcategories = tree.reduce((total, category) => total + category.children.length, 0);
    const main = plural(tree.length, "categoría", "categorías");
    return subcategories ? `${main} y ${plural(subcategories, "subcategoría", "subcategorías")}` : main;
};

export const Categories = () => {
    const navigate = useNavigate();
    const loaded = useRequest(getAdminCategories);
    // Árbol más reciente: el de la carga inicial hasta el primer cambio, después
    // el que devuelve el servidor con cada cambio.
    const [savedTree, setSavedTree] = useState(null);
    const tree = savedTree ?? loaded.data?.categories ?? null;
    const rows = useMemo(() => (tree ? flatten(tree) : []), [tree]);

    // Qué hay en el formulario: { mode: "edit", id } o { mode: "new", parentId }.
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

    const current = selection?.mode === "edit" ? rows.find((row) => row.id === selection.id) : null;
    const newParent = selection?.mode === "new" && selection.parentId ? rows.find((row) => row.id === selection.parentId) : null;

    const openEdit = (category) => {
        const values = formFrom(category);
        setSelection({ mode: "edit", id: category.id });
        setForm(values);
        setSavedForm(values);
        setErrors({});
    };

    const openNew = (parentId) => {
        const values = { ...EMPTY_FORM, parent_id: parentId };
        setSelection({ mode: "new", parentId });
        setForm(values);
        setSavedForm(values);
        setErrors({});
    };

    // Al abrir la pantalla: la primera categoría, o una nueva si no hay ninguna.
    useEffect(() => {
        if (loaded.status !== "ready" || selection !== null) return;
        const first = loaded.data.categories[0];
        if (first) openEdit(flatten(loaded.data.categories)[0]);
        else openNew(null);
        // Solo al terminar la carga inicial.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loaded.status]);

    // Lleva la vista y el foco al formulario. En escritorio suele estar ya a la
    // vista; en móvil está debajo de la lista.
    const revealForm = () => {
        requestAnimationFrame(() => {
            const heading = headingRef.current;
            if (!heading) return;
            const { top } = heading.getBoundingClientRect();
            if (top < 0 || top > window.innerHeight - 160) heading.scrollIntoView({ block: "start", behavior: "smooth" });
            heading.focus({ preventScroll: true });
        });
    };

    // Elegir otra categoría o empezar una nueva, avisando si hay cambios sin guardar.
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
            slug: form.slug.trim(),
            parent_id: form.parent_id,
            card_text: form.card_text.trim(),
            seo_description: form.seo_description.trim(),
        };
        try {
            const data =
                selection.mode === "edit" ? await updateCategory(selection.id, body) : await createCategory(body);
            const nextRows = flatten(data.categories);
            // La nueva es la que no estaba antes en la lista.
            const saved =
                selection.mode === "edit"
                    ? nextRows.find((row) => row.id === selection.id)
                    : nextRows.find((row) => !rows.some((old) => old.id === row.id));
            setSavedTree(data.categories);
            if (saved) openEdit(saved);
            setNotice({ kind: "success", text: data.message });
        } catch (error) {
            handleError(error, (text) => {
                setErrors(error.errors ?? {});
                setNotice({ kind: "error", text });
                // El foco va al primer campo con error, para corregirlo sin buscarlo.
                requestAnimationFrame(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus());
            });
        } finally {
            setBusy(null);
        }
    };

    const handleDelete = async () => {
        if (busy || !current) return;
        if (!window.confirm(`¿Borrar la categoría «${current.name}»? No se puede deshacer.`)) return;
        setBusy("delete");
        setNotice(null);
        try {
            const data = await deleteCategory(current.id);
            setSavedTree(data.categories);
            const first = flatten(data.categories)[0];
            if (first) openEdit(first);
            else openNew(null);
            setNotice({ kind: "success", text: data.message });
        } catch (error) {
            handleError(error, (text) => setNotice({ kind: "error", text }));
        } finally {
            setBusy(null);
        }
    };

    // Flechas de orden. No tocan el formulario: se pueden usar con cambios sin guardar.
    const handleMove = async (category, direction) => {
        if (busy) return;
        setBusy("move");
        setListError("");
        try {
            const data = await moveCategory(category.id, direction);
            setSavedTree(data.categories);
            // La fila cambió de sitio: el foco vuelve a su flecha (o a la otra,
            // si esa quedó desactivada en el borde) para seguir con el teclado.
            requestAnimationFrame(() => {
                const same = document.querySelector(`[data-move="${category.id}-${direction}"]`);
                const other = document.querySelector(
                    `[data-move="${category.id}-${direction === "up" ? "down" : "up"}"]`
                );
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
                    <h1 className="text-3xl font-semibold uppercase lg:text-4xl">Categorías</h1>
                    {tree && <p className="mt-1 text-muted">{summary(tree)}</p>}
                </div>
                {tree && (
                    <Button onClick={() => choose(() => openNew(null))} className="gap-2">
                        <PlusIcon />
                        Nueva categoría
                    </Button>
                )}
            </div>

            {loaded.status === "loading" && (
                <p role="status" className="mt-6 text-muted">
                    Cargando las categorías…
                </p>
            )}
            {loaded.status === "error" && <LoadError what="las categorías" />}

            {tree && selection && (
                <div className="mt-6 grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                    <CategoryList
                        rows={rows}
                        selection={selection}
                        error={listError}
                        onEdit={(category) => choose(() => openEdit(category))}
                        onNewChild={(parent) => choose(() => openNew(parent.id))}
                        onMove={handleMove}
                    />

                    <section
                        aria-labelledby="category-form-title"
                        className="rounded-xl border border-line bg-surface p-5 sm:p-6"
                    >
                        <h2
                            id="category-form-title"
                            ref={headingRef}
                            tabIndex={-1}
                            className="scroll-mt-4 text-xl font-semibold uppercase tracking-wide focus:outline-none"
                        >
                            {current
                                ? `Editar ${savedForm.name}`
                                : newParent
                                  ? `Nueva subcategoría en ${newParent.name}`
                                  : "Nueva categoría"}
                        </h2>

                        <CategoryForm
                            formRef={formRef}
                            form={form}
                            errors={errors}
                            tree={tree}
                            current={current}
                            setField={setField}
                            setParent={(parentId) => setForm((values) => ({ ...values, parent_id: parentId }))}
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

const CategoryList = ({ rows, selection, error, onEdit, onNewChild, onMove }) => (
    <section aria-label="Lista de categorías" className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex justify-between px-4 pb-2.5 pt-3 text-xs font-bold uppercase tracking-wider text-muted">
            <span>Nombre</span>
            <span>Orden</span>
        </div>

        {error && (
            <p role="alert" className="mx-3 mb-3 flex items-start gap-2 rounded-lg border border-alert bg-alert-soft px-3 py-2.5 text-sm font-semibold">
                <AlertIcon />
                <span>{error}</span>
            </p>
        )}

        {!rows.length && <p className="border-t border-line px-4 py-6 text-muted">Todavía no hay categorías.</p>}

        <ul>
            {rows.map((row) => {
                const selected = selection.mode === "edit" && selection.id === row.id;
                const isChild = row.parentName !== null;
                // "+ Subcategoría" va al final del grupo de cada principal: tras su
                // última subcategoría, o tras ella si no tiene. Solo si no tiene
                // productos propios (regla A del paso 4a).
                const parent = isChild ? rows.find((other) => other.id === row.parent_id) : row;
                const groupEnds = isChild ? row.isLast : row.children.length === 0;
                const canAddChild = groupEnds && parent && parent.own_product_count === 0;
                return (
                    <li key={row.id}>
                        <div className={`flex items-center gap-1.5 border-t border-line py-2 pl-4 pr-2 ${selected ? "bg-surface-alt" : ""}`}>
                            <div className={`flex min-w-0 flex-1 items-center gap-2.5 ${isChild ? "pl-5" : ""}`}>
                                {isChild && <ChildIcon />}
                                <div className="min-w-0">
                                    <button
                                        type="button"
                                        onClick={() => onEdit(row)}
                                        aria-current={selected ? "true" : undefined}
                                        className={`rounded-sm text-left font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${selected ? "underline" : ""}`}
                                    >
                                        {row.name}
                                    </button>
                                    <p className="text-sm text-muted">{rowDetail(row)}</p>
                                </div>
                            </div>
                            <MoveButton row={row} direction="up" disabled={row.isFirst} onMove={onMove} />
                            <MoveButton row={row} direction="down" disabled={row.isLast} onMove={onMove} />
                        </div>
                        {canAddChild && (
                            <div className="pb-2.5 pl-8 pr-3">
                                <button
                                    type="button"
                                    onClick={() => onNewChild(parent)}
                                    className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-1.5 text-sm font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                                >
                                    <PlusIcon size={16} />
                                    Subcategoría en {parent.name}
                                </button>
                            </div>
                        )}
                    </li>
                );
            })}
        </ul>

        <p className="border-t border-line px-4 pb-4 pt-3 text-sm text-muted">
            El orden es el mismo de la Tienda. Las categorías sin productos visibles no se ven en la tienda.
        </p>
    </section>
);

const MoveButton = ({ row, direction, disabled, onMove }) => (
    <button
        type="button"
        data-move={`${row.id}-${direction}`}
        disabled={disabled}
        onClick={() => onMove(row, direction)}
        aria-label={`${direction === "up" ? "Subir" : "Bajar"} ${row.name}`}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent"
    >
        <svg {...iconProps(18, 2)}>
            <path d={direction === "up" ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
        </svg>
    </button>
);

const CategoryForm = ({ formRef, form, errors, tree, current, setField, setParent, onSubmit, onDelete, notice, busy }) => {
    const hasChildren = Boolean(current?.children.length);
    const blockedReason = current ? deleteBlockedReason(current) : null;
    // Madres posibles: las principales, menos ella misma.
    const parents = tree.filter((category) => category.id !== current?.id);
    const isMain = form.parent_id === null;

    return (
        <form ref={formRef} onSubmit={onSubmit} noValidate className="mt-5 flex flex-col gap-5">
            <FormField label="Nombre" error={errors.name} length={form.name.length} maxLength={NAME_MAX}>
                {(field) => <input {...field} type="text" value={form.name} onChange={setField("name")} className={FIELD} />}
            </FormField>

            <FormField
                label="Dirección en la tienda"
                error={errors.slug}
                help={
                    current
                        ? "Si la cambias, los enlaces que ya se compartieron dejarán de funcionar. Si la dejas vacía, se crea a partir del nombre."
                        : "Si la dejas vacía, se crea a partir del nombre."
                }
            >
                {(field) => (
                    <PrefixInput
                        {...field}
                        maxLength={SLUG_MAX}
                        prefix="/categoria/"
                        type="text"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        value={form.slug}
                        onChange={setField("slug")}
                    />
                )}
            </FormField>

            <FormField
                label="Va dentro de"
                error={errors.parent_id}
                help={
                    hasChildren
                        ? "No se puede convertir en subcategoría porque tiene subcategorías."
                        : "Las categorías con productos propios no admiten subcategorías: mueve antes sus productos a otra categoría."
                }
            >
                {(field) => (
                    <select
                        {...field}
                        value={form.parent_id ?? ""}
                        disabled={hasChildren}
                        onChange={(event) => setParent(event.target.value === "" ? null : Number(event.target.value))}
                        className={FIELD}
                    >
                        <option value="">Ninguna: es una categoría principal</option>
                        {parents.map((category) => {
                            // La madre actual siempre se puede dejar como está.
                            const blocked = category.own_product_count > 0 && category.id !== current?.parent_id;
                            return (
                                <option key={category.id} value={category.id} disabled={blocked}>
                                    {blocked ? `${category.name} (tiene productos)` : category.name}
                                </option>
                            );
                        })}
                    </select>
                )}
            </FormField>

            {/* Solo las principales tienen tarjeta en Inicio. */}
            {isMain && (
                <FormField
                    label="Texto de la tarjeta en Inicio"
                    optional
                    error={errors.card_text}
                    length={form.card_text.length}
                    maxLength={CARD_TEXT_MAX}
                >
                    {(field) => (
                        <input {...field} type="text" value={form.card_text} onChange={setField("card_text")} className={FIELD} />
                    )}
                </FormField>
            )}

            <FormField
                label="Descripción para Google"
                error={errors.seo_description}
                help="Una o dos frases que Google puede mostrar bajo el nombre en sus resultados."
                length={form.seo_description.length}
                maxLength={SEO_DESCRIPTION_MAX}
            >
                {(field) => (
                    <textarea
                        {...field}
                        rows={3}
                        value={form.seo_description}
                        onChange={setField("seo_description")}
                        className={TEXTAREA}
                    />
                )}
            </FormField>

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
                                aria-describedby={blockedReason ? "category-delete-reason" : undefined}
                            >
                                {busy === "delete" ? "Borrando…" : "Borrar categoría"}
                            </Button>
                            {blockedReason && (
                                <p id="category-delete-reason" className="mt-2 text-sm text-muted">
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

const ChildIcon = () => (
    <svg {...iconProps(14, 2)} className="shrink-0 text-field">
        <path d="M6 4v8a2 2 0 0 0 2 2h10" />
    </svg>
);

const CheckIcon = () => (
    <svg {...iconProps(20, 2.2)} className="shrink-0 text-accent">
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12.5l2.5 2.5L16 9.5" />
    </svg>
);
