# Tienda en línea y donativos: Misioneras Hijas de la Purísima Virgen María

## Qué es este proyecto
- Tienda de artículos religiosos (unos 50 productos) con módulo de donativos, para una congregación en Aguascalientes, México. Quienes la administran no son técnicas.
- Lo desarrolla Enrique (Madrid) con Claude Code, en Windows 11 con PowerShell o Git Bash. Es su primer proyecto real con Claude Code: necesita entender cada paso, no solo aprobarlo.
- Fechas: Revisión 1 (catálogo y panel de productos) el 5 de noviembre, Revisión 2 (compra completa) el 11, Revisión 3 (panel de gestión) el 16, prueba de aceptación el 18 y entrega el jueves 19 de noviembre de 2026. Plan interno: terminar el 14 de noviembre.
- Las tareas tienen un ID (1.3, 4.6, 6.1...) que viene del cronograma interno de Enrique. Úsalo cuando él lo mencione.

## Stack (decidido, no lo cambies sin preguntar)
- Base: plantilla react-flask-hello de 4Geeks. Backend en `src/api`, frontend en `src/front`.
- Frontend: React + Vite + Tailwind CSS. JavaScript, no TypeScript.
- Backend: Flask + SQLAlchemy, migraciones con Flask-Migrate. Base de datos PostgreSQL.
- **Flask sirve también el frontend.** No hay sitio estático separado. Para las páginas públicas de producto y categoría, Flask entrega el `index.html` con título, descripción, imagen y precio ya inyectados (SEO y vista previa al compartir por WhatsApp o redes). Después React funciona como SPA. Las rutas públicas de React y las de Flask deben coincidir.
- Autenticación con JWT para dos roles: administradora y cliente. Contraseñas con hash.
- Pagos: Mercado Pago. Imágenes: Cloudinary. Correo transaccional: Resend, con dominio verificado.
- Hosting: Render (un servicio web para Flask más frontend, y PostgreSQL de pago).
- Python con pipenv (`Pipfile` y `Pipfile.lock`, ambos en el repositorio). Instalar paquetes siempre con `pipenv install <paquete>`, nunca con pip directo. Las llaves van en `.env`, con un `.env.example` sin valores.

## Reglas de negocio
- Solo se venden productos físicos a direcciones de México. Los donativos están abiertos a cualquier país. Moneda: MXN.
- **Compra como invitada o con cuenta.** La compra sin registro siempre está disponible. Al final del pago se ofrece crear una cuenta con los mismos datos, más una contraseña. Con cuenta, la clienta ve su historial de pedidos y tiene sus datos guardados. Incluye recuperación de contraseña por correo.
- **Campañas de descuento para clientas registradas.** No hay un descuento automático por registrarse. La administradora crea una campaña desde el panel (por ejemplo, 10% o 20%, con fecha de inicio y fin) y mientras esté activa aplica a las clientas con sesión iniciada. El descuento siempre se calcula en el servidor.
- Existencias: al público solo se muestra "disponible" o "agotado", nunca la cantidad. Se validan en el servidor al confirmar el pago, con bloqueo de fila o actualización atómica. Si dos personas compran el último producto, solo una completa la compra; a la otra se le cancela y se le avisa.
- Envío: dos opciones de paquetería con tarifa fija. Las tarifas las define la congregación: léelas de configuración y no inventes valores.
- Estados de pedido: pendiente, pagado, enviado, entregado y cancelado.
- Donativos: montos sugeridos y monto libre, con el mismo checkout y la misma pasarela que los productos. La interfaz no dice nada sobre deducibilidad ni facturación.
- Correos automáticos: confirmación a la clienta al confirmarse el pago, aviso de pedido o donativo nuevo a la congregación y recuperación de contraseña.
- Producto: SKU, nombre, slug, descripción, descripción corta para Google, categoría y subcategoría, precio de venta, costo de compra, existencias e imágenes.
- **El costo de compra es solo interno.** Nunca aparece en endpoints ni respuestas públicas, solo en las del panel.
- Panel de administración, Etapa 1: productos, categorías, imágenes, existencias, pedidos, donativos y campañas.
- Panel de administración, Etapa 2: calculadora de precio (precio = costo / (1 - margen deseado)), margen real por producto descontando la comisión de Mercado Pago y los descuentos, tasa de IVA configurable, dashboard de ventas, costo y margen por periodo, e informes descargables en Excel (openpyxl).
- Toda la interfaz va en español de México. Variables, funciones y archivos, en inglés.

## SEO (desde el inicio)
- URLs con slug (`/producto/rosario-de-madera`), generado a partir del nombre.
- Cada página pública lleva su propio título, meta descripción, etiquetas Open Graph, un solo h1 y texto alternativo en las imágenes.
- Datos estructurados schema.org de Product (precio, disponibilidad, imagen) en la ficha.
- `noindex` en carrito, checkout, cuenta y panel. `sitemap.xml` dinámico con los productos activos y `robots.txt`.
- Una ruta inexistente devuelve un 404 real. Imágenes de Cloudinary con `f_auto,q_auto` y carga diferida.

## Diseño
- Referencia: la página de la congregación, mhpvm.org. Fondos blancos, sobria, serena y pocas imágenes decorativas, pensada para conectar con jóvenes. En el catálogo, fotos de producto con fondo blanco y uniformes.
- Hasta recibir el manual de marca, usa colores y tipografías provisionales como variables del tema de Tailwind, en un solo archivo. Al llegar el manual, solo se cambia ese archivo.
- El diseño de cada pantalla se aprueba antes de programarla. Si no hay diseño aprobado para una pantalla, pregunta.

## Alcance
- Fuera de alcance: gastos generales de la congregación, facturación electrónica automática, envíos fuera de México, buscador de productos, preguntas frecuentes y envío automatizado con paquetería. Si se te ocurre algo extra, anótalo y pregunta; no lo construyas.
- Si la Etapa 2 se aprieta, el orden de recorte es: primero los informes en Excel, después un dashboard simplificado.

## Seguridad (obligatorio)
- Nunca escribas llaves ni contraseñas en el código. Nunca leas, muestres ni subas `.env`. Antes del primer commit, confirma que `.gitignore` lo excluye.
- Precios, descuentos, envío y totales se calculan siempre en el servidor, desde la base de datos. Nunca confíes en importes que mande el navegador.
- Webhook de Mercado Pago: verifica la firma según la documentación oficial vigente, consulta el pago a la API antes de marcar un pedido como pagado y hazlo idempotente.
- No toques ni registres datos de tarjeta.
- Las rutas del panel exigen JWT con rol de administradora. Las de cliente solo devuelven los datos de esa clienta. Limita los intentos de inicio de sesión. Los enlaces para recuperar contraseña son de un solo uso y caducan.
- Sin CORS: el frontend y la API comparten dirección. En desarrollo, Vite reenvía `/api` a Flask (puerto 3001) con un proxy. El frontend usa siempre rutas relativas `/api`, nunca una URL completa del backend.
- Subida de imágenes: valida tipo y tamaño antes de enviarlas a Cloudinary.
- Datos personales: guarda solo los necesarios. Hay un aviso de privacidad que cumplir (LFPDPPP).
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

## Comandos
- Instalar backend: `pipenv install`
- Aplicar migraciones: `pipenv run upgrade`
- Generar una migración tras cambiar modelos: `pipenv run migrate`
- Arrancar backend (puerto 3001): `pipenv run start`
- Comprobar en qué migración está la base: `pipenv run flask db current`
- Instalar frontend: `npm install`
- Arrancar frontend: `npm run start`