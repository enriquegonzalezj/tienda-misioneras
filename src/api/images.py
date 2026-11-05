"""
Fotos (tarea 2.1, paso 8: lo mínimo de la 2.2). Comprueba, limpia y sube a
Cloudinary las fotos de producto y las imágenes de tarjeta de las categorías.

Por qué pasan por Flask y no van directo del navegador a Cloudinary: así la
llave de Cloudinary solo vive en el servidor (.env o Render) y nada llega a
Cloudinary sin pasar antes por estas comprobaciones.

Qué se hace con cada archivo:
  1. Se mira el contenido real con Pillow, no la extensión ni lo que diga el
     navegador: solo JPG, PNG o WebP; hasta 10 MB y 25 megapíxeles (límites del
     plan Free de Cloudinary); sin animación.
  2. Se gira según la orientación que guardó la cámara y, si es muy grande, se
     reduce a 2400 px por el lado más largo (la tienda la muestra a 1200 px como
     mucho; así ocupa menos en Cloudinary).
  3. Se vuelve a guardar solo con la imagen: sin EXIF ni XMP, que en una foto
     tomada con el celular llevan la ubicación GPS y el modelo del teléfono. Sí
     se conserva el perfil de color (ICC), que no tiene datos personales y evita
     que los colores cambien.
  4. Se sube a la carpeta de CLOUDINARY_FOLDER con un nombre descriptivo que
     sale de la dirección del producto o de la categoría en la tienda, más 6
     letras al azar para que dos fotos nunca se llamen igual. Por ejemplo
     tienda-misioneras/productos/sudadera-roja-k3x9qa. Google usa el nombre de
     la imagen como una pista ligera (lo que más pesa es el texto alternativo).
     El nombre del archivo original no se usa para nada: puede traer datos
     personales ("IMG_2034", "casa de...") o caracteres raros.

En la base solo se guarda el public_id; la URL la arma catalog.py (_image_url).
"""
import io
import logging
import os
import re
import secrets
import string

import cloudinary
import cloudinary.uploader
from cloudinary.exceptions import Error as CloudinaryError
from PIL import Image, ImageOps

from api.utils import APIException

logger = logging.getLogger(__name__)

MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MB, límite del plan Free de Cloudinary
MAX_PIXELS = 25_000_000  # 25 megapíxeles, también del plan Free
MAX_SIDE = 2400  # lado más largo con el que se guarda
# Lo que Flask deja entrar en una petición (app.py): la foto más un margen para
# el resto del formulario. Lo que pase de ahí se corta con un 413.
MAX_REQUEST_BYTES = MAX_FILE_BYTES + 512 * 1024

# Formato que detecta Pillow -> (extensión en Cloudinary, opciones al guardar).
FORMATS = {
    "JPEG": ("jpg", {"quality": 90}),
    "PNG": ("png", {}),
    "WEBP": ("webp", {"quality": 90}),
}

# Carpeta en Cloudinary: minúsculas, números, guiones y barras (por ejemplo
# tienda-misioneras/pruebas). Un tramo no puede ser "v" seguida de números,
# porque Cloudinary lo confundiría con la versión de la URL.
FOLDER_PATTERN = re.compile(r"^[a-z0-9_-]+(/[a-z0-9_-]+)*$")
VERSION_LIKE = re.compile(r"^v\d+$")

# Nombre en Cloudinary: la dirección en la tienda (ya va en minúsculas, sin
# acentos ni espacios), recortada, más un guion y 6 letras o números al azar.
NAME_MAX = 100
NAME_SUFFIX_LENGTH = 6
NAME_ALPHABET = string.ascii_lowercase + string.digits
NOT_NAME_CHARS = re.compile(r"[^a-z0-9-]+")

NOT_CONFIGURED = "Las fotos todavía no están configuradas en el servidor."
WRONG_TYPE = "Solo se pueden subir fotos JPG, PNG o WebP."


def _folder():
    """Carpeta de CLOUDINARY_FOLDER, o None si falta o no es válida. No impide
    arrancar el servidor (en local se trabaja sin Cloudinary); solo impide subir."""
    folder = os.getenv("CLOUDINARY_FOLDER", "").strip().strip("/")
    if not FOLDER_PATTERN.match(folder):
        return None
    if any(VERSION_LIKE.match(part) for part in folder.split("/")):
        return None
    return folder


def _require_configured():
    # El SDK lee CLOUDINARY_URL del entorno al importarse (pipenv carga el .env antes).
    config = cloudinary.config()
    if not (config.cloud_name and config.api_key and config.api_secret) or _folder() is None:
        raise APIException(NOT_CONFIGURED, status_code=503)


def _public_name(base):
    """Nombre de la foto en Cloudinary: "sudadera-roja-k3x9qa". `base` es la
    dirección del producto o de la categoría; por si acaso, se deja solo con
    minúsculas, números y guiones."""
    clean = NOT_NAME_CHARS.sub("-", (base or "").lower()).strip("-")[:NAME_MAX].strip("-") or "foto"
    suffix = "".join(secrets.choice(NAME_ALPHABET) for _ in range(NAME_SUFFIX_LENGTH))
    return f"{clean}-{suffix}"


def _file_from_request(request):
    """El archivo del campo "file" del formulario, ya leído (hasta 10 MB)."""
    upload = request.files.get("file")
    if upload is None:
        raise APIException("Elige una foto para subir.", status_code=400)
    data = upload.stream.read(MAX_FILE_BYTES + 1)
    if not data:
        raise APIException("El archivo está vacío.", status_code=400)
    if len(data) > MAX_FILE_BYTES:
        raise APIException("La foto pesa más de 10 MB.", status_code=413)
    return data


def clean_image(data):
    """Comprueba la imagen y la devuelve limpia: (bytes, extensión).
    Lanza APIException 400 con un mensaje para la pantalla si no sirve."""
    try:
        image = Image.open(io.BytesIO(data))
    except Image.DecompressionBombError:
        raise APIException("La foto tiene demasiados píxeles: usa una de 25 megapíxeles o menos.", status_code=400)
    except Exception:
        # Pillow no la reconoce como imagen: un PDF renombrado, un archivo dañado...
        raise APIException(WRONG_TYPE, status_code=400)

    if image.format not in FORMATS:
        raise APIException(WRONG_TYPE, status_code=400)
    width, height = image.size
    if width * height > MAX_PIXELS:
        raise APIException("La foto tiene demasiados píxeles: usa una de 25 megapíxeles o menos.", status_code=400)
    if getattr(image, "is_animated", False):
        raise APIException("Las imágenes animadas no se pueden subir.", status_code=400)

    source_format = image.format  # se guarda igual que llegó: JPG como JPG, PNG como PNG...
    extension, save_options = FORMATS[source_format]
    icc_profile = image.info.get("icc_profile")
    try:
        image.load()  # aquí se lee de verdad: si está cortada o dañada, falla
        image = ImageOps.exif_transpose(image)
    except Exception:
        raise APIException("No se pudo leer la foto. Puede estar dañada: prueba con otra.", status_code=400)

    # Modo de color que admite cada formato al guardarlo.
    has_alpha = image.mode in ("RGBA", "LA", "PA") or (image.mode == "P" and "transparency" in image.info)
    if extension == "jpg":
        image = image.convert("RGB") if image.mode not in ("RGB", "L") else image
    elif has_alpha:
        image = image.convert("RGBA")
    elif image.mode not in ("RGB", "L"):
        image = image.convert("RGB")

    if max(image.size) > MAX_SIDE:
        image.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)

    # Sin info: así no se copia nada de la original (EXIF, XMP, comentarios).
    image.info = {}
    if icc_profile:
        save_options = {**save_options, "icc_profile": icc_profile}
    output = io.BytesIO()
    image.save(output, format=source_format, **save_options)
    return output.getvalue(), extension


def upload_from_request(request, name):
    """Lee, comprueba, limpia y sube la foto de la petición. Devuelve su public_id.
    `name` es la dirección en la tienda del producto o la categoría (ver
    _public_name). Primero se comprueba la configuración, para no leer el
    archivo si no se puede subir."""
    _require_configured()
    data, extension = clean_image(_file_from_request(request))
    folder = _folder()
    try:
        result = cloudinary.uploader.upload(
            data,
            filename=f"foto.{extension}",  # nombre fijo: el del archivo original no se envía
            public_id=_public_name(name),
            resource_type="image",
            asset_folder=folder,  # dónde se ve en la consola de Cloudinary
            public_id_prefix=folder,  # y la misma carpeta delante del nombre
            overwrite=False,
            allowed_formats=["jpg", "png", "webp"],
            timeout=60,
        )
    except CloudinaryError as error:
        logger.warning("Cloudinary rechazó la subida: %s", error)
        raise APIException("Cloudinary no aceptó la foto. Inténtalo de nuevo en un momento.", status_code=502)
    except Exception as error:  # sin conexión, tiempo agotado...
        logger.warning("No se pudo conectar con Cloudinary: %r", error)
        raise APIException("No se pudo conectar con Cloudinary. Inténtalo de nuevo en un momento.", status_code=502)
    public_id = result.get("public_id")
    if not public_id or len(public_id) > 255:
        logger.warning("Respuesta inesperada de Cloudinary al subir: %r", result)
        raise APIException("Cloudinary no aceptó la foto. Inténtalo de nuevo en un momento.", status_code=502)
    return public_id


def destroy_image(public_id):
    """Borra la foto en Cloudinary. Se llama después de guardar en la base: si
    Cloudinary falla, la foto ya no se usa y solo queda ocupando espacio, así que
    se anota en el registro y no se molesta a quien administra."""
    if not public_id:
        return
    try:
        result = cloudinary.uploader.destroy(public_id, resource_type="image", invalidate=True, timeout=30)
    except Exception as error:
        logger.warning("No se pudo borrar %s en Cloudinary: %r", public_id, error)
        return
    if result.get("result") not in ("ok", "not found"):
        logger.warning("Cloudinary no borró %s: %r", public_id, result)


def destroy_images(public_ids):
    for public_id in public_ids:
        destroy_image(public_id)
