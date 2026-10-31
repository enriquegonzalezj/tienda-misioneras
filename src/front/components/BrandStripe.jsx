// Franja de los 4 colores de la marca, arriba de la cabecera de la tienda y del
// panel. Es decorativa: los lectores de pantalla la saltan.
export const BrandStripe = () => (
    <div className="grid h-1 grid-cols-4" aria-hidden="true">
        <span className="bg-primary" />
        <span className="bg-accent" />
        <span className="bg-highlight" />
        <span className="bg-alert" />
    </div>
);
