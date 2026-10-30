import { Button } from "./Button";

// "Página no encontrada" dentro de la tienda (con cabecera y pie), para una
// categoría o un producto que no existe. `message` explica qué pasó:
//   <NotFound message="Este producto no existe o ya no está disponible." />
// (El código 404 real para Google lo pone el servidor en la tarea 3.5.)

const CONTAINER = "mx-auto max-w-6xl px-4 sm:px-6";

export const NotFound = ({ message }) => (
    <main className={`${CONTAINER} py-16 text-center lg:py-24`}>
        <h1 className="text-3xl font-semibold uppercase tracking-wide lg:text-4xl">Página no encontrada</h1>
        {message && <p className="mt-4 text-muted">{message}</p>}
        <Button to="/tienda" className="mt-8">
            Ver la tienda
        </Button>
    </main>
);
