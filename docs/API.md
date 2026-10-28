# API: contextos y uso

Contrato detallado en [API-CONTRACT.md](API-CONTRACT.md). Todos los endpoints de datos usan POST. UUID, fechas ISO y centavos enteros; `state.timezone` comunica la zona de sucursal validada.

## Terminal compartida

1. `/` solicita `auth/terminal`, obtiene cookie técnica y muestra salón. No selecciona empleado ni solicita contraseña.
2. Cada entrada a una mesa llama `auth/operational-pin {table_id,pin}`. El PIN identifica al empleado activo; no se envía `user_id` para elegirlo.
3. La respuesta incluye operador y token efímero de esa mesa. Comandos y lookup llevan `X-Session-Mode: terminal`, CSRF y `X-Operation-Token`.
4. Salir o cambiar de mesa descarta la autorización del cliente y solicita `auth/operator-release` con CSRF. Recargar también pierde el token local. Reabrir exige PIN; una identificación nueva invalida autorizaciones anteriores de esa terminal. El plazo máximo del servidor no habilita reutilización entre entradas.
5. Enviar marca Pedido. La API no exige avanzar preparación/entrega para cobrar o cerrar; conserva saldo, permisos y trazabilidad.

## Gestión independiente

`/gestion` usa `auth/login` con usuario/contraseña y su cookie de gestión. Caja/administración solo reciben sus permisos. Tener una sesión de gestión en el mismo navegador no debe elevar los comandos de terminal. Un PIN administrador tampoco habilita catálogo desde `/`.

Sesiones revocables, cookies HttpOnly/SameSite Strict, CSRF, orígenes y límites de intentos se verifican en servidor. Recuperación usa token de un solo uso con vencimiento y bandeja local demo. No se guardan PIN, contraseñas ni tokens operativos en auditoría o cola del navegador.

## Consultas, comandos y errores

`state` filtra datos por contexto; `public/menu` solo expone carta. `commands/:action` muta con `Idempotency-Key` y versión de cuentas. `operations/lookup` consulta la operación del mismo actor antes de repetir una respuesta incierta. HMAC-SHA256 versionado usa `OPERATION_HASH_KEY` estable; los resultados previos siguen sujetos a permiso vigente.

| HTTP    | Acción del operador                                                                    |
| ------- | -------------------------------------------------------------------------------------- |
| 400/422 | Corregir formato, relación, PIN configurado ambiguo o regla indicada                   |
| 401     | Recuperar el contexto de sesión o volver a identificar al operador                     |
| 403     | Acción no permitida en este contexto, origen/CSRF inválido o autorización insuficiente |
| 404     | Entidad inexistente o no accesible; actualizar                                         |
| 409     | Estado, versión o idempotencia en conflicto; consultar y revisar                       |
| 413     | Reducir tamaño de solicitud/imagen                                                     |
| 429     | Respetar el bloqueo temporal por intentos                                              |
| 500     | Consultar el resultado antes de repetir; no afirmar confirmación local                 |

Los errores tienen `{error:{code,message,details?}}`. La recuperación no revela cuentas existentes. `item.status` gestiona la transición de preparación y entrega entre cocina y salón (`preparing`, `ready`, `delivered`).

Las solicitudes JSON comunes admiten hasta 128 KB. `/api/products/image` autoriza sesión, CSRF y permiso de catálogo antes de leer su cuerpo de hasta 6 MB; conserva las validaciones de imagen de 3 MB y reprocesamiento. `/api/public` admite 120 solicitudes por minuto e imágenes 12 por minuto, por dirección de origen. Estos límites responden 429 con `Retry-After` en segundos y se mantienen en memoria de cada proceso. El límite persistente de autenticación/PIN conserva su ventana de quince minutos; un PIN correcto no borra fallos previos.

El cliente espera como máximo veinte segundos y trata el vencimiento o una confirmación incompleta como resultado incierto. Para resolver un comando exige `result` y `operation_id`; en lookup exige `found` explícito y, si es verdadero, ambos campos de confirmación.

## Archivos

`report.export` y la emisión ficticia devuelven metadatos de archivos conservados; `files/download` entrega el contenido base64 con permisos. La carta imprimible genera y entrega su copia pública. Se registra la finalización HTTP sin afirmar impresión ni guardado en el equipo.
