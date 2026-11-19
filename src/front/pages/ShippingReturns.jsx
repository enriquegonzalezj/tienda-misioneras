import { Link } from "react-router-dom";
import { ContentList, ContentPage, ContentSection, CONTENT_LINK } from "../components/ContentPage";
import { usePageTitle } from "../hooks/usePageTitle";

// Envíos y devoluciones (/envios-y-devoluciones), tarea 5.3. mhpvm.org no tiene
// esta política: es una PROPUESTA del chat para que la congregación la revise
// antes del lanzamiento (no es asesoría legal). Se apoya en la Ley Federal de
// Protección al Consumidor: artículo 56 (cinco días hábiles desde la entrega
// para revocar la compra a distancia, con reembolso del precio y el flete de la
// devolución a cargo de quien compra). Nada de tarifas ni plazos inventados:
// salen de las paqueterías que captura la congregación (/admin/envios).

const SHIPPING = [
    "Enviamos solo a direcciones de México.",
    "Al pagar eliges la paquetería; ahí ves su precio y, si lo tiene, su tiempo estimado de entrega.",
    "Cuando tu pedido sale, lo verás como enviado en la página de tu pedido, con el número de guía si la paquetería lo da.",
    "Guarda el enlace de tu pedido: es la forma de consultarlo.",
];

const RETURN_STEPS = [
    "Escríbenos o llámanos (ver Contacto) dentro de los 5 días hábiles siguientes a la entrega, con el folio de tu pedido.",
    "Devuelve los productos sin usar y en su empaque original. El envío de la devolución corre por tu cuenta, como lo establece la ley.",
    "Al recibirlos, te devolvemos lo que pagaste por esos productos por medio de Mercado Pago, al mismo medio con el que pagaste.",
];

export const ShippingReturns = () => {
    usePageTitle("Envíos y devoluciones");
    return (
        <ContentPage
            title="Envíos y devoluciones"
            lead="Queremos que tu compra llegue bien. Aquí te contamos cómo enviamos y qué hacer si necesitas devolver algo."
        >
            <ContentSection title="Envíos">
                <ContentList items={SHIPPING} />
            </ContentSection>

            <ContentSection title="Cancelar antes del envío">
                <p>
                    Si cambias de opinión antes de que tu pedido salga, avísanos con el folio y lo cancelamos con la
                    devolución completa de tu pago por medio de Mercado Pago.
                </p>
            </ContentSection>

            <ContentSection title="Devoluciones">
                <p>Tienes 5 días hábiles desde que recibes tu pedido para devolverlo, aunque no tenga ningún defecto:</p>
                <ol className="flex flex-col gap-3">
                    {RETURN_STEPS.map((step, index) => (
                        <li key={step} className="flex gap-3">
                            <span
                                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-alt text-sm font-bold"
                                aria-hidden="true"
                            >
                                {index + 1}
                            </span>
                            <span>{step}</span>
                        </li>
                    ))}
                </ol>
            </ContentSection>

            <ContentSection title="Si algo llegó mal">
                <p>
                    Si un producto llega dañado, con un defecto o no es el que pediste, avísanos con el folio y una foto. Te
                    lo cambiamos o te devolvemos tu dinero, y en ese caso el envío corre por nuestra cuenta.
                </p>
            </ContentSection>

            <ContentSection title="¿Dudas?">
                <p>
                    Escríbenos o llámanos: los datos están en{" "}
                    <Link to="/contacto" className={CONTENT_LINK}>
                        Contacto
                    </Link>
                    . Esta política no limita los derechos que te da la Ley Federal de Protección al Consumidor.
                </p>
            </ContentSection>
        </ContentPage>
    );
};
