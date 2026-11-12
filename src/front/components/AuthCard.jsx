import { AlertIcon } from "./FormField";

// Tarjeta de las pantallas de la cuenta (tarea 4.4): Entrar, Crear cuenta,
// Recuperar contraseña y Nueva contraseña. Va dentro del Layout de la tienda
// (cabecera y pie), centrada y estrecha, con los mismos tokens que /pago.
//
//   <AuthCard title="Entrar" intro="..." error={error} footer={<p>...</p>}>
//       <form>...</form>
//   </AuthCard>
//
// `error` es el aviso general de arriba (los errores de cada campo van bajo el
// campo, con FormField). `errorRef` permite llevar el foco al aviso.

export const AUTH_LINK =
    "rounded-sm font-semibold underline underline-offset-4 " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export const AuthCard = ({ title, intro, error, errorRef, footer, children }) => (
    <main className="mx-auto w-full max-w-lg px-4 pb-16 pt-8 sm:px-6 lg:pb-20 lg:pt-12">
        <div className="rounded-2xl border border-line px-5 py-8 sm:px-9 sm:py-10">
            <h1 className="text-3xl font-semibold uppercase tracking-wide">{title}</h1>
            {intro && <p className="mt-2 text-muted">{intro}</p>}

            {/* role="alert" siempre presente: el lector de pantalla lee cada aviso nuevo. */}
            <div ref={errorRef} tabIndex={-1} role="alert" className="outline-none empty:hidden mt-6">
                {error && (
                    <div className="flex items-start gap-2.5 rounded-xl border border-alert bg-alert-soft px-4 py-3 text-sm font-semibold text-primary">
                        <AlertIcon />
                        <div>{error}</div>
                    </div>
                )}
            </div>

            <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-6 text-center text-primary">{footer}</div>}
    </main>
);

// Aviso de que algo salió bien (por ejemplo, "Te enviamos un enlace").
export const AuthSuccess = ({ children }) => (
    <div role="status" className="rounded-xl bg-highlight-soft px-4 py-3 text-primary">
        {children}
    </div>
);
