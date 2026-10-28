# Editor, PIN y envíos · 22/10/2026

## Cambios

En Diseño del salón, seleccionar una mesa, pared, puerta o separador muestra ocho tiradores de tamaño: cuatro esquinas y cuatro bordes. El arrastre funciona con mouse y táctil, respeta rotación, zoom y cuadrícula, mantiene el lado opuesto y crea un único paso de Deshacer. Escape o cancelar el puntero restaura la geometría original. También admite selección con Enter/Espacio y ajuste con flechas. Se quitaron los campos de ancho, alto y longitud.

El editor abre al 80 %, las mesas nuevas miden 64 × 64 y muestran solo su identificador. Los tamaños y posiciones guardados de mesas existentes se conservan; pueden modificarse con los tiradores. La capacidad sigue siendo una propiedad de la mesa, sin ocupar espacio dentro de su dibujo.

El encuadre y el dibujo del salón comparten los límites válidos del editor. Antes podían recortar una dimensión válida a otro tamaño después de publicar; ahora conservan los tamaños entre 40 y 500 y siguen acotando valores antiguos fuera de rango.

El PIN se solicita al tocar una mesa tanto en la terminal como en Gestión. Cancelar o estar esperando su validación no muestra la comandera. Cerrar y reabrir exige una nueva identificación. Gestión conserva su sesión administrativa, y entrar sin conexión sigue bloqueado: no se almacenan PIN para eludir la validación.

## Medialunas ajenas al pedido nuevo

Se reprodujo el caso de una cuenta que conserva una Medialuna anterior en borrador, cuyo producto ya no está disponible. La carta importada desactiva productos de ejemplo; al cargar un café, el envío anterior añadía todos los borradores de la cuenta a `item_ids`. El servidor podía rechazar el pedido completo por la Medialuna, aunque el café sí estuviera disponible.

Ahora un pedido local nuevo de la terminal envía únicamente sus productos. Los borradores previos quedan visibles bajo «Cargas anteriores sin enviar», conservan sus datos y tienen una acción de envío separada. No se anulan consumos ni se cambia su estado automáticamente. Gestión conserva su flujo de cargas guardadas en servidor.

Los pendientes se filtran por mesa dentro de la comandera y llevan un rótulo de mesa en el panel. El botón de la mesa desaparece cuando no tiene pendientes. Al entrar se limpian avisos anteriores; una respuesta tardía de otra mesa no muestra su error dentro de la actual.

Al reingresar se consulta el resultado de los `order.submit` propios de esa mesa usando su clave original. Solo se retiran de la cola cuando `confirmedOrder` valida una confirmación completa. Una consulta ausente, incompleta o fallida conserva la solicitud para revisión. Este proceso consulta resultados; no reenvía pedidos automáticamente.

## Alcance y comprobación

Se probaron tiradores con mouse y táctil, giro, zoom, cuadrícula, límites, teclado, cancelación, historial, guardado y recarga del borrador. Las regresiones de pedidos incluyen café con Medialuna anterior inactiva, pendientes de otra mesa, errores tardíos y recuperación de confirmaciones sin reenvío. El PIN se retiene para comprobar que la mesa no abre durante la espera, se cancela y se vuelve a pedir al reabrir.

Las pruebas usaron la compilación local y `baguette_e2e`, sin modificar la base operativa ni publicar el proyecto. Los resultados finales quedan registrados en [evidencia de validación](evidence/editor-orders-2026-10-22.json).

Pasaron 44 pruebas unitarias. Se verificaron 60 recorridos de navegador: 58 pasaron en la ejecución inicial y dos se repitieron con éxito después de una interrupción prolongada y de adaptar la expectativa de recuperación manual a automática. El tiempo total de aquella ejecución interrumpida no constituye una medición de rendimiento. Tras unificar los tamaños del editor y del salón se repitieron los seis recorridos del plano, todos aprobados. Tipos, lint y compilación final pasaron. No se repitió la suite de integración del backend, que no cambió.

Se conservó la revocación del permiso anterior al cambiar de PIN. Para evitar que el nuevo PIN revoque un envío todavía en curso de esa terminal, la web muestra el PIN inmediatamente y espera los envíos ya iniciados antes de solicitar su validación. Indica «Terminando envío anterior…» durante esa espera. Se verificaron tanto confirmaciones como errores tardíos. Esto puede demorar la validación del siguiente PIN si la respuesta anterior tarda; no cambia la admisión ni la revocación del servidor para otros clientes.

La creación de objetos del editor usa ahora una paleta de iconos arrastrables, con tres formas de mesa, pared, puerta y separador. El arrastre admite mouse y pantalla táctil, respeta zoom y cuadrícula y se cancela fuera del plano. La comprobación adicional incluye dos terminales independientes: una confirma su pedido mientras la otra conserva una respuesta retenida. [Resultados adicionales](evidence/palette-pin-2026-10-22.json).
