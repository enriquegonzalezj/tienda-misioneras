// Selector de opciones de la ficha de producto (tarea 3.4): un grupo por opción
// (por ejemplo Color y Talla), como en la maqueta aprobada.
//   - Opción con color de muestra: botones redondeados con su círculo de color.
//   - Opción sin color: botones cuadrados (tallas, tamaños...).
//   - Lo agotado sale tachado sobre gris y no se puede elegir.
//   - Debajo de la última opción, aviso de lo agotado ("La talla EG está agotada en este color.").
// Cada grupo es un conjunto de botones de radio de verdad (ocultos a la vista):
// el teclado (Tab y flechas) y los lectores de pantalla funcionan sin código extra.
//
// Uso:
//   <VariantPicker options={product.options} variants={product.variants}
//                  selected={["Beige", "G"]} onChange={setSelected} />
// `selected` lleva un valor por opción, en el orden de las opciones (igual que
// `variant.values` en la API). Si el producto no tiene opciones, no dibuja nada.

const HEX = /^#[0-9A-Fa-f]{6}$/;
const FOCUS = "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary";

const sameValues = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);

// Variante con exactamente estos valores (o undefined si esa combinación no existe).
export const findVariant = (variants, values) => variants.find((variant) => sameValues(variant.values, values));

// ¿Hay alguna variante disponible que empiece por estos valores?
// Con Color y Talla: ["Beige"] pregunta si queda alguna talla en Beige;
// ["Beige", "EG"] pregunta por esa combinación exacta.
const availableWith = (variants, prefix) =>
    variants.some((variant) => variant.available && prefix.every((value, index) => variant.values[index] === value));

// Valores nuevos al elegir `value` en la opción `index`. Si la combinación sigue
// disponible, solo cambia ese valor. Si no (por ejemplo, la talla elegida está
// agotada en el color nuevo), las opciones siguientes pasan al primer valor
// disponible, en el orden del panel (M, G, EG).
export const chooseValue = (options, variants, selected, index, value) => {
    const next = selected.map((current, i) => (i === index ? value : current));
    if (findVariant(variants, next)?.available) return next;

    for (let i = index + 1; i < options.length; i += 1) {
        const prefix = next.slice(0, i);
        const first = options[i].values.find((item) => availableWith(variants, [...prefix, item.value]));
        if (first) next[i] = first.value;
    }
    return next;
};

// --- Texto del aviso -------------------------------------------------------
// El nombre de la opción lo escribe la administradora, así que el género se
// deduce con una regla sencilla: termina en "a" (talla) es femenino; si no
// (color, tamaño, diseño), masculino. El plural sigue la misma regla que el
// texto de las tarjetas en la API (solo cambia la primera palabra).
const isFeminine = (name) => name.split(" ")[0].endsWith("a");

const pluralOf = (name) => {
    const [first, ...rest] = name.split(" ");
    let plural;
    if (first.endsWith("ión")) plural = `${first.slice(0, -3)}iones`;
    else if (first.endsWith("z")) plural = `${first.slice(0, -1)}ces`;
    else if (/[aeiou]$/.test(first)) plural = `${first}s`;
    else plural = `${first}es`;
    return [plural, ...rest].join(" ");
};

const joinList = (items) => (items.length === 1 ? items[0] : `${items.slice(0, -1).join(", ")} y ${items.at(-1)}`);

// "La talla EG está agotada en este color." / "Las tallas M y EG están agotadas en este color."
// Con una sola opción, sin la parte final: "El color Negro está agotado."
const soldOutMessage = (option, values, previousOption) => {
    const name = option.name.toLowerCase();
    const feminine = isFeminine(name);
    const many = values.length > 1;
    const article = feminine ? (many ? "Las" : "La") : many ? "Los" : "El";
    const verb = many ? "están" : "está";
    const soldOut = `agotad${feminine ? "a" : "o"}${many ? "s" : ""}`;
    let where = "";
    if (previousOption) {
        const previous = previousOption.name.toLowerCase();
        where = ` en ${isFeminine(previous) ? "esta" : "este"} ${previous}`;
    }
    return `${article} ${many ? pluralOf(name) : name} ${joinList(values)} ${verb} ${soldOut}${where}.`;
};

// --- Botones ----------------------------------------------------------------
const BOX = "inline-flex items-center border text-base transition-colors";
const SHAPES = {
    // Redondeado con círculo de color (como Beige y Arena en la maqueta).
    swatch: "h-12 gap-3 rounded-full pl-2 pr-5",
    // Cuadrado (como las tallas en la maqueta).
    square: "h-12 min-w-17 justify-center rounded-xl px-4 font-semibold",
};
// El estado lo decide React (no `peer-checked`), así lo agotado nunca se ve
// como elegido aunque el producto entero esté agotado.
const STATES = {
    // Elegido. En el redondeado, borde doble (ring por dentro) sin mover nada de sitio.
    swatch_checked: "border-primary bg-surface text-primary ring-1 ring-inset ring-primary",
    square_checked: "border-primary bg-primary text-surface",
    idle: "border-line bg-surface text-primary hover:border-muted",
    disabled: "border-line bg-surface-alt text-muted/70 line-through",
};

const ValueButton = ({ name, item, shape, checked, disabled, onSelect }) => {
    let state = STATES.idle;
    if (disabled) state = STATES.disabled;
    else if (checked) state = STATES[`${shape}_checked`];

    return (
        <label className={disabled ? "cursor-not-allowed" : "cursor-pointer"}>
            <input
                type="radio"
                name={name}
                value={item.value}
                checked={checked}
                disabled={disabled}
                onChange={onSelect}
                className="peer sr-only"
            />
            <span className={`${BOX} ${SHAPES[shape]} ${state} ${FOCUS}`}>
                {shape === "swatch" && (
                    // El color viene de la base (swatch_hex, con formato #RRGGBB
                    // comprobado por la base); es dato del producto, no del tema,
                    // por eso es el único color que va en `style`.
                    <span
                        aria-hidden="true"
                        className={`size-8 shrink-0 rounded-full border border-line ${disabled ? "opacity-50" : ""}`}
                        style={HEX.test(item.swatch_hex ?? "") ? { backgroundColor: item.swatch_hex } : undefined}
                    />
                )}
                {item.value}
                {disabled && <span className="sr-only"> (sin existencias)</span>}
            </span>
        </label>
    );
};

export const VariantPicker = ({ options, variants, selected, onChange, className = "" }) => {
    if (options.length === 0) return null;

    const last = options.length - 1;
    const productAvailable = variants.some((variant) => variant.available);

    // Valores de la última opción que existen con lo elegido antes pero están agotados.
    // Si todo el producto está agotado no se avisa: ya lo dice "Agotado" junto al precio.
    const prefix = selected.slice(0, last);
    const soldOut = productAvailable
        ? options[last].values
              .map((item) => item.value)
              .filter((value) => findVariant(variants, [...prefix, value])?.available === false)
        : [];

    return (
        <div className={`space-y-6 ${className}`.trim()}>
            {options.map((option, index) => {
                const shape = option.values.some((item) => HEX.test(item.swatch_hex ?? "")) ? "swatch" : "square";
                const before = selected.slice(0, index);
                return (
                    <fieldset key={option.name}>
                        <legend className="text-base font-semibold text-primary">
                            {option.name}: <span className="font-normal text-muted">{selected[index]}</span>
                        </legend>
                        <div className="mt-3 flex flex-wrap gap-3">
                            {option.values.map((item) => (
                                <ValueButton
                                    key={item.value}
                                    name={`product-option-${index}`}
                                    item={item}
                                    shape={shape}
                                    checked={selected[index] === item.value}
                                    disabled={!availableWith(variants, [...before, item.value])}
                                    onSelect={() => onChange(chooseValue(options, variants, selected, index, item.value))}
                                />
                            ))}
                        </div>
                        {index === last && (
                            // aria-live: al cambiar de color, el lector de pantalla lee el aviso nuevo.
                            <p aria-live="polite" className="mt-3 text-sm text-muted empty:mt-0">
                                {soldOut.length > 0 && soldOutMessage(option, soldOut, options[last - 1])}
                            </p>
                        )}
                    </fieldset>
                );
            })}
        </div>
    );
};
