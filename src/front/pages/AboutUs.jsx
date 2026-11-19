import { Button } from "../components/Button";
import { ContentList, ContentPage, ContentSection, ExternalLink } from "../components/ContentPage";
import { usePageTitle } from "../hooks/usePageTitle";

// Quiénes somos (/quienes-somos), tarea 5.3. Textos redactados a partir de
// mhpvm.org (Nuestra historia, Nuestro carisma, Vocaciones y Directorio de
// obras, consultados el 19 nov), parafraseados y con datos solo de ahí.
// Los revisa la congregación antes del lanzamiento.

const PILLARS = [
    <>
        <strong>Pureza:</strong> ver a Dios en las personas y en todas las cosas, con una intención recta.
    </>,
    <>
        <strong>Humildad:</strong> servir con sencillez, como instrumentos del amor de Dios.
    </>,
    <>
        <strong>Sacrificio:</strong> entregarse con alegría y hacer del esfuerzo diario una ofrenda.
    </>,
    <>
        <strong>Caridad:</strong> estar cerca, con ternura, de quienes más lo necesitan.
    </>,
];

const WORKS = [
    "Colegios católicos.",
    "Hogares de niñas en Aguascalientes y Salvatierra.",
    "Atención a migrantes.",
    "Misiones en Huajuapan de León (Oaxaca), Todos Santos (Baja California Sur), Lima y Puerto Maldonado (Perú).",
];

const ACTIVITIES = [
    "Retiros y experiencias de discernimiento.",
    "Campamentos, misiones y voluntariado.",
    "Encuentros para compartir y orar.",
    "Acompañamiento vocacional personal.",
];

export const AboutUs = () => {
    usePageTitle("Quiénes somos");
    return (
        <ContentPage
            accent="Amar y consolar"
            title="Quiénes somos"
            lead="Vocaciones MHPVM es la pastoral vocacional de las Misioneras Hijas de la Purísima Virgen María, una congregación religiosa nacida en Aguascalientes."
        >
            <ContentSection title="Nuestra historia">
                <p>
                    El padre jesuita Alberto Cuscó Mir compartió con un grupo de jóvenes de la Ciudad de México el carisma
                    que nació de su contemplación del Corazón de Jesús. Guiadas por Julia Navarrete Guerrero y Virginia
                    Rincón Gallardo y Doblado, esas jóvenes fundaron el instituto en Aguascalientes el 12 de septiembre de
                    1903.
                </p>
                <p>
                    La congregación recibió la aprobación diocesana en 1904 y la aprobación pontificia en 1962, cuando tomó
                    su nombre actual. Hoy está presente en México, Estados Unidos, Perú y Nigeria. La causa de
                    beatificación de la Madre Julia Navarrete está en proceso.
                </p>
            </ContentSection>

            <ContentSection title="Nuestro carisma">
                <p>
                    Nuestro carisma es amar y consolar los dolores del Corazón de Jesús en las personas que sufren. Lo
                    vivimos con cuatro actitudes:
                </p>
                <ContentList items={PILLARS} />
            </ContentSection>

            <ContentSection title="Dónde servimos">
                <p>Desde 1904 la congregación ha buscado los lugares más necesitados, con obras como:</p>
                <ContentList items={WORKS} />
            </ContentSection>

            <ContentSection title="Vocaciones">
                <p>
                    Acompañamos a jóvenes que sienten una inquietud, un deseo de servir o preguntas sobre su futuro. Creemos
                    que la vocación es un llamado personal de Dios que cada quien responde con libertad.
                </p>
                <ContentList items={ACTIVITIES} />
                <p>
                    Síguenos en Instagram como{" "}
                    <ExternalLink href="https://www.instagram.com/vocaciones.mhpvm/">@vocaciones.mhpvm</ExternalLink> o
                    conoce más de la congregación en{" "}
                    <ExternalLink href="https://www.mhpvm.org/">mhpvm.org</ExternalLink>.
                </p>
            </ContentSection>

            <div className="flex flex-col gap-3 sm:flex-row">
                <Button to="/tienda" className="w-full sm:w-auto">
                    Ver la tienda
                </Button>
                <Button to="/donaciones" variant="outline" className="w-full sm:w-auto">
                    Hacer un donativo
                </Button>
            </div>
        </ContentPage>
    );
};
