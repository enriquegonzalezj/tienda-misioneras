# Tienda en línea Vocaciones MHPVM

Tienda en línea con módulo de donativos para Vocaciones MHPVM, de las Misioneras Hijas de la Purísima Virgen María (Aguascalientes, México). La congregación la administra por su cuenta desde un panel propio: productos, fotos, existencias, paqueterías, campañas, pedidos y donativos.

- En línea: https://www.vocacionesmhpvm.com (hasta el lanzamiento, fuera de los buscadores).
- Desarrollo: Enrique González, 2026.
- [English summary](#english-summary)

## Qué hace

- Catálogo con categorías y subcategorías, productos con hasta dos opciones (por ejemplo color y talla) y existencias por variante.
- Carrito y pago con Mercado Pago (Checkout Pro con la API de Orders), como invitado o con cuenta.
- Donativos de monto libre, en un flujo aparte del carrito.
- Cuentas de cliente con historial de pedidos, dirección guardada y recuperación de contraseña por correo.
- Campañas de descuento por fechas: para todo el público o solo con cuenta, en toda la tienda o en productos elegidos, y con descuento en el envío.
- Panel de administración: inventario con edición rápida, formulario de producto con variantes y fotos, pedidos con número de guía y cancelación con reembolso, donativos y campañas.
- Correos automáticos con Resend: pago, envío, entrega, cancelación, reembolsos y avisos a la tienda.
- SEO armado en el servidor: título, descripción, Open Graph y datos estructurados de producto en cada página, sitemap dinámico y código 404 real.

## Decisiones técnicas

- Precios, descuentos, envío y totales se calculan siempre en el servidor, con el mismo cálculo para lo que se muestra y lo que se cobra. Nunca se confía en un importe que mande el navegador.
- Al ir a pagar, las existencias se apartan 30 minutos con bloqueo de filas (`SELECT ... FOR UPDATE`) y un orden de bloqueo fijo, para que dos procesos a la vez no se esperen entre sí. Las reservas vencidas se liberan solas, sin tareas programadas.
- El webhook de Mercado Pago exige firma, es idempotente por id de pago, consulta siempre la orden en lugar de creer el aviso y comprueba importe y moneda. Si llega un pago que ya no se puede atender (un pedido sustituido o sin unidades, o un pago repetido), se reembolsa solo.
- Sesión con JWT en cookies httpOnly, protección CSRF de doble envío, contraseñas con scrypt y límites de intentos.
- Los pedidos de invitado se consultan solo con un token aleatorio de 256 bits, con `noindex` y `no-referrer`; en los registros del servidor el token sale tachado.
- Las fotos se revisan con Pillow antes de subirlas: se valida el contenido real del archivo, se reducen y se les quitan los metadatos (GPS, cámara).
- Fuentes servidas desde el propio servidor y ningún script de terceros salvo Mercado Pago, para no compartir la IP de las visitas.
- Los textos de la interfaz no marcan género.

## Stack

- Frontend: React 18, Vite 7, Tailwind CSS 4 y React Router 6, en JavaScript (`src/front`).
- Backend: Python 3.13, Flask 3.1, SQLAlchemy 2.0, Flask-Migrate, flask-jwt-extended y Flask-Limiter (`src/api`).
- Base de datos: PostgreSQL 18, la misma versión mayor en local y en producción.
- Servicios: Mercado Pago, Resend y Cloudinary. Despliegue en Render y dominio en Cloudflare.
- Flask sirve también el frontend compilado: una sola aplicación en una sola dirección, sin CORS.

## Requisitos

- Python 3.13 y pipenv.
- Node 22.12 o superior.
- PostgreSQL 18 en local, escuchando solo en `localhost`, con un usuario propio para la app (no `postgres`) que sea dueño de la base de desarrollo.
- Un archivo `.env` en la raíz, a partir de `.env.example`. Nunca se sube al repositorio. `DATABASE_URL` tiene el formato `postgresql://USUARIO:CONTRASENA@localhost:5432/BASE` (contraseña solo con letras y números, para no tener que codificarla en la URL).

## Arranque en local

```powershell
pipenv install
npm install
pipenv run upgrade
```

En dos terminales:

```powershell
pipenv run start   # backend en http://127.0.0.1:3001
npm run start      # frontend en http://localhost:3000
```

Vite reenvía `/api` a Flask, así que todo se abre desde `http://localhost:3000`. Para comprobar que el backend responde: `http://localhost:3000/api/health`.

## Comandos útiles

- `pipenv run migrate`: genera una migración después de cambiar modelos.
- `pipenv run upgrade`: aplica las migraciones.
- `pipenv run flask create-admin`: crea una cuenta de administración.
- `pipenv run flask seed-sample`: carga datos de ejemplo (solo en local).
- `npm run build`: compila el frontend en `dist/`.

## Reglas del proyecto

Las reglas de negocio, seguridad, SEO y forma de trabajo están en [CLAUDE.md](CLAUDE.md). El proyecto se desarrolló con Claude Code.

## Derechos

© 2026 Enrique González. Todos los derechos reservados. El código se puede consultar, pero no copiar ni reutilizar sin permiso por escrito. El nombre, los logotipos y los textos de Vocaciones MHPVM pertenecen a la congregación.

## English summary

Online store with a donations module, built for Vocaciones MHPVM, a religious congregation in Aguascalientes, Mexico. The sisters run it themselves from their own admin panel. Live at https://www.vocacionesmhpvm.com (kept out of search engines until launch).

Highlights:

- Prices, discounts, shipping and totals are always computed on the server, with one shared calculation for what is shown and what is charged.
- Stock is reserved for 30 minutes at checkout using row locks (`SELECT ... FOR UPDATE`) with a fixed lock order; expired reservations are released without scheduled jobs.
- Signed, idempotent Mercado Pago webhook that always re-fetches the order and checks amount and currency, with automatic refunds for payments that can no longer be fulfilled.
- JWT in httpOnly cookies with double-submit CSRF, scrypt password hashing and rate limits.
- Server-rendered SEO from Flask: titles, Open Graph, product structured data, a dynamic sitemap and real 404 status codes.
- Transactional email with Resend; product photos are validated and stripped of metadata before going to Cloudinary.

Stack: React 18, Vite 7, Tailwind CSS 4, Flask 3.1, SQLAlchemy 2.0 and PostgreSQL 18, deployed on Render.

© 2026 Enrique González. All rights reserved. The code may be viewed but not copied or reused without written permission. The Vocaciones MHPVM name, logos and texts belong to the congregation.
