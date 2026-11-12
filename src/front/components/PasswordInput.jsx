import { forwardRef, useState } from "react";
import { FIELD } from "./FormField";

// Campo de contraseña con el botón "Mostrar" / "Ocultar", escrito una sola vez
// para Entrar del panel y las pantallas de la cuenta (tarea 4.4). Se usa dentro
// de FormField, que le pasa id, aria-describedby y aria-invalid:
//
//   <FormField label="Contraseña" error={errors.password}>
//       {(field) => <PasswordInput {...field} name="password" value={...} onChange={...} />}
//   </FormField>
//
// `autoComplete` dice al gestor de contraseñas qué hacer: "current-password"
// para entrar y "new-password" para crearla (así propone una nueva).
// Con forwardRef, quien lo usa puede llevarle el foco (por ejemplo, tras un error).
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export const PasswordInput = forwardRef(function PasswordInput({ autoComplete = "current-password", ...inputProps }, ref) {
    const [shown, setShown] = useState(false);
    return (
        <div className="relative">
            <input
                {...inputProps}
                ref={ref}
                type={shown ? "text" : "password"}
                autoComplete={autoComplete}
                className={`${FIELD} pr-24`}
            />
            <button
                type="button"
                aria-pressed={shown}
                onClick={() => setShown((value) => !value)}
                className={`absolute right-1.5 top-1.5 h-9 rounded-md bg-surface-alt px-3 text-sm font-semibold text-primary ${FOCUS}`}
            >
                {shown ? "Ocultar" : "Mostrar"}
            </button>
        </div>
    );
});
