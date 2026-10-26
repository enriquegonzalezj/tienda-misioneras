"""
Contraseñas: hash, verificación y reglas mínimas (tarea 1.5).

Nunca se guarda la contraseña, solo su hash. Se usa scrypt (de Werkzeug, que
ya viene con Flask): añade una sal aleatoria a cada hash y es lento a propósito,
para que un hash robado cueste mucho de romper.
"""
from werkzeug.security import check_password_hash, generate_password_hash

# Administradoras: 15 caracteres como mínimo (NIST SP 800-63B-4 para contraseñas
# usadas como único factor). Su cuenta controla todo el panel.
ADMIN_MIN_LENGTH = 15
# Tope alto pero finito: deja usar frases largas y evita que alguien mande
# un texto enorme para que el servidor gaste tiempo calculando su hash.
MAX_LENGTH = 128

# Secuencias de teclado o de números: "123456789012345" o "qwertyuiopasdfg"
# cumplen la longitud, pero son de lo primero que se prueba.
KEYBOARD_SEQUENCES = (
    "01234567890123456789012345678901234567890",
    "abcdefghijklmnñopqrstuvwxyzabcdefghijklmnñopqrstuvwxyz",
    "qwertyuiopasdfghjklñzxcvbnmqwertyuiopasdfghjklñzxcvbnm",
)
# Palabras del contexto de la tienda que no deben ser la contraseña.
CONTEXT_WORDS = ("mhpvm", "vocaciones", "misioneras", "purisima", "purísima")


def hash_password(password):
    return generate_password_hash(password, method="scrypt")


def verify_password(password_hash, password):
    return check_password_hash(password_hash, password)


def password_problem(password, min_length, email=None):
    """Devuelve un texto con el problema de la contraseña, o None si es válida.
    No exige mayúsculas ni símbolos: la longitud protege más y esas reglas
    empujan a contraseñas predecibles (por ejemplo, Hola123!)."""
    if len(password) < min_length:
        return f"La contraseña debe tener al menos {min_length} caracteres."
    if len(password) > MAX_LENGTH:
        return f"La contraseña no puede tener más de {MAX_LENGTH} caracteres."
    lowered = password.lower()
    # Pocos caracteres distintos (aaaa..., 121212...) o una secuencia de teclado.
    if len(set(lowered)) <= 3 or any(lowered in seq for seq in KEYBOARD_SEQUENCES):
        return "Esa contraseña es demasiado fácil de adivinar. Elige otra."
    if any(word in lowered for word in CONTEXT_WORDS):
        return "La contraseña no puede contener el nombre de la tienda o de la congregación."
    if email:
        local_part = email.split("@")[0].lower()
        if len(local_part) >= 4 and local_part in lowered:
            return "La contraseña no puede contener tu correo."
    return None
