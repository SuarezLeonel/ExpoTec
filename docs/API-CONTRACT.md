# Contrato compartido v2 · terminal y gestión

Revisión: 18/10/2026. Esta versión sustituye el acceso individual previo en `/` y el avance obligatorio de preparación. Todos los endpoints de datos son `POST`; JSON, UUID y centavos enteros. Errores `{error:{code,message,details?}}`, HTTP 400/401/403/404/409/422/429; 413 para tamaño y 500 para fallo inesperado.

## Dos contextos de sesión

| Contexto              | Inicio y credencial                                                                                                   | Alcance                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Terminal en `/`       | `POST /api/auth/terminal {}`; cookie HttpOnly `baguette_terminal`, `mode:'terminal'`, permiso técnico `terminal_view` | Mostrar salón y catálogo operativo; identificar empleado al entrar a una mesa |
| Gestión en `/gestion` | `POST /api/auth/login {username,password}`; cookie HttpOnly `baguette_session`, `mode:'management'`                   | Funciones permitidas de caja/administración                                   |

La API distingue la terminal con `X-Session-Mode: terminal`. Las peticiones de gestión usan su contexto de gestión; no se toma el PIN como contraseña ni se permite trasladar una autorización de terminal a catálogo. `auth/session` consulta el contexto; `auth/logout` revoca el contexto aplicable. Cookie HttpOnly/SameSite Strict, origen permitido y `X-CSRF-Token` para mutaciones autenticadas.

Se conserva la API de autenticación individual por compatibilidad; autenticarse no concede los permisos administrativos de otro rol. El recorrido principal del salón nunca solicita ese login.

`POST /api/auth/operational-pin {table_id,pin}` en contexto terminal identifica al empleado; `pin` es cadena de exactamente cuatro dígitos, incluidos ceros iniciales. No recibe identificador de empleado. Responde `{token,expires_in:600,operator:{id,username,name,role},permissions:[...]}`. El token operativo es aleatorio y queda ligado a terminal/sesión, empleado y mesa. El cliente lo mantiene solo en memoria, lo envía como `X-Operation-Token` y lo descarta al salir de la mesa; toda nueva entrada exige PIN. Diez minutos es el máximo de validez del servidor, no permiso para omitir el PIN al reabrir.

Por compatibilidad, el contexto individual de gestión conserva su validación del PIN del propio usuario para comandar y responde `{token,expires_in:600}`; no adopta la identidad de otra persona. El recorrido compartido de `/` usa la respuesta con `operator`.

`POST /api/auth/operator-release {}` con contexto terminal, CSRF y el `X-Operation-Token` saliente libera esa autorización al salir; el cliente borra el token inmediatamente aunque no haya red. Enviar el token anterior evita que una salida demorada revoque una autorización nueva. Una identificación nueva invalida las autorizaciones anteriores de esa terminal. El alcance de revocación ante salida offline queda limitado por la validez del servidor hasta reconectar.

PIN únicos entre empleados activos: se rechaza una configuración ambigua. Se almacena verificador y localizador HMAC, sin DNI completo ni PIN legible. El servidor limita intentos y verifica baja, cambio de PIN y revocación. Nunca guardar PIN o token operativo en auditoría ni cola local.

`auth/recover {username}` devuelve mensaje genérico; `auth/reset {token,password}` consume token con vencimiento. `demo/mailbox {}` es una bandeja local protegida de gestión, no envío externo.

## Estado y consultas

En terminal, `state` y `table_state` del PIN incluyen únicamente cuentas `open`/`requested` y sus consumos, pagos, reintegros y descuentos permitidos. El mapa sin operador incluye solo cuentas activas, sin consumos ni importes sensibles. Las cuentas cerradas y sus movimientos siguen conservados y consultables desde Gestión; cerrar cuentas no aumenta el historial que descarga la comandera.

`/api/state {}` devuelve contexto/usuario permitido, `permissions`, `timezone`, y arrays `tables,accounts,items,products,categories,addons,users,cashSessions,cashMovements,payments,refunds,discounts,printJobs,invoices,files` según permisos. Los campos SQL usan snake_case; `*_cents` son enteros. No se exponen contraseñas, PIN, verificadores ni tokens. El contexto terminal nunca obtiene capacidades de gestión por el rol del PIN.

- Cuentas: `table_id,waiter_id,guests,status(open/requested/closed/merged),version,subtotal_cents,discount_cents,total_cents,paid_cents,balance_cents,created_at`.
- Ítems: `account_id,product_id,name,description,unit_cents,quantity,notes,destination,status,addons,created_at`. Nuevos envíos quedan `sent`, presentados como **Pedido**; `draft` es borrador y `void` anulado. Estados históricos de preparación se conservan, sin ser pasos exigidos por el flujo nuevo.
- Mesas: `label,capacity,sector,x,y,active,group_id`. Productos: categoría, precio, imagen, destino, disponibilidad, activo, `visible_en_carta`, agregados permitidos y fechas. `variant_group` y `variant_name` definen el producto base y su opción; ambos vacíos indican un producto individual. Se agrupan únicamente dentro de la misma categoría. `product.save` acepta ambos campos juntos; omitirlos conserva los existentes. La carta pública también los devuelve, manteniendo precio y disponibilidad por variante. Los ítems y tickets conservan el nombre completo e identificador de la variante elegida.
- `/api/public/menu {}` devuelve solo `categories,products` públicos. `/public/menu/print {}` genera copia persistida y devuelve `{id,name,mime,content_base64}`.
- `/api/accounts/quote {account_id,parts?,selections?}`: `{parts,paid_parts,amount_cents}`. `/api/cash/summary {}`: totales y bloqueos de cierre. Son consultas, no cobros confirmados.

## Comandos e idempotencia

En terminal, la respuesta de `auth/operational-pin` incluye además `table_state: {accounts,items,payments,refunds,discounts,cashSessions}`, limitado a la mesa identificada y a los permisos del empleado. El cliente combina esa instantánea con la carta ya cargada, sin una segunda petición de estado para entrar.

`order.submit` recibe `{table_id,account_id?,version?,guests?,items:[{client_id?,product_id,quantity,notes?,addon_ids?}],item_ids?:[]}`. Cuenta y versión se indican juntas; sin ellas se crea la cuenta de la mesa libre con el empleado identificado. Admite hasta 100 renglones en total, incluidos borradores del servidor referenciados por `item_ids`. `client_id` es un UUID único para reconocer cada renglón local, también cuando una consulta de estado llega antes que la respuesta del envío. Devuelve `result: {account,items,sent_item_ids}`. Precios y agregados se obtienen del catálogo vigente; el lote abre cuenta, inserta ítems/agregados y envía tickets dentro de una única transacción y clave idempotente. Un rechazo revierte el lote completo. Conserva versiones, permisos, PIN y mesa, igual que los comandos individuales.

`POST /api/commands/:action` lleva `Idempotency-Key` UUID y CSRF; en terminal requiere además el token operativo de la mesa para las acciones admitidas. Cada cuenta afectada incluye su versión. Respuesta `{result,operation_id,replayed?}`. `/api/operations/lookup {key}` consulta el resultado del mismo ejecutante/contexto con autorización vigente; en terminal requiere token operativo. Misma clave/contenido devuelve el resultado existente; otro contenido produce conflicto. HMAC versionado con `OPERATION_HASH_KEY` estable protege la comparación sin guardar credenciales.

La operación conserva su mesa original para lookup/replay aunque una cuenta se haya trasladado después. Si la clave pertenece a otro empleado, se rechaza el cruce de identidad. `PIN_REQUIRED` puede incluir `details.table_id` para solicitar la identificación de la mesa correspondiente, sin generar otra operación.

| Acción                                       | Cuerpo específico                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `table.save`                                 | `{id?,label,capacity,sector,x,y,active}`                                                                           |
| `table.group`                                | `{table_ids,group_id?}`; omitir crea unión, null separa, UUID referencia unión existente                           |
| `account.open`                               | `{table_id,guests,waiter_id?}`; en terminal la identidad autorizada determina el ejecutante y responsable inicial  |
| `account.update`, `account.move`             | `{account_id,version,waiter_id?,guests?}` / `{account_id,version,table_id}`                                        |
| `account.request`, `account.close`           | `{account_id,version}`; cierre exige saldo cero, sin preparación/entrega obligatoria                               |
| `account.split`                              | `{account_id,version,selections:[{item_id,quantity}]}`; cuenta hermana                                             |
| `item.transfer`                              | `{account_id,version,target_account_id,target_version,selections}`                                                 |
| `account.merge`                              | `{account_id,version,source_account_id,source_version}`                                                            |
| `item.add`                                   | `{account_id,version,product_id,quantity,notes,addon_ids}`                                                         |
| `item.edit`, `item.void`                     | Base de cuenta + `{item_id,quantity,notes}` / `{item_id,reason,authorization?}`; respetar permisos sensibles       |
| `order.send`                                 | `{account_id,version,item_ids}`; marca Pedido y genera el trabajo correspondiente                                  |
| `item.status`                                | Base de cuenta + `{item_id,status}`; avanza ciclo de preparación y entrega (`preparing`, `ready`, `delivered`)     |
| `discount.apply`                             | Base de cuenta + `{item_id?,kind:amount                                                                            | percent,value,reason,authorization?}`; importe en centavos o porcentaje entero |
| `payment.add`                                | Base de cuenta + `{amount_cents,method:cash                                                                        | debit                                                                          | credit                                                             | transfer,received_cents?,split?:{kind:equal | amount | items,parts?,part?,selections?}}` |
| `refund.add`                                 | Base de cuenta + `{payment_id,item_id?,quantity?,amount_cents,reason,return_product,authorization?}`               |
| `cash.open`, `cash.move`, `cash.close`       | `{opening_cents}` / `{amount_cents,kind:in                                                                         | out,concept}`/`{counted_cents}`                                                |
| `category.save`, `addon.save`                | `{id?,name,active}` / `{id?,name,price_cents,active}`                                                              |
| `product.save`                               | `{id?,name,description,category_id,price_cents,image_url,destination,available,active,visible_en_carta,addon_ids}` |
| `user.save`                                  | `{id?,username,name,role,active,password?,pin?}`; `pin` es cadena de cuatro dígitos; solo gestión autorizada       |
| `print.process`, `print.retry`, `print.copy` | `{id,mode:success                                                                                                  | offline                                                                        | uncertain}`/`{id}`/`{id,reason}`                                   |
| `invoice.prepare`, `invoice.process`         | Base de cuenta + `{recipient_name,recipient_document,kind}` / `{id,mode:success                                    | reject                                                                         | uncertain}`                                                        |
| `invoice.retry`, `invoice.resolve`           | `{id}`; consultar incertidumbre antes de reenviar                                                                  |
| `report.export`                              | `{kind:audit                                                                                                       | cash                                                                           | account,account_id?}`; devuelve metadatos de copia HTML persistida |

## Archivos, auditoría y demo

`/api/files/download {id}` devuelve `{id,name,mime,content_base64}` con permisos, salvo carta pública. Generación, solicitud y finalización HTTP tienen registros separados; no prueban guardado del navegador. `/api/products/image {name,content_base64}` exige gestión de catálogo y valida tamaño/contenido antes de convertir a WebP.

`/api/audit/query {user_id?,from?,to?,entity?,operation?}` devuelve `{events}` solo a gestión autorizada. `/api/demo/reset {confirmation:'RESTAURAR DEMO'}` requiere administrador en gestión, DEMO_MODE y base permitida exacta; no se habilita por un PIN administrador en terminal.

El arranque automático `auth/terminal` exige `DEMO_MODE=true`. El proceso actual escucha en `127.0.0.1` mediante `HOST`; no hay una comprobación adicional de IP del solicitante en ese endpoint. El enrolamiento de dispositivos de producción está pendiente. [ESTADO-PRUEBAS.md](ESTADO-PRUEBAS.md) registra las comprobaciones de esta revisión, separadas de la evidencia anterior.
