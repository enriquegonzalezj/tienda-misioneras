import { Link } from "react-router-dom";
import { ContentList, ContentPage, ContentSection, CONTENT_LINK } from "../components/ContentPage";
import { usePageTitle } from "../hooks/usePageTitle";

// Aviso de privacidad (/aviso-de-privacidad), tarea 5.4. Aviso integral de la
// tienda, con el contenido mínimo del artículo 15 de la LFPDPPP (DOF 20 mar
// 2025): responsable y domicilio (I), datos que se tratan y si hay sensibles
// (II), finalidades (III), cómo limitar el uso (IV), derechos ARCO (V) y cómo se
// avisa de los cambios (VI). Responsable, domicilio y correo salen del aviso de
// mhpvm.org (actualizado el 18 dic 2025), decisión de Enrique del 19 nov; el
// correo para los derechos ARCO pasó al de la tienda (merch) el 20 nov
// (decisión de Enrique: todo apunta a merch).
// Finalidades: solo pedido y donativo, sin fines secundarios (decisión de
// Enrique del 19 nov). Es una PROPUESTA del chat (no es asesoría legal): la
// congregación lo revisa antes del lanzamiento. Si cambia qué datos pide la
// tienda o a quién se los pasa (por ejemplo, otro servicio), este texto se
// actualiza junto con su fecha. Correos automáticos (tarea 5.2): Resend, con
// la región de North Virginia (Estados Unidos).

const UPDATED = "20 de noviembre de 2026";
const ARCO_EMAIL = "merch.vocaciones.mhpvm@gmail.com";

const ORDER_DATA = [
    "Nombre(s) y apellidos, correo electrónico y teléfono.",
    "Dirección de envío y referencias para encontrarla y, si lo indicas, el nombre y teléfono de quien recibe.",
    "Los productos que pides, lo que pagaste y el estado de tu pedido.",
];

const OTHER_DATA = [
    "Si haces un donativo: tu nombre completo, tu correo y el monto.",
    "Si creas una cuenta: los datos anteriores y tu contraseña, que guardamos protegida de forma que nadie puede leerla.",
    "Del pago, Mercado Pago nos informa solo el resultado, el número de operación y la comisión que cobró. Los datos de tu tarjeta o de tu cuenta bancaria los recibe Mercado Pago y nunca llegan a la tienda.",
    "La dirección IP de tu conexión, que usamos solo para proteger la tienda (por ejemplo, para limitar los intentos de inicio de sesión).",
];

const PURPOSES = [
    "Registrar tu pedido, apartar los productos, cobrarlo y enviártelo.",
    "Avisarte del estado de tu pedido o de tu donativo.",
    "Registrar tu donativo y confirmar que se recibió.",
    "Crear y mantener tu cuenta, si la creas, y ayudarte a recuperar tu contraseña.",
    "Atender cancelaciones, devoluciones y reembolsos.",
    "Cumplir las obligaciones legales que nos apliquen.",
];

const SHARING = [
    <>
        <strong>Mercado Pago</strong>, que procesa el pago: lo necesita para cobrar tu pedido o tu donativo.
    </>,
    <>
        <strong>La paquetería</strong> que elijas al pagar: recibe el nombre, el teléfono y la dirección de quien recibe
        para entregar el pedido.
    </>,
    <>
        <strong>Los servicios que usamos para que la tienda funcione</strong>, que tratan los datos solo por cuenta
        nuestra: el alojamiento de la tienda y de su base de datos (Render, con servidores en Estados Unidos) y el
        envío de los correos de tu pedido o tu donativo (Resend, también con servidores en Estados Unidos).
    </>,
    "Las autoridades, solo cuando una ley o una orden de autoridad competente lo exija.",
];

const STORAGE = [
    "Si inicias sesión, el navegador guarda una cookie de sesión y otra de seguridad. Sin ellas no se puede entrar a tu cuenta.",
    "Tu carrito y el enlace de tu último pedido sin pagar se guardan solo en tu navegador, para que no se pierdan al cerrar la página.",
    "No usamos cookies de publicidad ni herramientas de analítica, y las tipografías se sirven desde nuestro propio servidor.",
];

const LIMIT_OPTIONS = [
    "Puedes comprar y donar sin crear una cuenta.",
    "En tu cuenta, el teléfono es opcional y puedes borrar la dirección guardada cuando quieras.",
    <>
        Puedes pedirnos en cualquier momento que dejemos de usar tus datos o que borremos tu cuenta, escribiendo a{" "}
        <a href={`mailto:${ARCO_EMAIL}`} className={CONTENT_LINK}>
            {ARCO_EMAIL}
        </a>
        .
    </>,
];

const ARCO_REQUEST = [
    "Tu nombre y un correo o medio para responderte.",
    "Un documento que acredite tu identidad (o la de quien te represente).",
    "Qué derecho quieres ejercer y sobre qué datos, y, si lo tienes, el folio de tu pedido o donativo.",
];

export const PrivacyNotice = () => {
    usePageTitle("Aviso de privacidad");
    return (
        <ContentPage
            title="Aviso de privacidad"
            lead="Cuidamos los datos que nos confías al comprar o donar. Aquí te explicamos qué datos pedimos, para qué los usamos y cómo puedes ejercer tus derechos."
        >
            <ContentSection title="Quién es responsable de tus datos">
                <p>
                    Misioneras Hijas de la Purísima Virgen María, A.C., con domicilio en Av. Héroe de Nacozari 721, Barrio
                    de la Salud, C.P. 20240, Aguascalientes, Ags., es responsable del tratamiento de los datos personales
                    que se recaban en la Tienda Vocaciones MHPVM.
                </p>
            </ContentSection>

            <ContentSection title="Qué datos pedimos">
                <p>Al hacer un pedido:</p>
                <ContentList items={ORDER_DATA} />
                <p>Además, según lo que hagas en la tienda:</p>
                <ContentList items={OTHER_DATA} />
                <p>No pedimos datos personales sensibles.</p>
            </ContentSection>

            <ContentSection title="Para qué los usamos">
                <ContentList items={PURPOSES} />
                <p>
                    Todas estas finalidades son necesarias para atender tu compra o tu donativo. No usamos tus datos para
                    publicidad, boletines ni ningún otro fin.
                </p>
                <p>
                    Guardamos tus datos mientras sean necesarios para estos fines y para cumplir las obligaciones legales
                    que nos apliquen.
                </p>
            </ContentSection>

            <ContentSection title="Con quién los compartimos">
                <ContentList items={SHARING} />
                <p>No vendemos ni compartimos tus datos con nadie más.</p>
            </ContentSection>

            <ContentSection title="Cookies y datos en tu navegador">
                <ContentList items={STORAGE} />
            </ContentSection>

            <ContentSection title="Cómo limitar el uso de tus datos">
                <ContentList items={LIMIT_OPTIONS} />
            </ContentSection>

            <ContentSection title="Tus derechos">
                <p>
                    Tienes derecho a conocer qué datos tenemos de ti (acceso), a corregirlos (rectificación), a pedir que
                    los borremos (cancelación) y a oponerte a que los usemos (oposición). También puedes retirar tu
                    consentimiento en cualquier momento.
                </p>
                <p>
                    Para hacerlo, escríbenos a{" "}
                    <a href={`mailto:${ARCO_EMAIL}`} className={CONTENT_LINK}>
                        {ARCO_EMAIL}
                    </a>{" "}
                    o acude al domicilio de arriba. En tu solicitud incluye:
                </p>
                <ContentList items={ARCO_REQUEST} />
                <p>Te responderemos en los plazos que marca la ley.</p>
            </ContentSection>

            <ContentSection title="Cambios a este aviso">
                <p>
                    Si este aviso cambia, publicaremos la nueva versión en esta misma página, con su fecha de
                    actualización. Si tienes dudas, los datos para comunicarte están en{" "}
                    <Link to="/contacto" className={CONTENT_LINK}>
                        Contacto
                    </Link>
                    .
                </p>
                <p className="text-sm text-muted">Última actualización: {UPDATED}.</p>
            </ContentSection>
        </ContentPage>
    );
};
