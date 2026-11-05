// Variantes de un producto armadas a partir de sus opciones (tarea 2.1, paso 7b).
// Solo lógica, sin pantalla: la usa pages/admin/ProductForm.jsx.
//
// En el formulario, cada opción, valor y variante lleva una `key` que no cambia
// mientras se edita (la del servidor, "v12", o una nueva, "v-new-3"). Las
// variantes apuntan a sus valores por esa key y no por el texto: así, corregir
// "Bage" por "Beige" no pierde el SKU, el precio ni las existencias.
//
//   opción:   { key, id, name, has_swatch, values: [{ key, id, value, swatch_hex }] }
//   variante: { key, id, valueKeys: ["v1", "v7"], sku, price, cost, stock,
//               is_active, has_sales, units_sold }
//
// Precio, costo y existencias se guardan como texto, tal como se escriben;
// las reglas (mayor que 0, enteros...) las comprueba el servidor.

let counter = 0;

// Key para lo que se crea en pantalla y todavía no tiene id en la base.
export const newKey = (prefix) => `${prefix}-new-${++counter}`;

// La combinación como texto, para compararla: "v1|v7".
export const comboKey = (valueKeys) => valueKeys.join("|");

const isSubset = (small, big) => small.every((key) => big.includes(key));

// Todas las combinaciones de valores, en el orden de las opciones y de sus
// valores: Beige/M, Beige/G, Arena/M, Arena/G. Una opción que todavía no tiene
// valores no cuenta (si contara, mientras se escribe la primera no habría
// ninguna combinación y desaparecerían todas las variantes). Sin opciones hay
// una sola combinación vacía: la variante única.
export const combinations = (options) =>
    options
        .filter((option) => option.values.length > 0)
        .reduce((combos, option) => combos.flatMap((combo) => option.values.map((value) => [...combo, value.key])), [[]]);

export const blankVariant = (valueKeys) => ({
    key: newKey("variant"),
    id: null,
    valueKeys,
    sku: "",
    price: "",
    cost: "",
    stock: "0",
    is_active: true,
    has_sales: false,
    units_sold: 0,
});

// Vuelve a armar la lista después de cambiar las opciones.
//   pool:      las variantes que hay ahora (de ahí se rescatan sus datos)
//   knownKeys: keys de los valores que ya había antes del cambio. Solo se crea
//              sola una combinación que lleva algún valor nuevo (o de una
//              opción nueva). Las que faltan entre valores conocidos son
//              combinaciones que se quitaron a mano, y no vuelven solas: ni al
//              cambiar otra cosa ni después de guardar y recargar.
//              Con null se crean todas ("Volver a ponerlas").
// Devuelve { variants, dropped }:
//   variants: en el orden de las combinaciones; conserva las que ya existían.
//   dropped:  las que se pierden (por ejemplo, al quitar un valor). Si alguna
//             tiene ventas, el cambio no se debe aplicar (el servidor no deja
//             quitarla y la base no deja borrar el valor que usa).
export const buildVariants = (options, pool, knownKeys = null) => {
    const combos = combinations(options);
    const free = [...pool];
    const result = combos.map(() => null);

    // 1. La misma combinación: se queda tal cual.
    combos.forEach((combo, index) => {
        const at = free.findIndex((variant) => comboKey(variant.valueKeys) === comboKey(combo));
        if (at >= 0) result[index] = free.splice(at, 1)[0];
    });

    // 2. Se agregó o quitó una opción: "Beige" pasa a "Beige / M" (o al revés)
    //    con sus datos. Primero las que tienen ventas, para no perderlas.
    free.sort((a, b) => Number(b.has_sales) - Number(a.has_sales));
    combos.forEach((combo, index) => {
        if (result[index]) return;
        const at = free.findIndex(
            (variant) => isSubset(variant.valueKeys, combo) || isSubset(combo, variant.valueKeys)
        );
        if (at >= 0) result[index] = { ...free.splice(at, 1)[0], valueKeys: combo };
    });

    // 3. Lo que queda sin variante: nueva en blanco si lleva un valor nuevo; si
    //    no, es una combinación quitada y se deja fuera.
    const isNew = (combo) => knownKeys === null || combo.some((key) => !knownKeys.has(key));
    const variants = combos.flatMap((combo, index) => {
        if (result[index]) return [result[index]];
        return isNew(combo) ? [blankVariant(combo)] : [];
    });
    return { variants, dropped: free };
};

// Keys de todos los valores de las opciones (para `knownKeys`).
export const valueKeysOf = (options) => new Set(options.flatMap((option) => option.values.map((value) => value.key)));

// Cuántas combinaciones no tienen variante (las quitadas).
export const missingCount = (options, variants) => {
    const present = new Set(variants.map((variant) => comboKey(variant.valueKeys)));
    return combinations(options).filter((combo) => !present.has(comboKey(combo))).length;
};

// Texto de cada valor de la variante, en el orden de las opciones (lo que pide
// el servidor). Si un valor está vacío, va vacío y el servidor lo marca.
export const variantValues = (variant, options) => {
    const byKey = new Map(options.flatMap((option) => option.values.map((value) => [value.key, value])));
    return variant.valueKeys.map((key) => (byKey.get(key)?.value ?? "").trim());
};

// Nombre que se ve: "Beige / M"; sin opciones, "Única".
export const variantLabel = (variant, options) => variantValues(variant, options).join(" / ") || "Única";
