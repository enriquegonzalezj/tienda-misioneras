import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getCategories } from "../api/catalog";
import logoWhite from "../assets/logo-blanco.webp";

// Pie de la tienda, igual en todas las páginas (lo pone Layout).
// Según la maqueta aprobada de Inicio: fondo azul marino, logo en blanco con
// "Amar y consolar", columnas Tienda, Ayuda y Congregación, y aviso de pagos.
// Colores y fuentes solo con los tokens de index.css.

// Contorno visible solo al navegar con teclado (en blanco, porque el fondo es azul).
const FOCUS = "rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-surface";
const LINK = `text-surface/90 hover:text-surface hover:underline ${FOCUS}`;

// Páginas informativas (tarea 5.x). Mientras no existan, muestran "Página no encontrada".
const HELP_LINKS = [
    { to: "/envios-y-devoluciones", label: "Envíos y devoluciones" },
    { to: "/contacto", label: "Contacto" },
    { to: "/aviso-de-privacidad", label: "Aviso de privacidad" },
];

const FooterColumn = ({ title, children }) => (
    <div>
        <h2 className="font-sans text-sm font-semibold uppercase tracking-wider text-surface/70">{title}</h2>
        <ul className="mt-4 flex flex-col gap-3">{children}</ul>
    </div>
);

export const SiteFooter = () => {
    // Categorías principales, tal como están en la tienda (decisión del 28 oct, opción B):
    // si se renombra o se borra una desde el panel, el pie cambia solo.
    const [categories, setCategories] = useState([]);

    useEffect(() => {
        let active = true; // evita actualizar el estado si el pie ya no está en pantalla
        getCategories()
            .then((data) => {
                if (active) setCategories(data.categories);
            })
            .catch(() => {
                // Sin categorías el pie sigue funcionando: queda solo "Donativos".
            });
        return () => {
            active = false;
        };
    }, []);

    return (
        <footer className="bg-primary text-surface">
            <div className="mx-auto max-w-6xl px-4 pb-9 pt-14 sm:px-6">
                <div className="grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-[2fr_1fr_1fr_1fr]">
                    {/* Marca: ocupa todo el ancho en móvil. */}
                    <div className="col-span-2 lg:col-span-1">
                        <Link to="/" className={`inline-flex items-center gap-3 ${FOCUS}`}>
                            <img src={logoWhite} alt="" width="235" height="240" className="h-12 w-auto" />
                            <span className="font-display text-xl uppercase tracking-wider">Vocaciones MHPVM</span>
                        </Link>
                        <p className="mt-3 font-script text-3xl text-highlight">Amar y consolar</p>
                    </div>

                    <FooterColumn title="Tienda">
                        {categories.map((category) => (
                            <li key={category.slug}>
                                <Link to={`/categoria/${category.slug}`} className={LINK}>
                                    {category.name}
                                </Link>
                            </li>
                        ))}
                        <li>
                            <Link to="/donaciones" className={LINK}>
                                Donativos
                            </Link>
                        </li>
                    </FooterColumn>

                    <FooterColumn title="Ayuda">
                        {HELP_LINKS.map((link) => (
                            <li key={link.to}>
                                <Link to={link.to} className={LINK}>
                                    {link.label}
                                </Link>
                            </li>
                        ))}
                    </FooterColumn>

                    <FooterColumn title="Congregación">
                        <li>
                            {/* Sitio externo: se abre en otra pestaña para no sacar a nadie de la tienda.
                                noopener y noreferrer impiden que esa página controle o rastree esta pestaña. */}
                            <a href="https://mhpvm.org" target="_blank" rel="noopener noreferrer" className={LINK}>
                                Conoce mhpvm.org
                                <span className="sr-only"> (se abre en otra pestaña)</span>
                            </a>
                        </li>
                    </FooterColumn>
                </div>

                <p className="mt-12 border-t border-surface/20 pt-6 text-sm text-surface/70">
                    © {new Date().getFullYear()} Misioneras Hijas de la Purísima Virgen María.{" "}
                    <span className="block sm:inline">Pagos procesados por Mercado Pago.</span>
                </p>
            </div>
        </footer>
    );
};
