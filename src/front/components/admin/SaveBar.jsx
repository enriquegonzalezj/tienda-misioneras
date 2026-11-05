import { Button } from "../Button";
import { AlertIcon } from "./FormField";

// Barra fija abajo mientras hay cambios sin guardar. La usan el Inventario y el
// formulario de producto, para que la barra se vea igual en todo el panel.
// En escritorio empieza después del menú lateral (lg:left-64, el ancho del menú).
//
//   <SaveBar message="Tienes cambios sin guardar" saveLabel="Guardar cambios"
//            saving={saving} error={error} onDiscard={discard} onSave={save} />
//
// `message`: qué hay sin guardar ("3 variantes con cambios sin guardar").
// `error`: por qué no se guardó (role="alert": el lector de pantalla lo lee al aparecer).
// `saveDisabled`: guardar todavía no es posible (sin que esté guardando).
// `saveLabel`: el texto del botón desde 640 px; en móvil siempre dice "Guardar".
//
// La página que la usa deja espacio abajo (pb-40 sm:pb-24) para que la barra
// no tape lo último del formulario.
export const SaveBar = ({ message, saveLabel = "Guardar", saving, saveDisabled = false, error, onDiscard, onSave }) => (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-highlight-soft lg:left-64">
        <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-10">
            <div className="min-w-0 text-sm font-semibold">
                <p className="flex items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full bg-highlight ring-1 ring-primary" aria-hidden="true" />
                    {message}
                </p>
                {error && (
                    <p role="alert" className="mt-1 flex items-start gap-1.5">
                        <AlertIcon className="text-alert" />
                        <span>{error}</span>
                    </p>
                )}
            </div>
            <div className="grid shrink-0 grid-cols-[1fr_1.4fr] gap-2 sm:flex">
                <Button variant="outline" onClick={onDiscard} disabled={saving}>
                    Descartar
                </Button>
                <Button onClick={onSave} disabled={saving || saveDisabled}>
                    {/* En móvil siempre "Guardar": el texto largo no cabe en una línea. */}
                    {saving ? (
                        "Guardando…"
                    ) : (
                        <>
                            <span className="sm:hidden">Guardar</span>
                            <span className="hidden sm:inline">{saveLabel}</span>
                        </>
                    )}
                </Button>
            </div>
        </div>
    </div>
);
