import { FIELD, FormField, TEXTAREA } from "./FormField";
import { TextField } from "./TextField";

// Campos de la dirección de envío, escritos una sola vez para /pago y para la
// dirección guardada de la cuenta (tarea 4.4). Las claves son las del servidor
// (checkout.py y account.py): street, exterior_number, interior_number,
// neighborhood, postal_code, municipality, state, references y, con la casilla
// "Lo recibe otra persona" (other_recipient), recipient_name y recipient_phone.
//
//   <AddressFields form={form} errors={errors} onChange={setField} states={states} />
//
// `onChange(name, valor)` recibe también la casilla (valor true o false).
// `states`: los 32 estados de GET /api/checkout/options.
// Van dentro de una rejilla de 6 columnas desde sm, que pone quien lo usa.
export const AddressFields = ({ form, errors, onChange, states }) => (
    <>
        <div className="sm:col-span-6">
            <label className="inline-flex cursor-pointer items-center gap-3 text-primary">
                <input
                    type="checkbox"
                    name="other_recipient"
                    checked={form.other_recipient}
                    onChange={(event) => onChange("other_recipient", event.target.checked)}
                    className="size-5 accent-primary"
                />
                Lo recibe otra persona
            </label>
        </div>
        {form.other_recipient && (
            <>
                <div className="sm:col-span-3">
                    <TextField label="Nombre de quien recibe" name="recipient_name" value={form.recipient_name} error={errors.recipient_name} onChange={onChange} autoComplete="section-recipient name" maxLength={150} />
                </div>
                <div className="sm:col-span-3">
                    <TextField label="Teléfono de quien recibe" name="recipient_phone" type="tel" inputMode="numeric" value={form.recipient_phone} error={errors.recipient_phone} onChange={onChange} autoComplete="section-recipient tel-national" maxLength={16} />
                </div>
            </>
        )}
        <div className="sm:col-span-6">
            <TextField label="Calle" name="street" value={form.street} error={errors.street} onChange={onChange} autoComplete="address-line1" maxLength={150} />
        </div>
        <div className="sm:col-span-3">
            <TextField label="Número exterior" name="exterior_number" value={form.exterior_number} error={errors.exterior_number} onChange={onChange} maxLength={20} />
        </div>
        <div className="sm:col-span-3">
            <TextField label="Número interior" name="interior_number" optional value={form.interior_number} error={errors.interior_number} onChange={onChange} maxLength={20} />
        </div>
        <div className="sm:col-span-4">
            <TextField label="Colonia" name="neighborhood" value={form.neighborhood} error={errors.neighborhood} onChange={onChange} autoComplete="address-level3" maxLength={100} />
        </div>
        <div className="sm:col-span-2">
            <TextField label="Código postal" name="postal_code" inputMode="numeric" value={form.postal_code} error={errors.postal_code} onChange={onChange} autoComplete="postal-code" maxLength={5} />
        </div>
        <div className="sm:col-span-3">
            <TextField label="Municipio o alcaldía" name="municipality" value={form.municipality} error={errors.municipality} onChange={onChange} autoComplete="address-level2" maxLength={100} />
        </div>
        <div className="sm:col-span-3">
            <FormField label="Estado" error={errors.state}>
                {(field) => (
                    <select
                        {...field}
                        name="state"
                        value={form.state}
                        onChange={(event) => onChange("state", event.target.value)}
                        autoComplete="address-level1"
                        className={FIELD}
                    >
                        <option value="">Elige el estado</option>
                        {states.map((state) => (
                            <option key={state} value={state}>
                                {state}
                            </option>
                        ))}
                    </select>
                )}
            </FormField>
        </div>
        <div className="sm:col-span-6">
            <FormField label="Referencias" optional help="Entre qué calles está, color de la fachada o algo que ayude a encontrarla." error={errors.references}>
                {(field) => (
                    <textarea
                        {...field}
                        name="references"
                        rows={2}
                        maxLength={255}
                        value={form.references}
                        onChange={(event) => onChange("references", event.target.value)}
                        className={TEXTAREA}
                    />
                )}
            </FormField>
        </div>
    </>
);

// Campos vacíos de la dirección, para empezar un formulario.
export const EMPTY_ADDRESS = {
    other_recipient: false,
    recipient_name: "",
    recipient_phone: "",
    street: "",
    exterior_number: "",
    interior_number: "",
    neighborhood: "",
    postal_code: "",
    municipality: "",
    state: "",
    references: "",
};

// La dirección guardada (GET /api/account) como valores del formulario: los
// vacíos del servidor (null) pasan a "" y la casilla se marca si hay quien recibe.
export const addressToForm = (address) => {
    if (!address) return { ...EMPTY_ADDRESS };
    const form = { ...EMPTY_ADDRESS };
    for (const key of Object.keys(EMPTY_ADDRESS)) {
        if (key !== "other_recipient") form[key] = address[key] ?? "";
    }
    form.other_recipient = Boolean(address.recipient_name);
    return form;
};

// Valores del formulario para mandar al servidor. Sin la casilla, no se manda
// quien recibe (lo recibe la titular de la cuenta o quien compra).
export const addressFromForm = (form) => {
    const { other_recipient: otherRecipient, ...fields } = form;
    if (!otherRecipient) {
        fields.recipient_name = "";
        fields.recipient_phone = "";
    }
    return fields;
};
