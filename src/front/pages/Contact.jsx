import { ContentPage, ContentSection, CONTENT_LINK, ExternalLink } from "../components/ContentPage";
import { usePageTitle } from "../hooks/usePageTitle";

// Contacto (/contacto), tarea 5.3. Datos tomados de mhpvm.org (Contacto y
// Vocaciones, consultados el 19 nov). La congregación confirma cuál es el
// medio para dudas de pedidos (mhpvm.org no tiene correo ni WhatsApp).
//
// Sin formulario: mandarlo necesita correo (5.2). Sin mapa incrustado: Google
// Maps recibiría la IP de quien visita (CLAUDE.md, Seguridad); va un enlace.

const PHONE = "449 915 1459";
const ADDRESS = "Av. Héroe de Nacozari 721, Barrio de la Salud, C.P. 20240, Aguascalientes, Ags.";
const MAP_URL =
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent("Av. Héroe de Nacozari 721, Barrio de la Salud, 20240 Aguascalientes, Ags., México");

const SOCIAL = [
    { label: "Instagram de Vocaciones", handle: "@vocaciones.mhpvm", href: "https://www.instagram.com/vocaciones.mhpvm/" },
    { label: "Facebook de Vocaciones", handle: "@VOCACIONES.MHPVM", href: "https://www.facebook.com/VOCACIONES.MHPVM" },
    { label: "Facebook de la congregación", handle: "@MHPVMOFICIAL", href: "https://www.facebook.com/MHPVMOFICIAL" },
];

export const Contact = () => {
    usePageTitle("Contacto");
    return (
        <ContentPage
            title="Contacto"
            lead="Si tienes dudas sobre un pedido, un donativo o la vida de la congregación, aquí nos encuentras."
        >
            <ContentSection title="Teléfono">
                <p>
                    <a href={`tel:+52${PHONE.replaceAll(" ", "")}`} className={`text-2xl ${CONTENT_LINK}`}>
                        {PHONE}
                    </a>
                </p>
                <p className="text-muted">
                    Si tu duda es sobre un pedido, ten a la mano su folio (por ejemplo, MHP-000123): está en la página de
                    tu pedido.
                </p>
            </ContentSection>

            <ContentSection title="Dirección">
                <address className="not-italic">{ADDRESS}</address>
                <p>
                    <ExternalLink href={MAP_URL}>Ver en el mapa</ExternalLink>
                </p>
            </ContentSection>

            <ContentSection title="Redes sociales">
                <ul className="flex flex-col gap-3">
                    {SOCIAL.map((item) => (
                        <li key={item.href} className="flex flex-col sm:flex-row sm:gap-2">
                            <span className="text-muted">{item.label}:</span>
                            <ExternalLink href={item.href}>{item.handle}</ExternalLink>
                        </li>
                    ))}
                </ul>
            </ContentSection>

            <ContentSection title="Más información">
                <p>
                    Conoce la historia, las obras y las actividades de la congregación en{" "}
                    <ExternalLink href="https://www.mhpvm.org/">mhpvm.org</ExternalLink>.
                </p>
            </ContentSection>
        </ContentPage>
    );
};
