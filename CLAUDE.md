# Tienda en línea y donativos: Misioneras Hijas de la Purísima Virgen María

## Qué es este proyecto
- Tienda en línea de Vocaciones MHPVM (merch, papelería, accesorios y artículos religiosos) con módulo de donativos, para una congregación en Aguascalientes, México. Arranca con pocos productos y debe soportar al menos 100 sin cambios. Quienes la administran no son técnicas.
- Lo desarrolla Enrique (Madrid) con Claude Code, en Windows 11 con PowerShell o Git Bash. Es su primer proyecto real con Claude Code: necesita entender cada paso, no solo aprobarlo.
- Fechas: Revisión 1 (catálogo y panel de productos) el 5 de noviembre, Revisión 2 (compra completa) el 11, Revisión 3 (panel de gestión) el 16, prueba de aceptación el 18 y entrega el jueves 19 de noviembre de 2026. Plan interno: terminar el 14 de noviembre.
- Las tareas tienen un ID (1.3, 4.6, 6.1...) que viene del cronograma interno de Enrique. Úsalo cuando él lo mencione.

## Stack (decidido, no lo cambies sin preguntar)
- Base: plantilla react-flask-hello de 4Geeks. Backend en `src/api`, frontend en `src/front`.
- Frontend: React 18 + Vite 7 + Tailwind CSS 4. JavaScript, no TypeScript. Tailwind se conecta con el plugin `@tailwindcss/vite`; no hay `tailwind.config.js` ni `postcss.config.js` (el tema se define en CSS con `@theme`, ver Diseño). `package.json` lleva `"type": "module"`.
- Backend: Flask + SQLAlchemy, migraciones con Flask-Migrate. Base de datos PostgreSQL 18, la misma versión mayor en local y en Render (al crear la base en Render, elegir la 18 explícitamente). En local, el servidor escucha solo en localhost y la app se conecta con un usuario propio que es dueño de la base, nunca con el superusuario postgres.
- **Flask sirve también el frontend.** No hay sitio estático separado. Para las páginas públicas de producto y categoría, Flask entrega el `index.html` con título, descripción, imagen y precio ya inyectados (SEO y vista previa al compartir por WhatsApp o redes). Después React funciona como SPA. Las rutas públicas de React y las de Flask deben coincidir.
- Autenticación con JWT para dos roles: administradora y cliente. Contraseñas con hash.
- Pagos: Mercado Pago. Imágenes: Cloudinary. Correo transaccional: Resend, con dominio verificado.
- Hosting: Render (un servicio web para Flask más frontend, y PostgreSQL de pago).
- Python con pipenv (`Pipfile` y `Pipfile.lock`, ambos en el repositorio). Instalar paquetes siempre con `pipenv install <paquete>`, nunca con pip directo. Las dependencias principales van fijadas con `~=` en el Pipfile, no con `"*"`, y después de cada instalación se revisa con `git diff Pipfile.lock` qué versiones cambiaron. SQLAlchemy se queda en 2.0 (`~=2.0.44`) salvo que Enrique decida otra cosa. Las llaves van en `.env`, con un `.env.example` sin valores.
- npm: versiones con `^` sobre la versión mayor (por ejemplo `^7.3.7`), verificadas en npm antes de instalarlas. Después de cada instalación se revisa `git diff package-lock.json`. `npm audit fix` nunca con `--force`: los cambios de versión mayor (por ejemplo React Router 7) se deciden aparte.

## Reglas de negocio
- Solo se venden productos físicos a direcciones de México. Los donativos están abiertos a cualquier país. Moneda: MXN.
- **Compra como invitada o con cuenta.** La compra sin registro siempre está disponible. Al final del pago se ofrece crear una cuenta con los mismos datos, más una contraseña. Con cuenta, la clienta ve su historial de pedidos y tiene sus datos guardados (una sola dirección). Incluye recuperación de contraseña por correo. La cuenta pide "Nombre(s)" y "Apellidos" en dos campos y teléfono opcional de 10 dígitos (uso permitido: entregas y avisos del pedido; usarlo para promociones exige declararlo en el aviso de privacidad con opción de negarse). La invitada consulta su pedido con un enlace que lleva un `access_token`.
- **Campañas de descuento.** No hay descuento automático por registrarse. La administradora crea campañas desde el panel con: público ("Solo clientas con cuenta", por defecto, o "Todas"), alcance (toda la tienda o productos seleccionados), porcentaje entero opcional y precios fijos opcionales por variante, fechas de inicio y fin (días completos en hora de México, ambos incluidos) y un interruptor "¿descuenta también el envío?" (apagado por defecto). En cada variante se cobra el precio más bajo entre el normal, el del porcentaje y el fijo; nunca se suman. Siempre se muestra el precio normal tachado. Dos campañas pueden coincidir en fechas solo si no comparten productos (una de toda la tienda los comparte todos): lo bloquea el panel y, si aun así coinciden, el servidor aplica el precio más bajo. Si dos descuentan el envío, se aplica el descuento mayor. Nunca aplican a donativos. Se calculan siempre en el servidor.
- **Existencias.** Se llevan por variante. Al público solo se muestra "disponible" o "agotado", nunca la cantidad. Un producto se muestra agotado cuando todas sus variantes lo están; una variante agotada aparece tachada y no se puede elegir. Se reservan al ir a pagar: el servidor crea el pedido pendiente y descuenta las existencias con una actualización atómica (`UPDATE ... SET stock = stock - n WHERE id = ... AND stock >= n`) o bloqueo de fila. Si no alcanza, ese pedido no se crea y se avisa a la clienta. La reserva dura 30 minutos (`reserved_until`), con el mismo límite en la preferencia de Mercado Pago; si la clienta genera una ficha de OXXO, se alarga hasta que vence la ficha (3 días). Al vencer sin pago, el pedido se cancela y las unidades vuelven. Las reservas vencidas se liberan cuando alguien consulta existencias o va a pagar (sin tareas programadas en Render).
- Envío: dos opciones de paquetería con tarifa fija. Las tarifas las define la congregación: léelas de configuración y no inventes valores.
- Estados de pedido: pendiente, pagado, enviado, entregado y cancelado. Estados de donativo: pendiente, pagado y cancelado. El folio visible (MHP-000123) se calcula con el id y no se guarda.
- Donativos: monto libre (cada persona escribe cuánto quiere donar, sin montos sugeridos), con la misma pasarela que los productos pero en un flujo aparte del carrito, sin envío ni campañas. Valida en el servidor un monto mínimo mayor que cero. Se piden nombre completo y correo; ni país ni dirección. La interfaz no dice nada sobre deducibilidad ni facturación.
- Correos automáticos: confirmación a la clienta al confirmarse el pago, aviso de pedido o donativo nuevo a la congregación y recuperación de contraseña.
- Producto: nombre, slug, descripción, descripción corta para Google, categoría, imágenes (con texto alternativo obligatorio) y al menos una variante. Las categorías tienen dos niveles (categoría y subcategoría); si una categoría tiene subcategorías, el producto va obligatoriamente en una de ellas. Una categoría solo se borra si está vacía. El producto nace oculto hasta que la administradora lo activa. El slug se genera al crear, es editable, no se regenera al renombrar y lleva `-2` si se repite.
- **Variantes.** Todo producto tiene al menos una variante; un producto sin opciones tiene una sola variante por defecto. Máximo 2 opciones por producto (por ejemplo Color y Talla), con sus valores en orden (M, G, EG) y color de muestra opcional. Cada variante lleva SKU (texto único que escribe la administradora), sus valores de opción, precio de venta, costo de compra y existencias. El carrito, los pedidos y las existencias apuntan siempre a la variante, nunca al producto. En la ficha, si las variantes tienen precios distintos, el catálogo muestra "Desde" con el menor.
- **Vender nunca borra nada.** Un producto o variante tiene tres estados: disponible, agotado (visible, no se compra) y archivado (`is_active = false`: oculto, conserva sus ventas y se puede reactivar). "Borrar" en el panel borra de verdad solo si nunca se vendió; si tiene ventas, archiva. La base lo garantiza: los renglones de pedido apuntan a la variante con RESTRICT, y una campaña usada en pedidos no se borra, se desactiva.
- Panel de administración, Etapa 1: productos con sus variantes, categorías y subcategorías (crear, editar y borrar si están vacías), imágenes, existencias por variante, pedidos, donativos y campañas.
- Panel de administración, Etapa 2: calculadora de precio (precio = costo / (1 - margen deseado)), margen real por variante descontando la comisión de Mercado Pago y los descuentos, tasa de IVA configurable, dashboard de ventas, costo y margen por periodo, e informes descargables en Excel (openpyxl).
- Toda la interfaz va en español de México. Variables, funciones y archivos, en inglés.

## Modelo de datos (tarea 1.3, en `src/api/models.py`)
- Catálogo: `categories` (dos niveles con `parent_id`; `card_text` e `image_public_id` opcionales para las tarjetas de Inicio), `products`, `product_images`, `product_options`, `product_option_values` (`position`, `swatch_hex`), `product_variants` y `variant_option_values`.
- Cuentas: `users` (un solo modelo con `role` `admin` o `customer`; el registro público siempre pone `customer`; las administradoras se crean solo con un comando) y `addresses` (una por usuaria; `delivery_references` porque `references` es palabra reservada).
- Ventas: `campaigns`, `campaign_variants` (`fixed_price` opcional), `orders`, `order_items` y `donations`.
- El pedido guarda una copia de los datos de la compradora, la dirección, el envío y, por renglón, nombre, precio normal (`list_unit_price`), precio cobrado (`unit_price`) y costo (`unit_cost`, para el margen de la Etapa 2). Si después cambia el producto, el pedido no cambia.
- Cada renglón guarda la campaña que le puso el precio (`order_items.campaign_id`; vacío si se cobró el precio normal, y la base exige campaña si el precio está rebajado). El pedido guarda la campaña que descontó el envío (`orders.shipping_campaign_id`).
- Mercado Pago: `mp_payment_id` único (webhook idempotente), `mp_status` y `mp_fee` (comisión real).
- `access_token` largo y aleatorio en pedidos y donativos, para que nadie vea uno ajeno cambiando el número.
- Convenciones: dinero en `Numeric(10,2)`, nunca Float. Fechas con zona horaria, en UTC. Estados como texto con CHECK, no ENUM nativo. Teléfono (10 dígitos) y código postal (5) como texto, validados por CHECK. Correos en minúsculas (CHECK; pasarlos a minúsculas en el servidor antes de guardar o buscar). `TimestampMixin` para `created_at` y `updated_at`. `NAMING_CONVENTION` en la metadata. `Base(DeclarativeBase)` con `SQLAlchemy(model_class=Base)`.
- Migraciones: `pipenv run migrate -m "mensaje corto sin acentos"` (va al nombre del archivo, que Alembic recorta a 40 caracteres). Revisa siempre el archivo generado antes de `pipenv run upgrade`. Alembic no detecta las restricciones CHECK nuevas en tablas que ya existen ni los renombres de columnas (los genera como borrar y crear): esos cambios se revisan y completan a mano en la migración. Los `batch_alter_table` vienen del `env.py` de la plantilla y en PostgreSQL no afectan.

## SEO (desde el inicio)
- URLs con slug (`/producto/playera-modelo-3`), generado a partir del nombre. Las variantes no tienen URL propia.
- Cada página pública lleva su propio título, meta descripción, etiquetas Open Graph, un solo h1 y texto alternativo en las imágenes.
- Datos estructurados schema.org de Product (precio, disponibilidad, imagen) en la ficha.
- `noindex` en carrito, checkout, cuenta y panel. `sitemap.xml` dinámico con los productos activos y `robots.txt`.
- Una ruta inexistente devuelve un 404 real. Imágenes de Cloudinary con `f_auto,q_auto` y carga diferida.

## Diseño
- Referencia: la página de la congregación, mhpvm.org. Fondos blancos, sobria, serena y pocas imágenes decorativas, pensada para conectar con jóvenes. En el catálogo, fotos de producto con fondo blanco y uniformes.
- Marca provisional, tomada de la lámina actual de Vocaciones MHPVM, como variables del tema de Tailwind (`@theme`) en un solo archivo: `src/front/index.css`. Al llegar el manual de marca, solo se cambia ese archivo (y `package.json` si cambian los paquetes de fuentes).
  - Colores: azul marino `#0C3F68` (textos principales, botones y pie de página), verde `#008F60`, amarillo `#F6B728`, rojo `#EE4851`, gris `#D6D5D5` y blanco `#FFFFFF`. Verde, amarillo y rojo solo en acentos pequeños, nunca como texto pequeño sobre blanco (no cumplen el contraste).
  - Tokens por función, no por color: `primary` (azul marino), `accent` (verde), `highlight` (amarillo), `alert` (rojo), `line` (gris, bordes), `surface` (blanco, fondo) y `muted` (texto secundario, `#4A5560`, provisional). Fuentes: `font-display` (títulos), `font-sans` (texto, por defecto) y `font-script`. Las pantallas públicas usan solo estos tokens, nunca colores sueltos ni la paleta por defecto de Tailwind.
  - Tipografías: Oswald para títulos, Montserrat para el texto y Yellowtail solo para el acento "Amar y consolar". Son de Google Fonts, pero se sirven desde nuestro servidor con paquetes `@fontsource` (importados en `index.css`), nunca con un enlace a `fonts.googleapis.com`, para no enviar la IP de las visitantes a terceros.
- Maquetas de Inicio, Tienda, Producto y Donaciones (móvil y escritorio): enviadas el 21 de octubre y aprobadas el 23. Comentario de la congregación: el logo debe verse completo; se resuelve con el archivo original, que llega con el manual de marca el 6 de noviembre. Están en `design/maquetas/`. Carrito, checkout, cuenta y panel todavía no tienen diseño aprobado.
- El diseño de cada pantalla se aprueba antes de programarla. Si no hay diseño aprobado para una pantalla, pregunta.

## Alcance
- Fuera de alcance: gastos generales de la congregación, facturación electrónica automática, envíos fuera de México, buscador de productos, preguntas frecuentes y envío automatizado con paquetería. Si se te ocurre algo extra, anótalo y pregunta; no lo construyas.
- Si la Etapa 2 se aprieta, el orden de recorte es: primero los informes en Excel, después un dashboard simplificado.

## Seguridad (obligatorio)
- Nunca escribas llaves ni contraseñas en el código. Nunca leas, muestres ni subas `.env`. Antes del primer commit, confirma que `.gitignore` lo excluye.
- Precios, descuentos, envío y totales se calculan siempre en el servidor, desde la base de datos. Nunca confíes en importes que mande el navegador.
- **El costo de compra es solo interno.** `cost` de la variante y `unit_cost` del renglón nunca aparecen en endpoints ni respuestas públicas, solo en las del panel.
- Pedidos y donativos de invitada se consultan solo con su `access_token` (generado con `secrets`), nunca con el id.
- Webhook de Mercado Pago: verifica la firma según la documentación oficial vigente, consulta el pago a la API antes de marcar un pedido como pagado y hazlo idempotente.
- No toques ni registres datos de tarjeta.
- Las rutas del panel exigen JWT con rol de administradora. Las de cliente solo devuelven los datos de esa clienta. Limita los intentos de inicio de sesión. Los enlaces para recuperar contraseña son de un solo uso y caducan.
- Sin CORS: el frontend y la API comparten dirección. En desarrollo, Vite reenvía `/api` a Flask (puerto 3001) con un proxy. El frontend usa siempre rutas relativas `/api`, nunca una URL completa del backend.
- Subida de imágenes: valida tipo y tamaño antes de enviarlas a Cloudinary.
- Datos personales: guarda solo los necesarios. Hay un aviso de privacidad que cumplir (LFPDPPP). No cargues fuentes, scripts ni otros recursos de terceros que reciban la IP de las visitantes sin necesidad (Mercado Pago sí es necesario); si hace falta uno, pregunta.
- Si ves un riesgo de seguridad mientras trabajas en otra cosa, avísame aunque no lo haya pedido.

## Cómo trabajar con Enrique
- Una tarea por vez. Antes de tocar código, explica en pocas líneas y en lenguaje sencillo qué vas a hacer, qué archivos vas a cambiar y por qué. Espera su aprobación.
- Explica el porqué de cada cambio, no solo la solución. Sé directo, sin relleno ni exceso de disculpas.
- Entrega archivos completos, no fragmentos sueltos.
- Si algo es ambiguo o hay una decisión de arquitectura, pregunta antes de asumir.
- Al terminar cada bloque, di cómo probarlo y sugiere el mensaje del commit. Así queda un punto al que volver.
- Antes de borrar o renombrar cualquier archivo, busca en todo el repositorio (excepto `node_modules`, `dist` y `.git`) si algún archivo lo importa o lo menciona, y ponlo en el plan.
- Cada commit debe dejar la app arrancando. Si un cambio rompe otra parte, se arregla en el mismo commit.
- Antes de modificar muchos archivos, confirma que `git status` esté limpio. Nada de comandos destructivos (`git reset --hard`, borrar tablas o carpetas) sin confirmación.
- No despliegues ni cambies variables de entorno en Render sin avisar.
- Cuida el uso, porque Enrique tiene límite semanal. No explores `node_modules`, `venv`, `dist` ni archivos grandes sin necesidad, y trabaja sobre los archivos que te nombre.

## Decisiones abiertas (pregunta antes de asumir y actualiza esta lista al resolverlas)
1. Nombres y tarifas de las dos paqueterías: Enrique hace la propuesta el 30 de octubre y la congregación elige el 3 de noviembre.
2. Si Mercado Pago acepta tarjetas extranjeras para donativos desde fuera de México. No lo prometas en la interfaz hasta confirmarlo.
3. Dirección definitiva de la tienda (dominio): se decide el 2 de noviembre.
4. Tasa de IVA para la calculadora: Enrique la revisa con la congregación antes de la tarea 6.1.
5. Si se acepta pago en efectivo en OXXO para productos. El modelo sirve para las dos respuestas; si no, se excluye con `excluded_payment_types` (`ticket`). No afecta a donativos.

## Comandos
- Instalar backend: `pipenv install`
- Aplicar migraciones: `pipenv run upgrade`
- Generar una migración tras cambiar modelos: `pipenv run migrate -m "mensaje sin acentos"`
- Arrancar backend (puerto 3001): `pipenv run start`
- Comprobar en qué migración está la base: `pipenv run flask db current`
- Instalar frontend: `npm install`
- Arrancar frontend: `npm run start`
- Compilar el frontend (lo que sirve Flask): `npm run build`
