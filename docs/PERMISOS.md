# Acceso, identidad y permisos vigentes

La instrucción posterior del usuario sustituye el login individual en salón: hay **terminal compartida** en `/` y **gestión independiente** en `/gestion`. La autorización siempre se verifica en backend.

| Acción                                       | Terminal sin PIN     | Terminal con PIN habilitado                                              | Gestión de caja           | Gestión de administrador                  |
| -------------------------------------------- | -------------------- | ------------------------------------------------------------------------ | ------------------------- | ----------------------------------------- |
| Ver salón y carta operativa                  | Sí, datos permitidos | Sí                                                                       | Sí                        | Sí                                        |
| Entrar en mesa                               | Solicita PIN         | Identifica al empleado para esta entrada                                 | Según acceso operativo    | Según acceso operativo                    |
| Agregar/enviar pedido                        | No                   | Según permiso del empleado y token de mesa                               | Según permiso             | Sí                                        |
| Descuento, anulación, reducción sensible     | No                   | Camarero: no; otros roles según comando autorizado                       | Sí                        | Sí                                        |
| Cobro, reintegro, caja y cierre              | No                   | Sin elevar la terminal a gestión; respetar permiso y alcance del comando | Sí                        | Sí                                        |
| Catálogo, imágenes, usuarios y configuración | No                   | **No, tampoco con PIN administrador**                                    | No con permisos iniciales | Sí                                        |
| Auditoría, correo local y restauración       | No                   | No                                                                       | No con permisos iniciales | Sí; restauración solo demo y confirmación |

La matriz de comandos concreta está en `role_permissions` y en los límites adicionales del contexto. Asignar un rol poderoso al PIN no elimina las restricciones de terminal. El camarero no puede obtener descuentos/anulaciones presentando credenciales ajenas: caja/encargado deben operar con su autorización correspondiente.

## PIN: identificación en cada entrada

Se configura solo el sufijo de cuatro dígitos del DNI, nunca el documento completo. Se valida como cadena para conservar ceros iniciales. Cada sufijo activo debe identificar a una sola persona; alta, reactivación o cambio con duplicado se rechaza. No se resuelve un duplicado eligiendo al primer usuario ni mediante un selector de empleado.

Al migrar, los sufijos ficticios conocidos pueden verificarse y completar su localizador. Los PIN personalizados anteriores solo tienen verificador y no se pueden deducir: administración debe volver a configurarlos. Si dos empleados reales comparten sufijo, la política alternativa debe decidirse con el encargado; el prototipo bloquea la ambigüedad.

El servidor conserva un verificador scrypt y localizador HMAC; el PIN no queda legible. La respuesta de validación contiene operador y token aleatorio ligado a terminal/sesión/mesa. La UI solo lo guarda en memoria, lo descarta al salir, solicita `operator-release` y vuelve a pedir PIN en toda reentrada. Una identificación nueva invalida las autorizaciones anteriores de esa terminal. El máximo servidor es diez minutos; si la salida ocurre sin red, la revocación remota no se puede confirmar hasta reconectar. Un cambio de PIN, baja o revocación invalida autorizaciones según las reglas del servidor.

Los intentos fallidos tienen límite persistente. No guardar PIN, contraseña, comprobante ni token operativo en auditoría, logs o cola offline. Los registros históricos conservan quién ejecutó y quién era responsable de la cuenta; ambas identidades pueden ser diferentes.

## Gestión y recuperación

Usuarios individuales con contraseña hasheada, cookie de gestión revocable y logout. La recuperación devuelve mensaje genérico y usa token temporal de un solo uso; la bandeja local está protegida y no acredita envío externo. Desactivar conserva historial. `401` señala falta de sesión/autorización y `403` falta de permiso/contexto aunque se fabrique la petición directamente.

La validación de este cambio y la comprobación de que las dos cookies no se mezclan figuran en [ESTADO-PRUEBAS.md](ESTADO-PRUEBAS.md).
