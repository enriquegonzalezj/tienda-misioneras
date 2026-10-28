import logo from "../assets/logo.webp";

// Recuadro que ocupa el lugar de la foto cuando un producto o una categoría
// todavía no la tiene (la API manda image: null). Así la rejilla no se descuadra
// y la tarjeta se ve terminada mientras las fotos se suben desde el panel.
//
// Lleva el logo en gris y tenue para que se lea como "aquí va la foto" de la
// propia tienda y no como una imagen rota. Es decorativo: los lectores de
// pantalla lo saltan (aria-hidden y alt vacío), porque el nombre ya está en la tarjeta.
// Ocupa todo el espacio de su contenedor: el tamaño lo decide la tarjeta.
export const ImagePlaceholder = () => {
    return (
        <div className="flex h-full w-full items-center justify-center bg-surface-alt" aria-hidden="true">
            <img src={logo} alt="" className="w-1/3 max-w-24 opacity-25 grayscale" decoding="async" />
        </div>
    );
};
