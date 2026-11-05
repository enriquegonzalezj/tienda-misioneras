import { useEffect, useId, useRef, useState } from "react";
import { moveProductImage, removeProductImage, updateProductImage, uploadProductImage } from "../../api/admin";
import { IMAGE_ACCEPT, IMAGE_HINT, MAX_PRODUCT_IMAGES, imageFileProblem } from "../../utils/imageFiles";
import { AlertIcon } from "./FormField";
import { FormSection } from "./ProductDetails";

// Formulario de producto (tarea 2.1, paso 8): la sección "Fotos".
//
// Opción A (5 nov): cada acción se guarda en el momento, aparte de "Guardar
// cambios" (subir, texto alternativo, mover y quitar). Por eso las fotos no
// van en el formulario de la página ni cuentan como cambios sin guardar: la
// página solo recibe la lista nueva con onImagesChange(images) y la guarda en
// lo "guardado" del producto. En un producto nuevo no se puede subir todavía.
//
// Las peticiones van en fila, una detrás de otra: si se escribe un texto
// alternativo y enseguida se mueve una foto, la respuesta de mover ya trae el
// texto nuevo (si fueran a la vez, podría llegar antes una respuesta vieja).
//
// La cuadrícula depende del ancho de la sección (@container), no de la
// pantalla: 2 columnas en móvil, 3 desde 28rem y 4 desde 36rem.

const ALT_TEXT_MAX = 150; // el mismo que el servidor (admin_images.py)

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary";
const ICON_BUTTON =
    "inline-flex size-10 shrink-0 items-center justify-center rounded-lg hover:bg-surface-alt " +
    `disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${FOCUS}`;
const QUIET_BUTTON =
    "inline-flex min-h-10 items-center justify-center rounded-full px-2 text-sm font-semibold hover:underline " +
    `disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline ${FOCUS}`;
// Como FIELD (FormField.jsx), un poco más bajo. text-base en móvil: con menos
// de 16 px el iPhone acerca la pantalla al escribir; desde 28rem, text-sm.
const ALT_INPUT =
    "h-11 w-full rounded-lg border border-field bg-surface px-3 text-base text-primary @md:text-sm " +
    `aria-[invalid=true]:border-alert ${FOCUS}`;
// En móvil, botón de contorno a todo lo ancho; desde 28rem, recuadro punteado
// dentro de la cuadrícula, del tamaño de una foto (como en la maqueta).
const UPLOAD_BUTTON =
    "col-span-full flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-primary bg-surface " +
    "px-5 font-semibold text-primary hover:bg-surface-alt " +
    "@md:col-span-1 @md:aspect-square @md:flex-col @md:rounded-lg @md:border-dashed @md:border-field @md:p-3 " +
    "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-surface " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export const ProductPhotos = ({ productId, images, onImagesChange, onExpired }) => {
    const hintId = useId();
    const inputRef = useRef(null);
    const queue = useRef(Promise.resolve());
    const sectionRef = useRef(null);
    // Texto alternativo que se está escribiendo, por id de foto (lo guardado está en images).
    const [drafts, setDrafts] = useState({});
    // Por id de foto: "saving", "saved" o { error }.
    const [altStatus, setAltStatus] = useState({});
    const [uploading, setUploading] = useState(null); // { done, total } mientras se sube
    const [pending, setPending] = useState(0); // acciones en la fila
    const [message, setMessage] = useState(""); // resultado de la última acción
    const [problems, setProblems] = useState([]); // [{ name, text }] de la última subida
    // A dónde va el foco cuando la lista nueva ya está dibujada (tras mover o quitar).
    const focusNext = useRef(null);

    useEffect(() => {
        const target = focusNext.current;
        const root = sectionRef.current;
        if (!target || !root) return;
        focusNext.current = null;
        if (target === "upload") {
            root.querySelector("[data-upload]")?.focus();
            return;
        }
        // La foto cambió de sitio: el foco sigue a su flecha (o a la otra, si esa
        // quedó desactivada en el borde) para seguir con el teclado.
        const { id, direction } = target;
        const same = root.querySelector(`[data-move="${id}-${direction}"]`);
        const other = root.querySelector(`[data-move="${id}-${direction === "up" ? "down" : "up"}"]`);
        (same && !same.disabled ? same : other)?.focus();
    }, [images]);

    if (productId === null) {
        return (
            <FormSection title="Fotos" description="Crea el producto para agregar fotos.">
                {null}
            </FormSection>
        );
    }

    // Pone una acción en la fila. Con la sesión caducada (401), a Entrar.
    const enqueue = (action) => {
        setPending((count) => count + 1);
        const run = queue.current.then(action).catch((error) => {
            if (error?.status === 401) {
                onExpired(error);
                return;
            }
            throw error;
        });
        queue.current = run.catch(() => {}).finally(() => setPending((count) => count - 1));
        return run;
    };

    const room = MAX_PRODUCT_IMAGES - images.length;

    const handleFiles = (event) => {
        const files = Array.from(event.target.files ?? []);
        event.target.value = ""; // así se puede elegir otra vez el mismo archivo
        if (!files.length) return;
        setMessage("");
        const found = [];
        const valid = [];
        files.forEach((file) => {
            const text = imageFileProblem(file);
            if (text) found.push({ name: file.name, text });
            else valid.push(file);
        });
        const accepted = valid.slice(0, Math.max(room, 0));
        valid.slice(accepted.length).forEach((file) =>
            found.push({ name: file.name, text: `No cabe: el máximo es ${MAX_PRODUCT_IMAGES} fotos por producto.` })
        );
        setProblems(found);
        if (!accepted.length) return;

        setUploading({ done: 0, total: accepted.length });
        let added = 0;
        accepted.forEach((file, index) =>
            enqueue(async () => {
                setUploading({ done: index, total: accepted.length });
                try {
                    const data = await uploadProductImage(productId, file);
                    onImagesChange(data.images);
                    added += 1;
                } catch (error) {
                    if (error.status === 401) throw error;
                    setProblems((current) => [...current, { name: file.name, text: error.message }]);
                }
            })
                .catch(() => {})
                .finally(() => {
                    if (index !== accepted.length - 1) return;
                    setUploading(null);
                    if (added) setMessage(added === 1 ? "Foto agregada." : `${added} fotos agregadas.`);
                })
        );
    };

    const saveAlt = (image) => {
        const draft = drafts[image.id];
        if (draft === undefined) return;
        if (draft.trim() === image.alt_text) {
            setDrafts(({ [image.id]: _, ...rest }) => rest);
            setAltStatus(({ [image.id]: _, ...rest }) => rest);
            return;
        }
        setAltStatus((current) => ({ ...current, [image.id]: "saving" }));
        enqueue(async () => {
            try {
                const data = await updateProductImage(productId, image.id, draft);
                onImagesChange(data.images);
                // Se quita lo escrito solo si nadie siguió escribiendo mientras se guardaba.
                setDrafts(({ [image.id]: current, ...rest }) => (current === draft ? rest : { ...rest, [image.id]: current }));
                setAltStatus((current) => ({ ...current, [image.id]: "saved" }));
            } catch (error) {
                if (error.status === 401) throw error;
                setAltStatus((current) => ({
                    ...current,
                    [image.id]: { error: error.errors?.alt_text ?? error.message },
                }));
            }
        }).catch(() => {});
    };

    const move = (image, direction) => {
        setMessage("");
        setProblems([]);
        enqueue(async () => {
            try {
                const data = await moveProductImage(productId, image.id, direction);
                focusNext.current = { id: image.id, direction };
                onImagesChange(data.images);
                if (data.message) setMessage(data.message);
            } catch (error) {
                if (error.status === 401) throw error;
                setMessage(error.message);
            }
        }).catch(() => {});
    };

    const remove = (image, position) => {
        if (!window.confirm(`¿Quitar la foto ${position}? También se borra de Cloudinary y no se puede deshacer.`)) return;
        setMessage("");
        setProblems([]);
        enqueue(async () => {
            try {
                const data = await removeProductImage(productId, image.id);
                // La foto ya no está: el foco pasa al botón de subir para no perderse.
                focusNext.current = "upload";
                onImagesChange(data.images);
                setDrafts(({ [image.id]: _, ...rest }) => rest);
                setAltStatus(({ [image.id]: _, ...rest }) => rest);
                setMessage(data.message);
            } catch (error) {
                if (error.status === 401) throw error;
                setMessage(error.message);
            }
        }).catch(() => {});
    };

    const full = room <= 0;

    return (
        <FormSection
            title="Fotos"
            description="La primera es la que se ve en la tienda. De preferencia, con fondo blanco. Describe cada foto para quien no puede verla, por ejemplo «Playera beige vista de frente»."
        >
            <div ref={sectionRef} className="@container">
                <ul className="grid grid-cols-2 gap-x-3 gap-y-5 @md:grid-cols-3 @md:gap-4 @xl:grid-cols-4">
                    {images.map((image, index) => (
                        <PhotoCard
                            key={image.id}
                            image={image}
                            position={index + 1}
                            isFirst={index === 0}
                            isLast={index === images.length - 1}
                            draft={drafts[image.id]}
                            status={altStatus[image.id]}
                            onDraft={(text) => {
                                setDrafts((current) => ({ ...current, [image.id]: text }));
                                setAltStatus(({ [image.id]: _, ...rest }) => rest);
                            }}
                            onSaveAlt={() => saveAlt(image)}
                            onMove={(direction) => move(image, direction)}
                            onRemove={() => remove(image, index + 1)}
                        />
                    ))}
                    <li className="contents">
                        <button
                            type="button"
                            data-upload
                            onClick={() => inputRef.current?.click()}
                            disabled={full || uploading !== null}
                            aria-describedby={hintId}
                            className={UPLOAD_BUTTON}
                        >
                            <UploadIcon />
                            <span className="font-bold">
                                {uploading ? "Subiendo…" : "Subir fotos"}
                                {!uploading && <span className="@md:hidden"> o tomar una</span>}
                            </span>
                            <span className="hidden text-center text-xs font-medium text-muted @md:block" aria-hidden="true">
                                {IMAGE_HINT}
                            </span>
                        </button>
                    </li>
                </ul>
                <input
                    ref={inputRef}
                    type="file"
                    accept={IMAGE_ACCEPT}
                    multiple
                    onChange={handleFiles}
                    className="hidden"
                    tabIndex={-1}
                    aria-hidden="true"
                />
                {/* En móvil se ve aquí; desde 28rem va dentro del recuadro y aquí solo lo lee
                    el lector de pantalla. Con 10 fotos se ve siempre. */}
                <p id={hintId} className={`mt-2 text-sm text-muted ${full ? "" : "@md:sr-only"}`}>
                    {full ? `Ya tiene ${MAX_PRODUCT_IMAGES} fotos, el máximo. Quita una para agregar otra.` : IMAGE_HINT}
                </p>

                {/* Lo que pasa con cada acción. role="status": se lee al aparecer. */}
                <div role="status" className="empty:hidden">
                    {uploading && (
                        <p className="mt-4 text-sm font-semibold">
                            {uploading.total === 1
                                ? "Subiendo la foto…"
                                : `Subiendo foto ${uploading.done + 1} de ${uploading.total}…`}
                        </p>
                    )}
                    {!uploading && pending === 0 && message && (
                        <p className="mt-4 flex items-start gap-2 text-sm font-semibold">
                            <CheckIcon />
                            <span>{message}</span>
                        </p>
                    )}
                </div>
                {problems.length > 0 && (
                    <div
                        role="alert"
                        className="mt-4 flex items-start gap-2 rounded-lg border border-alert bg-alert-soft px-3 py-2.5 text-sm font-semibold"
                    >
                        <AlertIcon />
                        <div className="min-w-0">
                            <p>{problems.length === 1 ? "Una foto no se subió:" : `${problems.length} fotos no se subieron:`}</p>
                            <ul className="mt-1 list-disc pl-5 font-medium">
                                {problems.map((problem, index) => (
                                    <li key={index} className="wrap-break-word">
                                        {problem.name}: {problem.text}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}
            </div>
        </FormSection>
    );
};

const PhotoCard = ({ image, position, isFirst, isLast, draft, status, onDraft, onSaveAlt, onMove, onRemove }) => {
    const id = useId();
    const value = draft ?? image.alt_text;
    const error = typeof status === "object" ? status.error : null;
    const statusId = `${id}-status`;

    return (
        <li className="flex min-w-0 flex-col gap-2">
            <div className="relative aspect-square overflow-hidden rounded-lg border border-line bg-surface">
                <img src={image.url} alt={image.alt_text} className="h-full w-full object-contain p-2" decoding="async" />
                {isFirst && (
                    <span className="absolute left-2 top-2 rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-surface">
                        Principal
                    </span>
                )}
            </div>

            <div>
                <label htmlFor={id} className="mb-1 block text-sm font-semibold">
                    Texto alternativo<span className="sr-only"> de la foto {position}</span>
                </label>
                <input
                    id={id}
                    type="text"
                    value={value}
                    maxLength={ALT_TEXT_MAX}
                    onChange={(event) => onDraft(event.target.value)}
                    onBlur={onSaveAlt}
                    onKeyDown={(event) => {
                        // Intro guarda este campo (no el formulario entero).
                        if (event.key === "Enter") {
                            event.preventDefault();
                            onSaveAlt();
                        }
                    }}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={statusId}
                    className={ALT_INPUT}
                />
                <p id={statusId} className="mt-1 min-h-5 text-sm" aria-live="polite">
                    {status === "saving" && <span className="text-muted">Guardando…</span>}
                    {status === "saved" && (
                        <span className="flex items-center gap-1.5 font-semibold">
                            <CheckIcon size={16} />
                            Guardado
                        </span>
                    )}
                    {error && (
                        <span className="flex items-start gap-1.5 font-semibold">
                            <AlertIcon className="text-alert" />
                            <span>{error}</span>
                        </span>
                    )}
                </p>
            </div>

            <div className="-mt-1 flex items-center justify-between">
                <div className="flex">
                    <button
                        type="button"
                        data-move={`${image.id}-up`}
                        onClick={() => onMove("up")}
                        disabled={isFirst}
                        aria-label={`Mover la foto ${position} antes`}
                        className={ICON_BUTTON}
                    >
                        <ChevronIcon left />
                    </button>
                    <button
                        type="button"
                        data-move={`${image.id}-down`}
                        onClick={() => onMove("down")}
                        disabled={isLast}
                        aria-label={`Mover la foto ${position} después`}
                        className={ICON_BUTTON}
                    >
                        <ChevronIcon />
                    </button>
                </div>
                <button type="button" onClick={onRemove} className={QUIET_BUTTON}>
                    Quitar<span className="sr-only"> la foto {position}</span>
                </button>
            </div>
        </li>
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

const ChevronIcon = ({ left = false }) => (
    <svg {...iconProps(18, 2)}>
        <path d={left ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
    </svg>
);

const UploadIcon = () => (
    <svg {...iconProps(24, 1.8)}>
        <path d="M12 16V4" />
        <path d="M7 9l5-5 5 5" />
        <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
    </svg>
);

const CheckIcon = ({ size = 20 }) => (
    <svg {...iconProps(size, 2.2)} className="shrink-0 text-accent">
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12.5l2.5 2.5L16 9.5" />
    </svg>
);
