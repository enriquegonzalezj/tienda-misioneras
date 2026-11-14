import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { getCurrentCampaigns } from "../api/catalog";

// Franja de campañas bajo la cabecera (tarea 4.8, decisión 5 de Enrique): una
// línea por campaña vigente, solo en las páginas de la tienda (la pone Layout;
// el panel tiene su propio AdminLayout). Sin campañas no se dibuja nada.
//
//   "Buen Fin: 15 % en toda la tienda hasta el 30 de noviembre."
//   "Clientas: 20 % en productos seleccionados hasta el 30 de noviembre, con tu
//    cuenta. Entrar o crear cuenta"   (Solo clientas con cuenta, sin sesión)
//
// Los datos vienen de GET /api/campaigns/current: el servidor decide qué
// campañas valen hoy y si quien mira tiene sesión de cliente (locked). Aquí
// solo se arma el texto; los precios los calcula siempre el servidor.
//
// Cuándo se vuelve a pedir: al abrir la tienda y al salir de una página donde
// la sesión puede cambiar (entrar, crear cuenta, cerrar sesión, crear la cuenta
// desde el pedido). Así no hay una petición en cada página y, tras entrar, la
// franja deja de pedir que se entre.

const SESSION_PAGES = ["/cuenta", "/restablecer-contrasena", "/pedido/"];
const isSessionPage = (pathname) => SESSION_PAGES.some((start) => pathname.startsWith(start));

const MONTHS = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// Espacio que no se parte: "15 %" nunca queda con el número en una línea y el % en otra.
const NBSP = " ";
const percent = (value) => `${value}${NBSP}%`;

// "2026-11-30" -> "el 30 de noviembre" (con el año si no es el de hoy).
// Se lee el texto tal cual, sin pasar por Date: así la zona horaria del
// dispositivo nunca mueve el día.
const untilText = (endDate, today) => {
    if (endDate === today) return "solo hoy";
    const [year, month, day] = endDate.split("-").map(Number);
    const sameYear = today.slice(0, 4) === endDate.slice(0, 4);
    return `hasta el ${day} de ${MONTHS[month - 1]}${sameYear ? "" : ` de ${year}`}`;
};

// Qué descuenta, en palabras. Ejemplos:
//   "15 % en toda la tienda y envío gratis"
//   "precios especiales en productos seleccionados"
//   "envío gratis al llevar productos seleccionados"
export const campaignText = (campaign) => {
    const selected = campaign.scope === "selected";
    let products = "";
    if (campaign.discount_percent !== null) {
        products = `${percent(campaign.discount_percent)} en ${selected ? "productos seleccionados" : "toda la tienda"}`;
    } else if (campaign.has_fixed_prices) {
        products = `precios especiales en ${selected ? "productos seleccionados" : "algunos productos"}`;
    }

    let shipping = "";
    if (campaign.shipping_discount_percent !== null) {
        shipping =
            campaign.shipping_discount_percent === 100
                ? "envío gratis"
                : `${percent(campaign.shipping_discount_percent)} en el envío`;
        // En productos seleccionados, el envío se descuenta solo si el pedido lleva alguno.
        if (selected) shipping += products ? " al llevar alguno de ellos" : " al llevar productos seleccionados";
        else if (!products) shipping += " en toda la tienda";
    }

    return [products, shipping].filter(Boolean).join(" y ");
};

// whitespace-nowrap: en móvil, "crear cuenta" no se parte en dos líneas.
const LINK =
    "whitespace-nowrap rounded-sm font-semibold underline underline-offset-4 " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const CampaignLine = ({ campaign, today }) => {
    const ending = untilText(campaign.end_date, today);
    return (
        <li>
            <span className="font-semibold">{campaign.name}:</span> {campaignText(campaign)} {ending}
            {campaign.members_only ? ", con tu cuenta" : ""}.
            {campaign.locked && (
                <>
                    {" "}
                    <Link to="/cuenta/entrar" className={LINK}>
                        Entrar
                    </Link>{" "}
                    o{" "}
                    <Link to="/cuenta/crear" className={LINK}>
                        crear cuenta
                    </Link>
                </>
            )}
        </li>
    );
};

export const CampaignBanner = () => {
    const { pathname } = useLocation();
    const [data, setData] = useState(null);
    // Sube cada vez que hay que volver a pedir las campañas.
    const [version, setVersion] = useState(0);
    const previousPath = useRef(pathname);

    useEffect(() => {
        const previous = previousPath.current;
        previousPath.current = pathname;
        if (previous !== pathname && isSessionPage(previous)) setVersion((v) => v + 1);
    }, [pathname]);

    useEffect(() => {
        const controller = new AbortController();
        getCurrentCampaigns({ signal: controller.signal })
            .then((result) => {
                if (!controller.signal.aborted) setData(result);
            })
            .catch(() => {
                // Sin franja si falla: es un aviso, no algo que impida comprar. Se
                // conserva lo que ya se mostraba.
            });
        return () => controller.abort();
    }, [version]);

    if (!data || data.campaigns.length === 0) return null;

    return (
        <section aria-label="Promociones vigentes" className="bg-highlight-soft text-primary">
            <ul className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-2.5 text-center text-sm sm:px-6">
                {data.campaigns.map((campaign, index) => (
                    <CampaignLine key={index} campaign={campaign} today={data.today} />
                ))}
            </ul>
        </section>
    );
};
