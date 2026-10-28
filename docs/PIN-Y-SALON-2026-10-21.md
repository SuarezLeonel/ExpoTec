# PIN y tamaño del salón · 21/10/2026

Se midió el acceso normal en la web proporcionada por el usuario y se corrigieron el backend y el plano localmente. **Estos cambios todavía no se publicaron.** El conector de Vercel rechazó la consulta al proyecto con 403 por falta de autorización para su ámbito; la medición de la página pública se realizó con un navegador aislado. No se enviaron pedidos ni se modificaron mesas en producción.

## Mediciones

| Entorno                                                                                  | Antes                   | Después                            |
| ---------------------------------------------------------------------------------------- | ----------------------- | ---------------------------------- |
| Web publicada, tres verificaciones de PIN                                                | 2.988, 2.980 y 3.000 ms | Pendiente de despliegue y medición |
| HTTP y PostgreSQL locales, 40 ms añadidos por viaje SQL, mediana de 14 accesos repetidos | 1.543 ms                | 443,5 ms                           |
| Misma prueba, p95 de accesos repetidos                                                   | 1.942,5 ms              | 514,3 ms                           |
| Consultas por verificación en esa prueba                                                 | 18                      | 9                                  |
| Primera verificación de esa prueba                                                       | 1.494,9 ms              | 1.084,8 ms                         |

La mejora de mediana del 71 % corresponde al ensayo controlado, no a una medición posterior en Vercel. Las 14 muestras repetidas no permiten caracterizar las colas de latencia de producción. El arranque de nuevas instancias y la latencia real de la base todavía influyen.

[Web publicada antes](evidence/pin-published-before-2026-10-21.json), [ensayo antes](evidence/pin-before-2026-10-21.json), [ensayo después](evidence/pin-after-2026-10-21.json). El ensayo reproducible es `scripts/benchmark-pin.mjs`; solo acepta `baguette_test` en localhost y recrea exclusivamente su esquema. No ejecutarlo simultáneamente con la suite de integración, que usa esa misma base.

## Acceso por PIN

Se incorporó una caché de resultados positivos de la verificación criptográfica: cinco minutos, hasta 256 entradas por proceso, limpieza de vencidas y una única verificación para solicitudes simultáneas equivalentes. Su clave es un resumen del PIN protegido y el hash vigente. No guarda PIN en texto, identidades, permisos ni tokens; las verificaciones fallidas o con error se descartan.

La identidad y el hash se consultan en la base en cada acceso. Antes de emitir el permiso operativo se vuelven a comprobar empleado activo, versión del PIN, sesión, mesa activa y permisos dentro de la transacción. Cambiar el hash evita reutilizar el resultado anterior. Se mantienen CSRF, auditoría, vencimiento, límites de intentos y bloqueo transaccional. Cada instancia nueva comienza sin caché.

Se agruparon las consultas de sesión/permisos, los controles de emisión, la escritura del permiso/auditoría/contador y la instantánea de la mesa. Los importes de las agregaciones JSON conservan la validación de enteros seguros. Se eliminó el cálculo criptográfico ficticio durante la importación del módulo; el login con credenciales inexistentes lo sigue utilizando cuando corresponde.

## Plano

El salón usa el alto disponible, abre inicialmente el sector Salón y encuadra automáticamente mesas y elementos publicados. Se respetan sus posiciones, tamaños acotados y rotaciones. El encuadre elimina espacio vacío de coordenadas lejanas; no escribe posiciones nuevas. Las coordenadas antiguas de grilla se acomodan solo al mostrarse. El zoom manual permite ampliar y restablecer el encuadre.

Todo el salón presenta los sectores juntos, en columnas en escritorio y filas en celular. En pantallas muy pequeñas esa vista general puede reducir las mesas; elegir un sector permite trabajar con mayor tamaño. Lista sigue disponible.

La geometría real de la web se reprodujo localmente, con datos operativos simulados y sin usuarios ni consumos: las siete mesas entraron en 1440×900, 390×844 y 320×568, en vista individual y general. En el sector Salón las mesas midieron 162, 61 y 49 px respectivamente. [Resultado del encuadre](evidence/salon-fit-published-geometry-2026-10-21.json). Se inspeccionaron capturas de escritorio y celular.

## Verificación

- 79/79 pruebas de lógica e integración, incluidas expiración/capacidad/concurrencia de caché, cambio de PIN y revocación vigente de empleado, sesión, mesa y permisos.
- 23/23 recorridos de navegador seleccionados: densidad, comandera rápida, pedidos, PIN, estados visuales, operación, encuadre y sesión prolongada. Incluyen seis tamaños de pantalla y 70 ciclos sin acumulación de consultas o listeners.
- Tipos, lint y compilación de producción aprobados.

Las suites usaron `baguette_test` y `baguette_e2e`. Se conservó la base operativa. No se repitió toda la suite de navegador, la auditoría externa de dependencias ni una jornada real de ocho horas.
