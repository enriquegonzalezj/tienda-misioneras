import { Link } from "react-router-dom";

// Migas de pan, escritas una sola vez para la Tienda, las categorías y la ficha:
//   Inicio » Tienda » Papelería » Libretas » Libreta de puntos
// Recibe la ruta completa como lista de pasos { to, label }. Todos son enlaces
// menos el último, que es la página actual (aria-current para lectores de pantalla).
//
//   <Breadcrumbs trail={[{ to: "/", label: "Inicio" }, { to: "/tienda", label: "Tienda" }]} />

const FOCUS = "rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export const Breadcrumbs = ({ trail }) => (
    <nav aria-label="Ruta de navegación" className="text-sm text-muted">
        <ol className="flex flex-wrap items-center gap-2">
            {trail.map((step, index) => (
                <li key={step.to} className="flex items-center gap-2">
                    {index > 0 && <span aria-hidden="true">»</span>}
                    {index < trail.length - 1 ? (
                        <Link to={step.to} className={`hover:text-primary hover:underline ${FOCUS}`}>
                            {step.label}
                        </Link>
                    ) : (
                        <span aria-current="page" className="text-primary">
                            {step.label}
                        </span>
                    )}
                </li>
            ))}
        </ol>
    </nav>
);
