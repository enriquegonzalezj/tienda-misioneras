import { useId, useState } from "react";
import { newKey } from "../../utils/productVariants";
import { Button } from "../Button";
import { AlertIcon, FIELD, FormField } from "../FormField";
import { FormSection } from "./ProductDetails";
import { Toggle } from "./Toggle";

// Formulario de producto (tarea 2.1, paso 7b): la sección "Opciones".
// Hasta 2 opciones (por ejemplo Color y Talla), cada una con sus valores en el
// orden en que se muestran en la tienda. Las variantes salen solas de aquí
// (utils/productVariants.js): ese trabajo lo hace la página al recibir
// onChange(opcionesNuevas), y puede rechazar el cambio si se perdería una
// variante con ventas; entonces `blocked` trae el motivo.
//
// `errors` usa las claves del servidor: options, options.0.name,
// options.0.values, options.0.values.1.value y options.0.values.1.swatch_hex.

const MAX_OPTIONS = 2;
const OPTION_NAME_MAX = 40;
const VALUE_MAX = 40;

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary";
const QUIET_BUTTON =
    "inline-flex min-h-10 items-center justify-center rounded-full px-3 text-sm font-semibold hover:underline " +
    `disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline ${FOCUS}`;
const ICON_BUTTON =
    "inline-flex size-10 shrink-0 items-center justify-center rounded-lg hover:bg-surface-alt " +
    `disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${FOCUS}`;
// Botón de contorno pequeño (Agregar), de la misma familia que Button.
const SMALL_OUTLINE =
    "inline-flex h-11 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-surface px-5 " +
    "text-sm font-semibold text-primary hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-50 " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const VALUE_INPUT =
    "h-11 w-full rounded-lg border border-field bg-surface px-3 text-base text-primary " +
    `aria-[invalid=true]:border-alert ${FOCUS}`;

export const ProductOptions = ({ options, errors, blocked, onChange }) => {
    // Lo que se está escribiendo en "Nuevo valor" de cada opción, y su aviso.
    const [drafts, setDrafts] = useState({});
    const [draftErrors, setDraftErrors] = useState({});

    const updateOption = (index, changes) =>
        onChange(options.map((option, i) => (i === index ? { ...option, ...changes } : option)));

    const updateValue = (optionIndex, valueIndex, changes) =>
        updateOption(optionIndex, {
            values: options[optionIndex].values.map((value, j) => (j === valueIndex ? { ...value, ...changes } : value)),
        });

    const addOption = () =>
        onChange([...options, { key: newKey("option"), id: null, name: "", has_swatch: false, values: [] }]);

    const removeOption = (index) => onChange(options.filter((_, i) => i !== index));

    // Subir (-1) o bajar (+1) un valor: cambia el orden en la tienda y el de
    // las variantes.
    const moveValue = (optionIndex, valueIndex, step) => {
        const values = [...options[optionIndex].values];
        const target = valueIndex + step;
        [values[valueIndex], values[target]] = [values[target], values[valueIndex]];
        updateOption(optionIndex, { values });
    };

    const removeValue = (optionIndex, valueIndex) =>
        updateOption(optionIndex, { values: options[optionIndex].values.filter((_, j) => j !== valueIndex) });

    const setDraft = (key, text) => {
        setDrafts((current) => ({ ...current, [key]: text }));
        setDraftErrors((current) => ({ ...current, [key]: "" }));
    };

    // Agrega el valor escrito. Un repetido se avisa aquí mismo, sin esperar
    // al servidor.
    const addValue = (index) => {
        const option = options[index];
        const text = (drafts[option.key] ?? "").trim();
        if (!text) return;
        if (option.values.some((value) => value.value.trim().toLowerCase() === text.toLowerCase())) {
            setDraftErrors((current) => ({ ...current, [option.key]: `«${text}» ya está en esta opción.` }));
            return;
        }
        updateOption(index, {
            values: [...option.values, { key: newKey("value"), id: null, value: text, swatch_hex: null }],
        });
        setDraft(option.key, "");
    };

    return (
        <FormSection
            title="Opciones"
            description="Hasta 2, por ejemplo Color y Talla. Si el producto se vende de una sola forma, no agregues ninguna."
        >
            {(blocked || errors.options) && (
                <p role="alert" className="flex items-start gap-2 rounded-lg border border-alert bg-alert-soft px-3 py-2.5 text-sm font-semibold">
                    <AlertIcon />
                    <span>{blocked || errors.options}</span>
                </p>
            )}

            {options.map((option, index) => {
                const base = `options.${index}`;
                const optionName = option.name.trim() || `la opción ${index + 1}`;
                return (
                    <div key={option.key} className="flex flex-col gap-4 rounded-lg border border-line p-4">
                        <div className="-my-1 flex items-center justify-between gap-3">
                            <h3 className="font-bold">Opción {index + 1}</h3>
                            <button type="button" onClick={() => removeOption(index)} className={QUIET_BUTTON}>
                                Quitar opción<span className="sr-only"> {optionName}</span>
                            </button>
                        </div>
                        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
                            <div className="min-w-48 flex-1">
                                <FormField
                                    label={
                                        <>
                                            Nombre de la opción<span className="sr-only"> {index + 1}</span>
                                        </>
                                    }
                                    error={errors[`${base}.name`]}
                                    length={option.name.length}
                                    maxLength={OPTION_NAME_MAX}
                                >
                                    {(field) => (
                                        <input
                                            {...field}
                                            type="text"
                                            placeholder={index === 0 ? "Color" : "Talla"}
                                            value={option.name}
                                            onChange={(event) => updateOption(index, { name: event.target.value })}
                                            className={FIELD}
                                        />
                                    )}
                                </FormField>
                            </div>
                            <div className="pb-2.5">
                                <Toggle
                                    label="Con círculo de color"
                                    checked={option.has_swatch}
                                    onChange={(on) => updateOption(index, { has_swatch: on })}
                                />
                            </div>
                        </div>

                        <fieldset>
                            <legend className="mb-1 text-sm font-semibold">Valores, en el orden en que se muestran</legend>
                            {option.values.length > 0 && (
                                <ul className="divide-y divide-line">
                                    {option.values.map((value, valueIndex) => (
                                        <ValueRow
                                            key={value.key}
                                            value={value}
                                            hasSwatch={option.has_swatch}
                                            position={valueIndex + 1}
                                            optionName={optionName}
                                            isFirst={valueIndex === 0}
                                            isLast={valueIndex === option.values.length - 1}
                                            errors={{
                                                value: errors[`${base}.values.${valueIndex}.value`],
                                                swatch: errors[`${base}.values.${valueIndex}.swatch_hex`],
                                            }}
                                            onChange={(changes) => updateValue(index, valueIndex, changes)}
                                            onMove={(step) => moveValue(index, valueIndex, step)}
                                            onRemove={() => removeValue(index, valueIndex)}
                                        />
                                    ))}
                                </ul>
                            )}
                            {errors[`${base}.values`] && <FieldError text={errors[`${base}.values`]} />}

                            <NewValue
                                optionName={optionName}
                                text={drafts[option.key] ?? ""}
                                error={draftErrors[option.key]}
                                onText={(text) => setDraft(option.key, text)}
                                onAdd={() => addValue(index)}
                            />
                            {option.has_swatch && (
                                <p className="mt-1.5 text-sm text-muted">Toca el círculo para elegir el color de cada valor.</p>
                            )}
                        </fieldset>
                    </div>
                );
            })}

            <div>
                <Button variant="outline" onClick={addOption} disabled={options.length >= MAX_OPTIONS} className="gap-2">
                    <PlusIcon />
                    Agregar opción
                </Button>
                {options.length >= MAX_OPTIONS && (
                    <p className="mt-1.5 text-sm text-muted">Ya tiene {MAX_OPTIONS} opciones, el máximo.</p>
                )}
            </div>
        </FormSection>
    );
};

// Un valor: círculo de color (si la opción lo lleva), texto editable, flechas
// para ordenarlo y Quitar. Corregir el texto no cambia sus variantes.
const ValueRow = ({ value, hasSwatch, position, optionName, isFirst, isLast, errors, onChange, onMove, onRemove }) => {
    const id = useId();
    const label = value.value.trim() || `valor ${position}`;
    return (
        <li className="py-2.5">
            <div className="flex items-center gap-2">
                {hasSwatch && (
                    <SwatchPicker
                        hex={value.swatch_hex}
                        label={`Color de ${label}`}
                        invalid={Boolean(errors.swatch)}
                        describedBy={errors.swatch ? `${id}-swatch` : undefined}
                        onChange={(hex) => onChange({ swatch_hex: hex })}
                    />
                )}
                <input
                    type="text"
                    aria-label={`Valor ${position} de ${optionName}`}
                    aria-invalid={errors.value ? true : undefined}
                    aria-describedby={errors.value ? `${id}-value` : undefined}
                    maxLength={VALUE_MAX}
                    value={value.value}
                    onChange={(event) => onChange({ value: event.target.value })}
                    className={`${VALUE_INPUT} min-w-0 flex-1`}
                />
                <button type="button" onClick={() => onMove(-1)} disabled={isFirst} aria-label={`Subir ${label}`} className={ICON_BUTTON}>
                    <ArrowIcon up />
                </button>
                <button type="button" onClick={() => onMove(1)} disabled={isLast} aria-label={`Bajar ${label}`} className={ICON_BUTTON}>
                    <ArrowIcon />
                </button>
                <button type="button" onClick={onRemove} aria-label={`Quitar ${label}`} className={ICON_BUTTON}>
                    <CloseIcon />
                </button>
            </div>
            {errors.swatch && <FieldError id={`${id}-swatch`} text={errors.swatch} />}
            {errors.value && <FieldError id={`${id}-value`} text={errors.value} />}
        </li>
    );
};

// Círculo que abre el selector de color del navegador (input type="color",
// sin librerías). El input va oculto a la vista pero no al teclado: con Tab se
// llega a él y se abre con Espacio. Al lado se ve el código, por si hay que
// copiarlo del manual de marca. Sin color elegido, el círculo va punteado.
const SwatchPicker = ({ hex, label, invalid, describedBy, onChange }) => (
    <label
        className={`relative inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-surface-alt focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-primary ${
            invalid ? "ring-2 ring-alert" : ""
        }`}
    >
        {hex ? (
            // Único style permitido: el color es un dato del producto (ver CLAUDE.md).
            <span className="size-7 rounded-full border border-field" style={{ backgroundColor: hex }} aria-hidden="true" />
        ) : (
            <span className="size-7 rounded-full border-2 border-dashed border-field" aria-hidden="true" />
        )}
        <span className="w-16 font-mono text-xs text-muted" aria-hidden="true">
            {hex ?? "Elegir"}
        </span>
        <input
            type="color"
            aria-label={label}
            aria-invalid={invalid ? true : undefined}
            aria-describedby={describedBy}
            value={(hex ?? "#FFFFFF").toLowerCase()}
            onChange={(event) => onChange(event.target.value.toUpperCase())}
            className="sr-only"
        />
    </label>
);

// "Nuevo valor" + Agregar. Intro también agrega (sin enviar el formulario).
const NewValue = ({ optionName, text, error, onText, onAdd }) => {
    const id = useId();
    return (
        <div className="mt-2">
            <div className="flex gap-2">
                <input
                    type="text"
                    placeholder="Nuevo valor"
                    aria-label={`Nuevo valor de ${optionName}`}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `${id}-error` : undefined}
                    maxLength={VALUE_MAX}
                    value={text}
                    onChange={(event) => onText(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            event.preventDefault();
                            onAdd();
                        }
                    }}
                    className={`${VALUE_INPUT} min-w-0 flex-1 sm:max-w-xs`}
                />
                <button type="button" onClick={onAdd} disabled={!text.trim()} className={SMALL_OUTLINE}>
                    Agregar
                </button>
            </div>
            {error && <FieldError id={`${id}-error`} text={error} />}
        </div>
    );
};

const FieldError = ({ id, text }) => (
    <p id={id} className="mt-1.5 flex items-start gap-1.5 text-sm font-semibold">
        <AlertIcon className="text-alert" />
        <span>{text}</span>
    </p>
);

const iconProps = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
};

const ArrowIcon = ({ up = false }) => (
    <svg {...iconProps}>
        <path d={up ? "M12 19V5M6 11l6-6 6 6" : "M12 5v14M6 13l6 6 6-6"} />
    </svg>
);

const CloseIcon = () => (
    <svg {...iconProps}>
        <path d="M6 6l12 12M18 6L6 18" />
    </svg>
);

const PlusIcon = () => (
    <svg {...iconProps}>
        <path d="M12 5v14M5 12h14" />
    </svg>
);
