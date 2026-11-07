import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

// Carrito de la tienda (tarea 4.1), compartido por la cabecera, la ficha y la
// página del carrito. Lo pone Layout con <CartProvider>; se usa con useCart().
//
// Solo guarda qué variante y cuántas: [{ variant_id, quantity }]. Nunca precios,
// nombres ni disponibilidad: eso lo calcula siempre el servidor con POST /api/cart,
// porque lo que está en el navegador cualquiera lo puede cambiar.
//
// Se guarda en localStorage para que el carrito siga ahí al recargar o volver otro
// día. localStorage puede fallar (modo privado, almacenamiento lleno o bloqueado):
// por eso todo va con try/catch y, si falla, el carrito funciona igual en memoria
// mientras la pestaña siga abierta.

// Los mismos límites que src/api/cart.py.
export const MAX_QUANTITY = 99;
export const MAX_LINES = 50;

const STORAGE_KEY = "mhpvm-carrito";

const isValidId = (value) => Number.isSafeInteger(value) && value > 0;

// Deja solo lo que tiene sentido: ids enteros positivos, cantidades enteras de 1 a
// 99 (más de 99 se recorta) y 50 líneas como mucho. Una variante repetida se junta
// en una sola línea. Lo que venga mal se descarta sin avisar: solo puede venir mal
// si alguien editó localStorage a mano.
const sanitize = (raw) => {
    if (!Array.isArray(raw)) return [];
    const merged = new Map();
    for (const item of raw) {
        if (!item || typeof item !== "object") continue;
        const { variant_id: variantId, quantity } = item;
        if (!isValidId(variantId) || !Number.isSafeInteger(quantity) || quantity < 1) continue;
        merged.set(variantId, Math.min(MAX_QUANTITY, (merged.get(variantId) ?? 0) + quantity));
    }
    return [...merged]
        .slice(0, MAX_LINES)
        .map(([variantId, quantity]) => ({ variant_id: variantId, quantity }));
};

const readStorage = () => {
    try {
        return sanitize(JSON.parse(window.localStorage.getItem(STORAGE_KEY)));
    } catch {
        return [];
    }
};

const writeStorage = (items) => {
    try {
        if (items.length === 0) window.localStorage.removeItem(STORAGE_KEY);
        else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
        // Sin localStorage: el carrito sigue en memoria.
    }
};

const CartContext = createContext(null);

export const CartProvider = ({ children }) => {
    const [items, setItems] = useState(readStorage);

    // Cada cambio se guarda. Si el valor es el mismo, el navegador no hace nada
    // ni avisa a las otras pestañas, así que no se forma un círculo con el evento
    // de abajo.
    useEffect(() => {
        writeStorage(items);
    }, [items]);

    // Otra pestaña de la tienda cambió el carrito: se vuelve a leer, para que el
    // número de la cabecera sea el mismo en todas. (key null = se borró todo.)
    useEffect(() => {
        const onStorage = (event) => {
            if (event.key === STORAGE_KEY || event.key === null) setItems(readStorage());
        };
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
    }, []);

    // Suma `quantity` a lo que ya hubiera de esa variante, con tope 99. Devuelve qué
    // pasó, para que la ficha muestre el aviso correcto:
    //   { status: "added", added }   se agregaron todas
    //   { status: "capped", added }  solo cabían `added` hasta llegar a 99
    //   { status: "full" }           ya había 99
    //   { status: "too_many_lines" } ya hay 50 productos distintos
    //   { status: "invalid" }        id o cantidad que no tienen sentido
    const addItem = useCallback(
        (variantId, quantity) => {
            if (!isValidId(variantId) || !Number.isSafeInteger(quantity) || quantity < 1) {
                return { status: "invalid" };
            }
            const current = items.find((item) => item.variant_id === variantId);
            if (!current && items.length >= MAX_LINES) return { status: "too_many_lines" };

            const before = current?.quantity ?? 0;
            const after = Math.min(MAX_QUANTITY, before + quantity);
            const added = after - before;
            if (added === 0) return { status: "full" };

            setItems(
                current
                    ? items.map((item) => (item.variant_id === variantId ? { ...item, quantity: after } : item))
                    : [...items, { variant_id: variantId, quantity: after }]
            );
            return { status: added < quantity ? "capped" : "added", added };
        },
        [items]
    );

    // Para la página del carrito (commit 3): cambiar la cantidad o quitar una línea.
    const setQuantity = useCallback((variantId, quantity) => {
        if (!Number.isSafeInteger(quantity) || quantity < 1) return;
        const clamped = Math.min(MAX_QUANTITY, quantity);
        setItems((list) => list.map((item) => (item.variant_id === variantId ? { ...item, quantity: clamped } : item)));
    }, []);

    const removeItems = useCallback((variantIds) => {
        const ids = new Set(variantIds);
        setItems((list) => list.filter((item) => !ids.has(item.variant_id)));
    }, []);

    const clear = useCallback(() => setItems([]), []);

    // Número de artículos de la cabecera: la suma de las cantidades.
    const count = useMemo(() => items.reduce((sum, item) => sum + item.quantity, 0), [items]);

    const value = useMemo(
        () => ({ items, count, addItem, setQuantity, removeItems, clear }),
        [items, count, addItem, setQuantity, removeItems, clear]
    );

    return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = () => {
    const cart = useContext(CartContext);
    if (!cart) throw new Error("useCart necesita estar dentro de <CartProvider> (lo pone Layout).");
    return cart;
};
