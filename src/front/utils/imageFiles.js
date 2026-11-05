// Comprobación de fotos en el navegador antes de enviarlas (tarea 2.1, paso 8).
// Solo sirve para avisar sin esperar al servidor: la comprobación de verdad la
// hace el servidor (api/images.py), que mira el contenido real del archivo.
// Los límites y los textos son los mismos que allí.

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

// Para <input type="file" accept>. En el celular ofrece la cámara y la galería;
// un iPhone convierte sus fotos HEIC a JPG porque HEIC no está en la lista.
export const IMAGE_ACCEPT = IMAGE_TYPES.join(",");

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB, límite del plan Free de Cloudinary
export const MAX_PRODUCT_IMAGES = 10;

// "10\u00a0MB" lleva un espacio que no se parte: el número y la unidad van juntos.
export const IMAGE_HINT = "JPG, PNG o WebP, hasta 10\u00a0MB.";

// Motivo por el que no se puede subir, o null. Si el navegador no sabe el tipo
// (algunos sistemas no lo dicen), se deja pasar y decide el servidor.
export const imageFileProblem = (file) => {
    if (file.type && !IMAGE_TYPES.includes(file.type)) return "Solo se pueden subir fotos JPG, PNG o WebP.";
    if (file.size > MAX_IMAGE_BYTES) return "La foto pesa más de 10 MB.";
    if (file.size === 0) return "El archivo está vacío.";
    return null;
};
