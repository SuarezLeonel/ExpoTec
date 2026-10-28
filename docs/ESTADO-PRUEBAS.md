# Estado de implementación y validación

## Corrección de interacción de la paleta · 22/10/2026

Se quitó la flecha de selección redundante y se corrigió la creación por toque, que antes superponía objetos en una posición fija. Ahora tocar un icono activa la colocación en el siguiente punto elegido del plano. Se muestra la herramienta activa y una vista previa con sus dimensiones; Escape o la X cancelan. El arrastre directo se conserva y los iconos incluyen nombres breves. La papelera permanece visible y deshabilitada sin una selección válida del sector actual.

Pasaron **12/12 escenarios de navegador**, incluidos los seis tipos de objeto, clic, arrastre, táctil en celular chico, teclado, zoom, desplazamiento, borrado con confirmación, deshacer/rehacer, tamaños y encuadre del salón. Tipos, lint y compilación aprobados. Cambios locales sin publicar. [Evidencia](evidence/palette-interactions-2026-10-22.json).

## Paleta para arrastrar y cambio de PIN durante envíos · 22/10/2026

El editor incorpora una paleta de iconos para arrastrar mesas redondas, cuadradas y rectangulares, paredes, puertas y separadores. Funciona con mouse y pantalla táctil, respeta zoom y cuadrícula y cancela al soltar fuera del plano. También admite Enter/Espacio. Los tiradores permiten ajustar el tamaño después de colocar cada objeto.

Al abrir otra mesa, el PIN aparece inmediatamente. Si esa terminal todavía tiene un envío en curso, espera su respuesta antes de validar el nuevo PIN para evitar revocar el permiso del envío anterior. La pantalla indica «Terminando envío anterior…». No se cambió la revocación del servidor. Una segunda terminal puede enviar independientemente de esa espera.

Pasaron **20 escenarios distintos de navegador**: una ejecución de 18 y otra de 3, con un escenario repetido. Incluyen arrastre táctil, edición del plano, pedidos, PIN, errores tardíos y dos terminales con una respuesta retenida. Tipos, lint y compilación aprobados. Cambios locales sin publicar; no se repitieron integración del backend ni pruebas prolongadas de carga. [Evidencia](evidence/palette-pin-2026-10-22.json).

## Revisión acotada de seguridad y recuperación · 22/10/2026

Se reforzó la comprobación exacta de renglones al confirmar pedidos, se corrigieron errores de codificación de solicitudes para devolver 415 en lugar de 500 y se restringieron las suites destructivas de integración a PostgreSQL local. Pasaron **92 pruebas de lógica/integración y 11 recorridos de navegador**, además de tipos, lint y compilación. La base local estaba detenida en el primer intento; se inició sin reinicializar datos y se repitieron las pruebas. Cambios locales sin publicar. [Alcance, resultados y trabajo pendiente](REVISION-SEGURIDAD-2026-10-22.md).

## Editor, PIN al abrir y pedidos anteriores · 22/10/2026

El tamaño de mesas y elementos del editor se cambia desde ocho tiradores en esquinas y bordes, con mouse, táctil y teclado, respetando giro, zoom, cuadrícula y deshacer. Se quitaron ancho, alto y longitud numéricos; las mesas nuevas son más compactas y el dibujo muestra solo el identificador. El salón conserva las dimensiones válidas guardadas en el editor.

El PIN bloquea la apertura de la comandera tanto en terminal como en Gestión. Los pedidos locales nuevos ya no incorporan automáticamente borradores anteriores de la cuenta: se reprodujo y corrigió el envío de café bloqueado por una Medialuna vieja inactiva. Las cargas anteriores quedan identificadas y se conservan. Los pendientes se filtran por mesa, se limpian avisos viejos y al reabrir se consultan confirmaciones sin reenviar pedidos.

Validación: **44 pruebas unitarias aprobadas y 60 recorridos de navegador verificados**. De la ejecución completa, 58 pasaron inicialmente; se repitieron con éxito una navegación interrumpida por una pausa larga y el escenario actualizado de recuperación automática. Después del último ajuste de tamaños se repitieron los seis recorridos del plano. Tipos, lint y compilación aprobados. **Cambios locales sin publicar; base operativa conservada.** [Detalle y límites](EDITOR-Y-ENVIOS-2026-10-22.md), [evidencia](evidence/editor-orders-2026-10-22.json).

## Carga directa de cualquier producto · 21/10/2026

Tocar el nombre de cualquier producto simple agrega una unidad directamente. En las familias, cada variante es un botón que agrega una unidad y permanece disponible para repetir toques. Se quitaron la confirmación intermedia «Agregar al pedido», la cantidad previa y el editor de observaciones del selector. Las notas se agregan o editan desde el ítem del pedido de la derecha, o desde la pestaña Pedido en celular. El envío final conserva el cierre inmediato de la mesa.

Las unidades iguales del borrador local se agrupan hasta el límite de 100 por renglón, conservando separados productos con distintas notas, agregados o precios. Los agregados opcionales siguen disponibles; las variantes incompatibles con los elegidos se deshabilitan. Los productos simples con agregados tienen un acceso específico para configurarlos, mientras tocar el nombre carga la unidad estándar.

Verificación: **51/51 recorridos de navegador aprobados**, sin reintentos ni omitidos, incluidos productos simples, variantes, ráfagas de toques, notas desde el pedido, conservación al recargar, envío, cola offline, seis tamaños del plano, accesibilidad y 70 ciclos de uso prolongado. Tipos, lint, formato de archivos modificados y compilación de producción aprobados. Se usó exclusivamente `baguette_e2e`, conservando la base operativa; no se repitió la suite de integración del backend porque no hubo cambios allí. **Cambios locales, sin publicación.** [Resultado de la ejecución](evidence/direct-ordering-2026-10-21.json).

## PIN y encuadre del salón · 21/10/2026

La web publicada tardó alrededor de tres segundos en las tres verificaciones medidas. Se agregó caché acotada de verificaciones positivas en el servidor y se redujeron los viajes SQL de 18 a 9, manteniendo controles vigentes de identidad, sesión, mesa y permisos. Con 40 ms añadidos por viaje SQL, la mediana de accesos repetidos pasó de 1.543 a 443,5 ms. Es una comparación local controlada; falta medir el resultado publicado.

El plano usa el alto disponible, abre un sector por defecto y encuadra mesas y elementos sin cambiar sus posiciones guardadas. La geometría real de las siete mesas se verificó sin scroll en escritorio y celular. Pasaron 79 pruebas de lógica/integración y 23 recorridos de navegador seleccionados, además de tipos, lint y compilación. **Cambios locales todavía sin desplegar.** [Método, límites y evidencia](PIN-Y-SALON-2026-10-21.md).

## Revisión ECC, cierre al enviar y salida sin cambios · 21/10/2026

Enviar desde una mesa vuelve inmediatamente al salón tanto en la terminal como en Gestión, después de guardar la solicitud local y validar el PIN si corresponde. La prueba mantiene detenida la solicitud para verificar el cierre antes de la respuesta. Si el dispositivo no puede guardar el envío, la mesa sigue abierta y conserva el borrador.

La terminal incorpora «Salir sin cambios»: elimina el borrador y las personalizaciones de esa mesa, conservando pedidos ya enviados o pendientes de confirmación. La X conserva el borrador. Se revisaron las capturas de celular y se comprobaron accesibilidad y controles en los recorridos afectados.

La revisión corrige también la caché creciente entre versiones, las respuestas viejas del resumen de Caja y el foco intermitente después de un PIN incorrecto. Se actualizaron las pruebas al plano continuo y a los sectores vigentes, sin modificar los límites de autenticación de la aplicación. [Hallazgos, correcciones y prioridades pendientes](REVISION-2026-10-21.md).

Verificación final: **72/72 pruebas de lógica e integración y 48/48 recorridos de navegador aprobados**, sin omitidas ni reintentos. Tipos, lint y compilación de producción aprobados. La ejecución final completa repitió el escenario de PIN incorrecto después de corregir el fallo de foco encontrado en una ejecución previa. Incluye 70 ciclos de comandera, recarga offline con caché real, seis tamaños del plano y recorridos de cobros/recuperación. Las pruebas usaron `baguette_test` y `baguette_e2e`; se conservó `baguette_demo`. No se repitió el reinicio de persistencia ni la auditoría externa de dependencias. [Resultados y métricas](evidence/review-2026-10-21.json).

## Prevención de lentitud en sesiones prolongadas · 21/10/2026

La actualización periódica espera cada respuesta y se pausa en pestañas ocultas. Las lecturas del mismo contexto se comparten; cambiar de mesa/operador cancela la anterior. Confirmar una escritura fuerza una lectura posterior al guardado para que una respuesta vieja no vuelva a mostrar la mesa libre. Se limpian temporizadores/listeners al desmontar y se eliminan borradores vacíos después del envío, conservando pedidos pendientes.

La comandera carga solo cuentas activas y sus movimientos. En una prueba con 200 cuentas cerradas y 1.000 consumos históricos, la instantánea del PIN pasó de 495.392 a 992 bytes. Se verificó que las 201 cuentas y los 1.001 consumos seguían disponibles desde Gestión.

Se agregó recuperación del vencimiento de sesión detectado durante la revisión: la terminal recupera su sesión técnica sin F5, conserva el borrador y vuelve a exigir PIN. Gestión vuelve al login con su cola pendiente conservada. No se extiende el plazo de ocho horas del servidor ni se reintentan escrituras automáticamente.

Verificaciones aprobadas: **69 pruebas de lógica/integración y 21 recorridos de navegador**, además de tipos, lint y compilación. Las nuevas pruebas cubren consultas lentas sin superposición, pausa/reanudación y limpieza, respuesta vieja después de un envío, vencimiento de sesión en terminal/Gestión, conservación de borradores y cola, y memoria/tiempo de respuesta durante 70 pedidos consecutivos.

La prueba acelerada completa 70 ciclos de PIN, producto, nota, envío y cierre sin F5. Tras calentamiento compara memoria retenida, nodos, documentos, listeners y tiempo de respuesta. La primera ejecución ya mantuvo estables nodos/listeners; los cambios corrigen los riesgos medidos de consultas superpuestas e historial innecesario, sin atribuir una fuga de memoria que no apareció en la muestra. [Método y alcance](RENDIMIENTO-COMANDERA.md), [métricas antes/después](evidence/long-session-2026-10-21.json). No equivale todavía a una jornada de ocho horas con hardware real.

## Comandera local y envío en segundo plano · 21/10/2026

Productos, cantidades y notas de la terminal se preparan localmente, sin peticiones por pulsación. `order.submit` abre la cuenta si corresponde y guarda/envía todo en una transacción con clave idempotente. La interfaz continúa disponible mientras llega la confirmación, conserva borradores y pendientes por empleado, y permite recuperar respuestas perdidas sin duplicar. El PIN devuelve los datos de la mesa en la misma respuesta. Se añadieron animaciones de 80–150 ms con movimiento reducido.

Verificaciones ejecutadas: **65 pruebas de lógica/integración y 16 recorridos de navegador aprobados**, además de tipos, lint y compilación. Los recorridos abarcan carga local sin escrituras previas, respuesta demorada, cambio de operador durante un envío, recarga con productos/notas/comensales, respuesta perdida, cola offline, PIN automático, coexistencia con Gestión, notas/agregados, categorías, accesibilidad con axe, movimiento reducido y anchos de 320 a 1440 px. Se ajustó la prueba de controles táctiles a la paginación condicional: el salón tiene ocho controles fijos; los de paginación solo existen cuando hay varias páginas.

Comparación controlada contra `89b94d5`, cinco muestras por versión con 1.000 ms de demora por respuesta: agregar pasó de 2.044 ms a 9 ms de mediana; poder volver a usar la carta después de enviar, de 2.053 ms a 23 ms. Estas cifras miden interacción con API simulada, no latencia de PostgreSQL remoto. [Método, alcance y muestras](RENDIMIENTO-COMANDERA.md). Capturas del listado en tablet/móvil y del envío pendiente revisadas. Las bases de prueba `baguette_test` y `baguette_e2e` estuvieron separadas de `baguette_demo`.

## Variantes sin espacio desperdiciado · 20/10/2026

El selector usa columnas según el ancho disponible, opciones desde 36 px con texto de 15 px y separaciones de 4 px. Volver, nombre y cantidad comparten una fila. Agregados, notas y accesos rápidos tienen márgenes menores; el botón de agregar permanece visible. Se eliminaron las reglas que obligaban a una sola columna en tablet y celular.

Se aprobaron seis recorridos de navegador. El caso de nueve variantes comprobó que variantes, cantidad, un agregado y notas entran sin desplazamiento en 1440×768, 1180×720, 1024×768, 870×668, 768×844, 390×844 y 320×844. Se verificaron texto legible, accesibilidad, guardado de notas/agregados, cantidades y envío. Tipos, lint, formato y compilación aprobados; capturas de escritorio y celular inspeccionadas.

## Tarjetas compactas y cantidad directa · 20/10/2026

La comandera muestra solo el nombre y la flecha de variantes o el botón de carga rápida. Se quitaron las rutas repetidas de categorías, el texto de cantidad de variantes y el encabezado redundante; las tarjetas simples parten de 52 px y conservan nombres de 15 px. Cada ítem pendiente muestra `− cantidad +` y conserva notas y agregados. El camarero puede ajustar borradores entre 1 y 100; los enviados mantienen sus permisos de corrección y las cuentas con pagos o descuentos siguen protegidas.

Se aprobaron nueve recorridos de navegador con categorías, notas, cantidades, envío, recuperación offline, accesibilidad y anchos de 320 a 1440 px. Se inspeccionaron capturas de escritorio, tablet y celular. Se comprobaron las cantidades y los permisos de borradores/enviados en integración, además de tipos, lint y compilación.

## Categorías y subcategorías · 20/10/2026

Se verificaron 27 categorías activas y 153 productos en la carta publicada. La migración 011 reúne esas secciones en cinco principales (Cafetería, Desayunos, Cocina, Dulces y Bebidas) y 27 subcategorías, conservando IDs, variantes, precios y consumos. Catálogo permite crear, mover, activar y ordenar ambos niveles. La carta pública, la imprimible y la comandera comparten la jerarquía. Desactivar una principal bloquea también nuevas cargas, aumentos y envíos de sus subcategorías.

Pasaron 61 pruebas de lógica e integración; las pruebas específicas de migración y jerarquía se repitieron después de incorporar el orden. Pasaron 19 recorridos de navegador con categorías, variantes, notas, envío, Gestión, recuperación offline y accesibilidad. Se verificaron anchos de 320, 390, 768, 1024 y 1440 px. Tipos, lint y compilación aprobados. La migración local conservó los 7 productos y 27 consumos existentes; las pruebas se ejecutaron en bases separadas. Se corrigió además la precedencia del estilo del botón «Volver arriba», detectada durante la revisión.

## Comandera compacta sin importes · 20/10/2026

La selección de productos, variantes, agregados y renglones del pedido no muestra precios. Los importes de la cuenta se consultan expresamente desde «Opciones» → «Ver importes» o al cobrar. La carta pública mantiene sus precios. Se redujeron espaciados y alturas de productos y renglones; los nombres conservan 15 px y las notas 14 px. Las acciones frecuentes quedan junto al producto y Corregir/Anular pasan al menú de tres puntos.

La prueba del listado comprobó renglones simples de menos de 70 px, texto de al menos 15 px, ausencia de importes en la carga, navegación de correcciones con teclado, devolución del foco, notas, cantidades, envío, accesibilidad y anchos de 320 a 1440 px. Se revisaron capturas de tablet y celular. Los recorridos de carta pública, variaciones, permisos, Gestión y recuperación offline verifican las superficies afectadas.

## Listado de comanda · 20/10/2026

El pedido prioriza las cargas pendientes, muestra la más reciente arriba, separa los enviados en un desplegable y presenta cantidad, producto, importe y notas por renglón. «+1» aumenta el ítem pendiente conservando observaciones y agregados. La selección múltiple y el detalle de importes se despliegan a pedido; enviar y cobrar permanecen fuera del desplazamiento de la lista.

Se aprobaron los once recorridos existentes de las superficies afectadas y una prueba nueva con varias cargas, nombre largo, notas con foco automático, aumento de cantidad, selección, envío e historial. La nueva prueba verificó espacio útil del listado y ausencia de desbordes a 320, 390, 768, 870, 1024 y 1440 px; también accesibilidad con axe. Tipos, lint y compilación aprobados. Las cargas de prueba se realizaron en `baguette_e2e`, separada de los pedidos de la aplicación local. Capturas revisadas de escritorio, tablet y celular.

## Variantes y nueva comandera · 20/10/2026

Productos base con variantes configurables en Catálogo y compartidas con la carta pública. La migración agrupa las opciones conocidas sin cambiar sus precios ni los consumos existentes. La comandera incorpora selección de variante, cantidad con +/−, agregados propios de cada opción, notas rápidas y edición de notas desde el pedido. Las acciones de envío y cobro permanecen visibles al abrir opciones de cuenta. Gestión conserva «Cerrar sesión» visible en la barra superior.

Verificaciones ejecutadas: cinco pruebas específicas de agrupación, búsqueda, precios y validación; once recorridos de navegador aprobados, incluidos envío, recarga, cola offline por empleado, coexistencia con Gestión, notas, agregados y carta pública. Los recorridos verificaron accesibilidad con axe y anchos de 320, 390, 768, 1024 y 1440 px. Tipos, lint y compilación aprobados. La ejecución inicial de la suite de lógica e integración aprobó 56 pruebas; luego se añadió la quinta prueba específica de variantes y se ejecutaron las cinco juntas. Las bases de pruebas permanecieron separadas de `baguette_demo`.

Se revisaron las capturas de la comandera en escritorio y celular. «Cerrar sesión» se comprobó además a 320, 390, 768 y 1440 px, incluyendo cancelar y confirmar el cierre. No hubo publicación ni push.

## Ajuste vigente · operación rápida

PIN con campo de 96 px y caracteres de 44 px, diálogo compacto y validación automática. Menos texto en pantallas y formularios; controles más grandes; acciones de cobro a la vista; catálogo móvil sin desplazamiento lateral para editar; pendientes con nombres cotidianos y «Sincronizar».

Se aprobaron los 19 recorridos completos antes de los últimos ajustes de catálogo/cabecera, luego 6 recorridos sobre las superficies afectadas y una comprobación final de gestión en ambos temas. Tipos, lint y compilación aprobados. Se capturaron y revisaron login, caja, catálogo, servicios, auditoría, PIN y pedido en 390×844 y 1440×900, sin desborde horizontal; PIN y paginación también se verificaron a 320×568. Las pruebas de accesibilidad automatizadas siguen aprobadas en su alcance registrado.

[Contrato y evidencia de operación rápida](evidence/quick-ui-2026-10-20/design-evidence.json). La información de simulación, cobros inciertos, conexión y borrado se conserva. No hubo cambios de permisos ni publicación.

## Revisión vigente · 20/10/2026

Mejoras de seguridad, recuperación de operaciones y usabilidad aplicadas con ECC. [Detalle y límites](REVISION-2026-10-20.md). Se conservaron los datos de `baguette_demo`; integración y navegador utilizaron bases separadas. Windows, Node.js 24.14.1, PostgreSQL 18.4 y Brave mediante Playwright.

| Comprobación                                | Resultado actual                                          |
| ------------------------------------------- | --------------------------------------------------------- |
| Tipos, lint y compilación de producción     | Aprobados                                                 |
| Unitarias e integración con PostgreSQL real | **51/51 aprobadas**, sin omitidas                         |
| Recorridos completos del navegador          | **18/18 aprobados**, sin reintentos ni omitidos           |
| Dependencias: consulta autorizada a npm     | **0 vulnerabilidades conocidas**                          |
| Evidencia de diseño ECC                     | Registro y comprobador aprobados; capturas inspeccionadas |
| Reinicio del clúster PostgreSQL             | No repetido; evidencia anterior conservada abajo          |

El navegador ejercitó terminal automática; PIN correcto/incorrecto, cambio de empleado y reentrada; separación de gestión; carta y agregados; pedido, cobro mixto y cierre; catálogo público/impreso; respuestas perdidas de cobro/caja; cola offline con recarga y sincronización sin duplicados; y renovación de PIN sin abrir otra mesa encima de la cola.

Ajuste posterior: el PIN ahora se valida al completar el cuarto dígito, sin botón ni Enter. Se repitieron los 18 recorridos existentes y aprobaron; una prueba nueva de envío automático, error/foco y bloqueo de duplicados aprobó por separado después de corregir su selector ambiguo del nombre del operador. Tipos, lint y compilación también aprobaron. [Ejecuciones del PIN automático](evidence/review-2026-10-20/pin-auto-validation.json).

La paginación conservó 80 mesas accesibles sin desplazamiento de documento en 1440×900, 1519×639, 1024×768, 768×1024, 390×844 y 320×568. Se inspeccionaron formularios y comanda en 390×844 y 1440×900, ambos temas, teclado/foco, contraste con axe, movimiento reducido y diez controles táctiles de al menos 44×44 a 390 px. Cero infracciones automáticas en las superficies analizadas no constituye una certificación universal de accesibilidad.

Los estados de espera y disponibilidad parcial se verificaron reteniendo/interceptando respuestas locales con datos ficticios. Los recorridos operativos usan API y PostgreSQL reales; la prueba específica de confirmaciones JSON inválidas usa API interceptada para reproducir respuestas que el servidor normal no emite.

En la revisión se corrigieron además esperas frágiles de pruebas existentes: selección de sector tras carga, etiqueta vigente «Pedido» y espera de confirmación antes de simular una respuesta de pago perdida. No se eliminaron escenarios ni se forzaron clics para ocultar bloqueos.

Evidencia actual: [resumen de pruebas](evidence/review-2026-10-20/test-summary.json), [diseño y estados](evidence/review-2026-10-20/design-evidence.json), [dependencias](evidence/review-2026-10-20/dependency-audit.json), [agregados móvil](evidence/review-2026-10-20/addons-390.png) y [catálogo escritorio](evidence/review-2026-10-20/catalog-empty-1440.png).

Siguen pendientes habilitación de producción, enrolamiento de equipos/red, HTTPS, restauración de respaldos, carga sostenida e integraciones reales de impresión, correo, bancos y fiscalidad. No hubo publicación ni push.

## Registro histórico conservado · 18/10/2026

Las tablas pendientes de esta sección corresponden al registro previo y quedan sustituidas por la validación vigente anterior. Se conservan para no atribuir resultados antiguos a cambios posteriores.

Revisión: 18/10/2026. Proyecto local GestionCafe, Windows, Node.js 24.14.1, PostgreSQL 18.4 real y Brave mediante Playwright. No se publicó ni se hizo push.

## Cambio vigente y alcance de la evidencia

El usuario pidió posteriormente terminal compartida sin login en `/`, identificación por PIN en **cada** entrada de mesa, gestión separada en `/gestion`, PIN activos únicos, Pedido sin etapas obligatorias de preparación y página inicial sin scroll de documento con paginación. Esta revisión cambia autenticación, permisos, estados y layout. **Las pruebas anteriores no acreditan automáticamente ese flujo nuevo.**

| Estado       | Significado                                                            |
| ------------ | ---------------------------------------------------------------------- |
| Implementado | Código y persistencia presentes; la inspección no sustituye ejecución  |
| Probado      | Comprobación efectivamente ejecutada con resultado/alcance registrados |
| Simulado     | Adaptador local funcional; no demuestra el servicio externo            |
| Pendiente    | Falta integración, ejecución o decisión identificada                   |

## Validación de esta revisión

Pendiente consolidar resultados después de integrar backend/frontend. No se atribuyen todavía al cambio vigente conteos de unitarias, integración, compilación, E2E, responsive o accesibilidad.

| Comprobación nueva                                                                      | Resultado de esta revisión                 |
| --------------------------------------------------------------------------------------- | ------------------------------------------ |
| Entrar a `/` sin empleado/login; sesión técnica automática                              | Pendiente ejecución                        |
| PIN identifica al operador sin selector; libre y ocupada                                | Pendiente ejecución                        |
| Cerrar/reabrir misma mesa exige PIN; cambiar mesa/recargar descarta comprobante         | Pendiente ejecución                        |
| PIN incorrecto, ceros iniciales, duplicado activo y reactivación                        | Pendiente API y navegador                  |
| Token de otra mesa/terminal, vencimiento y revocación                                   | Pendiente API                              |
| Sesiones terminal/gestión independientes; admin PIN no gestiona catálogo                | Pendiente API y navegador                  |
| Enviar queda Pedido; no cocina/listo/entregado; cobrar y cerrar sin esos pasos          | Pendiente API y navegador                  |
| Persistencia de historial previo y migraciones sin restaurar datos                      | Pendiente ejecución                        |
| Página inicial sin scroll de documento, muchas mesas/paginación, temas y teclado        | Pendiente navegador en tamaños registrados |
| Cola offline, actor de pendientes y consulta de respuestas inciertas con nuevo contexto | Pendiente regresión                        |
| Tipos, lint, formato, compilación y suites completas después del cambio                 | Pendiente ejecución final                  |

## Evidencia anterior conservada

Antes de esta revisión se ejecutaron `typecheck`, `lint`, `format:check` y `build` aprobados; `npm test` **30/30** y E2E **12/12** sobre API/base aisladas `baguette_e2e`. Se comprobó reinicio real de PostgreSQL mediante huella de cuentas, ítems, pagos y operaciones, y `npm audit` informó cero vulnerabilidades en esa corrida. Estos resultados se conservan como regresión de la versión anterior, no como aprobación de terminal/PIN actual.

Evidencia guardada: [E2E anterior](evidence/e2e.json), [reinicio anterior](evidence/persistence.json), [dependencias](evidence/dependency-audit.json) y [plano anterior de 80 mesas](evidence/plano-80-mesas.png).

La versión anterior probó catálogo público/impreso, altas/agregados/notas/envío/recarga, pagos mixtos/vuelto/cierre, pérdida de respuestas de pago/caja y lookup sin duplicados, corte de red real con cola/recarga/sincronización, y axe en varias pantallas/temas. También probó un modelo anterior de PIN por usuario autenticado y preparación/entrega. Esos dos modelos quedan sustituidos por la instrucción vigente.

La cobertura API anterior incluyó integridad, permisos, concurrencia, descuentos/reintegros exactos, rangos monetarios, snapshots, impresión/fiscal simulados, auditoría y archivos. No representa haber recorrido íntegramente los trece escenarios por navegador ni todos los controles en cada combinación.

## Simulado y pendiente externo

Tarjetas/transferencias son registros internos; no bancos. Impresión y facturación usan adaptadores persistentes. Correo en bandeja local protegida. “Demostración. Sin validez fiscal” en documentos ficticios. No hay papel físico, correo externo, CAE ni emisión ARCA confirmados.

Pendientes operativos: mesa/plano real, política final del encargado, colisiones de sufijos reales, dispositivos y red del local, hardware de impresión, fiscalidad con contabilidad, respaldos/recuperación, HTTPS, carga sostenida y prueba con empleados. No se promete offline completo ni conformidad universal de accesibilidad.

Migración de PIN: el seed solo puede completar localizadores de sufijos ficticios conocidos cuya verificación resulte válida. Los PIN personalizados anteriores requieren nueva configuración de administración; no se deducen desde el hash. Si la salida de una mesa ocurre sin red, el token se borra localmente, pero la liberación remota no puede confirmarse hasta reconectar o vencer.

## Registro final de ejecución

Completar por integración con fecha, comando/recorrido, resultado, artefacto y limitación. Mantener separado el resultado API del navegador y el de esta revisión del anterior. No borrar pruebas ni debilitar validaciones para obtener verde.
