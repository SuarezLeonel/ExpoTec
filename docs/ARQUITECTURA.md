# Arquitectura y decisiones

Fecha: 18/10/2026. Alcance: una sucursal, una base y datos ficticios. No hay multitenencia ni administración de franquicias.

## Componentes

```text
Navegador React/Vite/Bootstrap
   │ POST JSON, cookie de sesión y CSRF
API Express/TypeScript ESM
   ├─ terminal compartida y gestión con sesiones independientes
   ├─ catálogo, salón, cuentas y pedidos
   ├─ caja, cobros y compensaciones
   ├─ impresión, facturación y archivos
   └─ auditoría e idempotencia
          │ transacciones y consultas parametrizadas
     PostgreSQL + almacenamiento de archivos del servidor
```

`frontend/src` separa páginas, componentes, contextos, servicios, tipos y estilos. `backend/src/modules` agrupa responsabilidades; configuración, middleware y base tienen carpetas propias. Los scripts SQL de `backend/sql` constituyen el esquema reproducible. La pantalla pública consume el catálogo operativo mediante un DTO limitado.

## Decisiones aceptadas

| Decisión                             | Motivo y consecuencia                                                                                                                                                                                                                                       |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monolito modular                     | Permite transacciones entre cuentas, pagos y caja sin distribuir consistencia entre servicios. Cada nueva sucursal podrá desplegar una instancia independiente.                                                                                             |
| PostgreSQL real, local o externo     | Claves foráneas, restricciones, bloqueos y transacciones protegen datos persistentes. El paquete local inicia un proceso PostgreSQL; no reemplaza la base con memoria o SQLite.                                                                             |
| Importes enteros en centavos         | Evita errores binarios de dinero. UI convierte formato argentino; el servidor valida enteros acotados y calcula totales.                                                                                                                                    |
| Instantáneas de ítems                | Nombre, descripción, precio y agregados de una venta sobreviven a cambios del catálogo. Esta redundancia preserva un hecho histórico, no una segunda carta editable.                                                                                        |
| Sesión revocable en servidor         | Cerrar sesión o desactivar un usuario invalida acceso. La autorización se resuelve en backend, además de la presentación de controles.                                                                                                                      |
| Consultas POST                       | Cumple el requisito explícito del proyecto. Los archivos estáticos y la navegación siguen usando los mecanismos normales del navegador.                                                                                                                     |
| Idempotencia persistente y versiones | Una repetición de red recupera el resultado; una edición concurrente recibe conflicto, sin sobrescritura silenciosa. Un bloqueo transaccional serializa comandos de la sucursal: simplifica la consistencia, a cambio de limitar concurrencia de escritura. |
| Cola offline limitada                | Solo altas de ítems en borrador admitidas. Cobros, caja, autorizaciones y emisión requieren confirmación del servidor.                                                                                                                                      |
| Adaptadores demo                     | Permiten ensayar fallos sin bancos, impresoras físicas ni credenciales fiscales. Cada estado simulado se identifica.                                                                                                                                        |

La normalización separa usuarios/roles, categorías/productos/agregados, mesas/cuentas/ítems, pagos/reintegros, caja/movimientos y trabajos/documentos/archivos. La integridad se completa con reglas transaccionales que involucran varias filas; una validación de formulario sola no puede protegerlas.

## Operación y límites

El cliente de una transacción debe liberarse en `finally`; el pool se cierra al detener el servidor. Un fallo revierte toda la transacción. Las correcciones financieras se agregan como eventos compensatorios. Las contraseñas nuevas usan scrypt con sal aleatoria y parámetros N=131072, r=8, p=1; el formato conserva parámetros para su verificación. La base guarda verificadores hash de sesiones, no sus tokens reutilizables. La cookie HttpOnly/SameSite Strict se complementa con CSRF, origen permitido y limitación persistente de intentos, incluida la autorización de una segunda persona.

Los archivos generados se conservan junto a su registro bajo `STORAGE_DIR` (por defecto `./storage`, con exportaciones e imágenes). Respaldar solamente PostgreSQL no respalda los archivos.

Para producción quedan por validar despliegue, HTTPS, política de claves y sesiones, permisos finales, backups con restauración ensayada, observabilidad, volumen de datos, hardware y adaptadores reales. El estado verificable de cada función está en [ESTADO-PRUEBAS.md](ESTADO-PRUEBAS.md).

## Configuración final

La clave `OPERATION_HASH_KEY`, generada por `npm run setup`, firma con HMAC-SHA256 el contenido de operaciones nuevas; no se guardan contraseñas ni cuerpos con credenciales. Debe conservarse estable junto a la base para verificar reintentos tras reiniciar. Hay compatibilidad de lectura con hashes SHA256 de la primera demo. `BRANCH_TIMEZONE` se valida en el servidor y se comunica en `/api/state`; el cliente la usa también en su estado cacheado. E2E usa su propia base `baguette_e2e` y API temporal, evitando modificar la sucursal demostración.

## Decisión posterior: terminal y gestión

Actualización del 21/10/2026: la terminal guarda borradores locales por empleado/mesa y los entrega a una cola persistente antes de enviar `order.submit` en segundo plano. El borrador recuerda la cuenta elegida, si existe. La cola conserva productos, notas y clave de idempotencia, sin PIN ni token; tras recargar requiere identificar al operador correspondiente. Cada envío captura el token y el ámbito de almacenamiento originales, de modo que una respuesta demorada no modifica la cola de otro empleado. El guardado confirmado se combina con el estado visible y luego se refresca; respuestas de lecturas anteriores se descartan. La inserción usa lotes SQL para productos/agregados y la validación de envío consulta disponibilidad de todos los renglones junta. No hay guardados por pulsación en la comandera. Gestión mantiene sus comandos individuales y su cola previa.

La indicación vigente sustituye el login individual del salón por una sesión técnica automática de demo (`baguette_terminal`). Cada entrada a una mesa identifica al empleado por PIN y emite una autorización acotada a terminal, persona y mesa. Cerrar el panel descarta el token local y solicita liberación al servidor; identificar otro operador invalida las autorizaciones previas de esa terminal. El PIN no se conserva en el cliente ni se guarda el DNI completo. Un índice parcial único sobre el localizador HMAC evita dos personas activas con igual sufijo.

`/gestion` mantiene cookie `baguette_session` y contraseña separadas. El backend limita los comandos de terminal incluso con PIN administrador; un encabezado no transforma su cookie en sesión de gestión. El arranque automático comprueba `DEMO_MODE`; la configuración actual escucha en `127.0.0.1`, sin validar adicionalmente la IP del solicitante en ese endpoint. El registro seguro de dispositivos productivos requiere una decisión e implementación futura.

Enviar ahora registra **Pedido**; no hay etapas obligatorias de preparación/entrega ni condición de entrega para cierre. La migración preserva el historial. La interfaz inicial administra su altura, paneles y paginación para evitar scroll del documento. Estos cambios requieren nueva validación API/navegador; los resultados anteriores se conservan con su alcance original.
