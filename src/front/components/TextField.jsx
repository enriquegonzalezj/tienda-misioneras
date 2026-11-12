import { FIELD, FormField } from "./FormField";

// Campo de texto de la tienda con su etiqueta, error y ayuda (FormField), para
// formularios que guardan sus datos en un objeto: onChange(name, valor).
//
//   <TextField label="Calle" name="street" value={form.street} error={errors.street}
//       onChange={setField} autoComplete="address-line1" maxLength={150} />
//
// maxLength va en el campo y no en FormField, para que no salga el contador del
// panel. Lo demás (type, autoComplete, inputMode, readOnly...) pasa tal cual.
export const TextField = ({ label, name, value, error, onChange, optional, help, ...inputProps }) => (
    <FormField label={label} optional={optional} help={help} error={error}>
        {(field) => (
            <input
                {...field}
                {...inputProps}
                name={name}
                value={value}
                onChange={(event) => onChange(name, event.target.value)}
                className={FIELD}
            />
        )}
    </FormField>
);
