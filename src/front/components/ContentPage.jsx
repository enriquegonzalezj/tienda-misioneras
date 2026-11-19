import { useId } from "react";

// Página de texto de la tienda (tarea 5.3): Quiénes somos, Contacto y Envíos y
// devoluciones. Un solo h1, una entrada opcional y secciones con su h2, con el
// mismo ancho de lectura en las tres. Los textos los escribe cada página.
//
//   <ContentPage accent="Amar y consolar" title="Quiénes somos" lead="...">
//       <ContentSection title="Nuestra historia">...</ContentSection>
//   </ContentPage>

export const ContentPage = ({ accent, title, lead, children }) => (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-16">
        {accent && <p className="font-script text-3xl text-alert lg:text-4xl">{accent}</p>}
        <h1 className="mt-2 text-4xl font-semibold uppercase leading-none sm:text-5xl">{title}</h1>
        {lead && <p className="mt-5 text-lg text-muted">{lead}</p>}
        <div className="mt-10 flex flex-col gap-10">{children}</div>
    </div>
);

export const ContentSection = ({ title, children }) => {
    const id = useId();
    return (
        <section aria-labelledby={id}>
            <h2 id={id} className="text-2xl font-semibold uppercase tracking-wide">
                {title}
            </h2>
            <div className="mt-4 flex flex-col gap-4 leading-relaxed text-primary">{children}</div>
        </section>
    );
};

// Lista con viñeta pequeña, para los textos de estas páginas.
export const ContentList = ({ items }) => (
    <ul className="flex flex-col gap-2">
        {items.map((item, index) => (
            <li key={index} className="flex gap-3">
                <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                <span>{item}</span>
            </li>
        ))}
    </ul>
);

// Enlace dentro del texto. Los externos se abren en otra pestaña y lo dicen.
export const CONTENT_LINK =
    "rounded-sm font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export const ExternalLink = ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className={CONTENT_LINK}>
        {children}
        <span className="sr-only"> (se abre en otra pestaña)</span>
    </a>
);
