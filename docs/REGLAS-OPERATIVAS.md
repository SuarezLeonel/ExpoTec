# Reglas operativas vigentes

## Identidad y contexto

La terminal compartida entra automáticamente al salón y tiene permisos técnicos mínimos. Cada entrada de mesa exige PIN que identifica a una persona activa, sin selector ni login individual. El sufijo de cuatro dígitos conserva ceros iniciales, no guarda el DNI completo y debe ser único entre personas activas.

La autorización queda ligada a terminal/sesión, actor y mesa; solo vive en memoria del cliente. Salir o cambiar de mesa la descarta; volver exige PIN. El vencimiento máximo del servidor no habilita reutilización entre entradas. Gestión usa otra cookie y contraseña en `/gestion`; un PIN administrador no habilita catálogo desde terminal.

## Mesas, cuentas y pedidos

Cuenta `open → requested → closed`; pedirla no acredita pago. Mover representación cambia coordenadas; trasladar cuenta cambia mesa; unir mesas agrupa físicamente; dividir/agrupar cuentas distribuye consumos. Se comprueban capacidad, permisos y versiones. El actor identificado puede diferir del camarero responsable histórico.

El flujo nuevo de ítems es `draft → sent` (**Pedido**), con `void` como anulación autorizada. No exige preparando/listo/entregado, tampoco para cobrar o cerrar. Estados anteriores se conservan por historial. La disponibilidad y agregados se revalidan en servidor al enviar. Correcciones y movimientos de consumos enviados generan avisos identificables sin pedir una nueva preparación de todo.

El camarero no descuenta, anula ni reduce/corrige consumos sensibles, aun presentando credenciales ajenas. Caja/encargado actúan con permiso y registran motivo. Cambios de consumo, división y transferencias con pagos/descuentos se bloquean cuando impidan conservar coherencia; no se reescriben pagos para acomodarlos.

## Dinero, descuentos y devoluciones

Centavos enteros y totales agregados `bigint`, con verificación del rango exacto de JavaScript. Los ítems conservan nombre, descripción, precio y agregados históricos. Descuento positivo por importe o porcentaje entero 1–100, con alcance de ítem/cuenta, base, motivo y responsable. No puede exceder base/saldo. El reparto de descuento general y las cantidades usan diferencias acumuladas en orden estable para asignar cada centavo una vez.

Dividir $100,00 en tres partes da $33,34, $33,33 y $33,33. La cotización no confirma cobro. El backend valida saldo actual y cantidades ya pagadas. Efectivo distingue recibido, aplicado y vuelto; débito/crédito/transferencia son registros internos de demo.

Anular antes de cobro, devolver producto y reintegrar pago son hechos diferentes. Un reintegro referencia el pago original; devolución referencia ítem/cantidad y su neto después de descuentos. No supera lo cobrado, el pago disponible ni las cantidades/valores ya devueltos. Pedido es suficiente para el flujo nuevo: no se exige pasar por Entregado. La venta y sus compensaciones permanecen.

## Caja y auditoría

Esperado efectivo = fondo + ingresos − egresos + cobros efectivos − reintegros efectivos. Los demás medios se muestran separados. Arqueo registra contado/diferencia sin cambiar movimientos. El cierre de cuenta requiere saldo cero y reglas financieras válidas; el de caja revisa cuentas abiertas y servicios incompatibles pendientes. Un rechazo fiscal no borra un pago confirmado.

La auditoría conserva ejecutante, autorizante cuando corresponda, entidad, operación, motivo, fecha y cambios. No se edita desde la aplicación ni contiene PIN, contraseñas o tokens. Configurar usuarios preserva historial y rechaza PIN activos duplicados.

## Idempotencia y offline

En terminal, el borrador de una mesa identificada se arma localmente, separado por empleado. «Enviar pedido» lo conserva como `order.submit` pendiente antes de iniciar la red; no confirma el pedido hasta recibir su resultado. Sin red queda pendiente de sincronización. El lote se acepta completo o se rechaza completo, con precios y disponibilidad comprobados por el servidor. Una respuesta perdida se consulta con la clave original antes de reenviar. Mientras exista un envío pendiente de la mesa se permite preparar el siguiente borrador; las nuevas escrituras sobre su cuenta esperan la resolución del anterior.

Mutaciones con clave UUID y versiones; mismo actor/clave/contenido recupera resultado autorizado, otro contenido produce conflicto. HMAC-SHA256 versionado con `OPERATION_HASH_KEY` estable, sin credenciales crudas. No generar nueva clave para una respuesta incierta sin consultar primero la operación original.

La cola conserva borradores admitidos y claves de comandos online inciertos, separados por operador; depura PIN, tokens y contraseñas. Sin servidor no se identifica un nuevo empleado mediante PIN ni se abre una nueva mesa. Tras recarga offline se conserva el pendiente, pero sincronizar exige volver a identificar online al actor correspondiente y tener permiso vigente. No se confirman cobros offline.

La recarga sin red requiere la versión compilada ya cargada online y su service worker; Vite de desarrollo no acredita ese funcionamiento. Conflictos de versión requieren revisión visible; no sobrescribir silenciosamente. La evidencia del cambio está en [ESTADO-PRUEBAS.md](ESTADO-PRUEBAS.md).
