# Manual de usuario de la demo Baguette

**Autoría:** equipo del prototipo Gestión Café. **Revisión:** 18/10/2026. **Destinatarios:** personal de salón, caja y encargado. **Objetivo:** registrar pedidos y cobros trazables mediante terminal compartida y acordar reglas de operación.

## 1. Alcance

Una sucursal ficticia, ARS y zona horaria configurada. Personas, PIN y precios de prueba. Impresión, bancos, correo y facturación son simulados; los comprobantes indican “Demostración. Sin validez fiscal”. Instalación en [README](../README.md), identidad en [IDENTIDAD.md](IDENTIDAD.md) y evidencia real en [ESTADO-PRUEBAS.md](ESTADO-PRUEBAS.md).

Este manual incorpora la instrucción posterior del usuario: salón sin login individual, identificación por PIN en cada mesa y estado Pedido sin etapas obligatorias de cocina/entrega. Reemplaza esos pasos del manual anterior.

## 2. Entrar a una mesa

Abrí `/`: aparece el salón directamente. Elegí sector, página o vista Lista cuando corresponda. La página inicial debe permanecer dentro de la pantalla; el contenido extenso se recorre dentro de sus paneles y las mesas se paginan.

Tocá una mesa libre u ocupada. Ingresá los cuatro dígitos configurados para vos: al completar el cuarto se verifica automáticamente, sin botón ni Enter. Si el PIN es incorrecto, el campo se limpia y queda listo para reintentar. El sistema identifica al empleado: no hay selector de persona ni contraseña de empleado en este recorrido. Los ceros iniciales cuentan. El encargado debe resolver cualquier PIN repetido antes de habilitarlo.

Cada entrada solicita PIN. Al cerrar el panel, cambiar de mesa o recargar, se descarta la autorización local; volver a la misma mesa también vuelve a pedirlo. Un PIN de encargado no habilita la administración desde la terminal.

## 3. Cargar y enviar

En la terminal, productos, cantidades y notas se guardan al instante en este dispositivo, por empleado y mesa. Podés quitar o corregir productos de ese borrador sin esperar al servidor. Todavía no están enviados ni son visibles desde otro equipo. Si cerrás con la X o recargás, se recuperan al volver a identificarte con tu PIN en la misma mesa. «Salir sin cambios» descarta ese borrador, incluidos comensales y personalizaciones sin agregar, y vuelve al salón. No cancela pedidos ya enviados ni pendientes de confirmación.

Al tocar «Enviar pedido», la mesa se cierra de inmediato y volvés al salón, donde aparece «Enviando pedido…». El servidor confirma el lote completo; recién entonces pasa a Enviados. Una mesa libre abre su cuenta con ese primer envío. Si volvés a entrar mientras se confirma, podés armar otro pedido; para enviarlo o cobrar se espera la confirmación del anterior. Si no llega, entrá en Pendientes: muestra los productos y permite consultar/reintentar con la misma clave, sin duplicar. «Actualizar» permite revisar un rechazo por cambios de cuenta; vuelve a validar precios y disponibilidad actuales.

La mesa abre la carta por categorías y subcategorías. Elegí Cafetería → Cafés clásicos → Café, por ejemplo, y después Con leche, Doble u otra variante. Solo se muestran las subcategorías de la principal elegida; «Todo» permite buscar en toda la carta. Ajustá la cantidad con +/−, elegí agregados y escribí observaciones o tocá una nota rápida. Todo se hace en la misma pantalla. En los productos sin variantes, `+` agrega directamente una unidad. La búsqueda encuentra también variantes sin necesidad de escribir tildes. El pedido se muestra al costado en escritorio; en celular se alterna Carta/Pedido. «Nota» permite agregar o editar observaciones de un ítem antes de enviarlo, según permisos. Revisá los consumos y tocá «Enviar pedido» al pie: quedan en **Enviados**.

No hay que marcar preparando, listo o entregado para continuar. Estos estados de operaciones anteriores permanecen en el historial, pero no forman el recorrido nuevo. Un envío genera su trabajo de impresión y conserva las notas/destino; no acredita papel físico.

La carta para comandar muestra tarjetas compactas con el nombre; la flecha abre las variantes y el botón `+` suma un producto individual. Las categorías se eligen en los filtros, sin repetirse debajo de cada producto. El listado muestra primero los productos por enviar, con la última carga arriba y resaltada. Cada renglón pendiente tiene `− cantidad +` para ajustar unidades de 1 a 100, conservando notas y agregados. «Nota» abre la escritura directamente en el renglón. Los productos enviados se pueden desplegar por separado y conservan sus permisos de corrección; las casillas para dividir o mover consumos aparecen al tocar «Seleccionar productos». Los precios y totales quedan fuera de la carga de pedidos. Se consultan desde «Opciones» → «Ver importes» o al cobrar. «Corregir» y «Anular» están en el botón de tres puntos del renglón, según los permisos.

Cobrar y solicitar cuenta están a la vista, abajo del pedido, según el permiso del empleado. Los cambios de mesa, divisiones y descuentos siguen en «Opciones de cuenta». Mover una mesa cambia el plano; trasladar cuenta cambia dónde se atiende; unir mesas modifica la agrupación física; dividir cuentas distribuye consumos con trazabilidad. Los pagos/descuentos pueden bloquear cambios incompatibles.

El camarero agrega, ajusta cantidades del borrador y envía; no descuenta, anula, modifica consumos enviados, cobra ni cierra. Caja/encargado realizan sus acciones con el acceso autorizado.

## 4. Gestión, caja y catálogo

Entrá por `/gestion` con usuario y contraseña individuales. El seed incluye `admin` (encargado), `caja` (cajero), `mozo`/`moza` y cuentas históricas de cocina/bar; el acceso de gestión se limita a roles autorizados. La clave inicial se toma de `DEMO_PASSWORD` (ejemplo local `DemoBaguette2026!`). Los PIN ficticios configurados están en Usuarios/seed; no se deducen documentos reales.

La demo inicial deja caja abierta con fondo ficticio de $100.000,00 y mesas con consumos/pagos de ejemplo. Antes de demostrar una nueva apertura resolvé los pendientes y cerrá la caja actual.

Para cobrar, revisá saldo y división por importe, partes o ítems/cantidades. Combiná medios en pagos separados. En efectivo distinguí recibido, aplicado y vuelto; esperá confirmación del servidor. Cerrar requiere saldo cero y reglas financieras válidas, sin exigir preparación/entrega.

Descuentos, anulaciones y reintegros conservan motivo, responsable y venta original. La devolución identifica producto/cantidad; el reintegro referencia el pago. Un rechazo fiscal de prueba conserva el cobro.

El administrador gestiona categorías, productos, agregados e imágenes desde Catálogo. En «Crear categoría», dejá «Categoría principal» sin superior para crear una principal, o elegí una para crear una subcategoría. La pestaña Categorías muestra cada principal con sus subcategorías y permite editar su ubicación y orden; se admiten dos niveles. En «Orden en la carta», los números menores aparecen primero. En los productos, «Categoría / subcategoría» muestra la ruta completa. Desactivar una principal oculta toda su rama de la carta y de los nuevos pedidos. Usuarios tiene su propio apartado en el menú principal para administrar accesos, roles y PIN. Activo, disponible y visible en carta son decisiones distintas. La carta pública e imprimible comparte catálogo y está orientada a clientes, sin enlaces a la operación; modificar precio no reescribe ventas anteriores. Las bajas requieren confirmación contextual y preservan historial.

Para crear variantes, completá «Producto base» (por ejemplo, Café) y «Nombre de la variante» (por ejemplo, Con leche) al editar cada producto. Usá el mismo producto base y subcategoría para reunir sus opciones. Dejá ambos campos vacíos para un producto individual. Cada variante conserva su propio precio, agregados y disponibilidad; la carta pública muestra únicamente las variantes visibles. La agrupación no modifica consumos anteriores.

En celular, cada registro del catálogo muestra nombre, precio, estado y Editar sin desplazamiento lateral. La edición conserva todos los campos. Los pendientes muestran acciones en lenguaje cotidiano y se recuperan con «Sincronizar».

## 5. Fallos y recuperación

El indicador de pendientes permite consultar el resultado antes de repetir una operación incierta. No considerar pagado un cobro sin confirmación del servidor. La cola local conserva claves y borradores admitidos, separados por operador, sin PIN ni credenciales.

El PIN se verifica online: sin servidor no se identifica un empleado nuevo ni se abre una mesa nueva. Después de una recarga sin red, los pendientes existentes siguen conservados; al reconectar, entrá con el PIN correspondiente y sincronizá. El alcance offline exacto probado se registra por separado. La recarga offline utiliza la aplicación compilada previamente cargada online, no Vite de desarrollo.

Impresora desconectada permite reintento seguro; resultado incierto requiere consulta o copia motivada. Facturación ficticia permite rechazo/incertidumbre y resolución sin borrar pagos. Cada descarga conserva copia y registro; terminar una respuesta HTTP no confirma que guardaste el archivo ni que se imprimió.

Si olvidaste la contraseña de gestión, solicitá recuperación y consultá con el encargado la bandeja local de pruebas. El token vence y solo se usa una vez. Cerrar la gestión revoca su sesión; la terminal compartida mantiene su propio contexto.

## 6. Referencias

Fuentes reales consultadas el 18 de octubre de 2026; respaldan criterios de diseño, sin certificar la aplicación.

Agencia de Recaudación y Control Aduanero. (s. f.). _Webservice_. https://www.arca.gob.ar/fe/ayuda/webservice.asp

Baguette. (s. f.). _Baguette_. https://baguette.com.ar/

OWASP Foundation. (s. f.). _Password storage cheat sheet_. https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html

OWASP Foundation. (s. f.). _Session management cheat sheet_. https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html

PostgreSQL Global Development Group. (s. f.). _Data types_. https://www.postgresql.org/docs/current/datatype.htm

World Wide Web Consortium. (2024). _Web Content Accessibility Guidelines (WCAG) 2.2_. https://www.w3.org/TR/WCAG22/
