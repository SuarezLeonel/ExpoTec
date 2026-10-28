# Comandera local y envío en segundo plano

21/10/2026. La terminal arma productos, cantidades y notas en el dispositivo. La cuenta se abre y el pedido se registra cuando se envía el lote. El cliente guarda primero la solicitud y después inicia la red; conserva la clave de idempotencia y la identidad del responsable, sin almacenar PIN ni token.

## Medición

Comparación con el frontend original de `89b94d5`, compilado en producción con las mismas dependencias que la versión modificada. Cinco sesiones nuevas de Chromium/Brave por versión, misma máquina y respuestas API simuladas con 1.000 ms de demora por solicitud de estado o comando. La cuenta ya estaba abierta. Se midió desde el clic hasta el siguiente frame con el producto visible, y desde enviar hasta poder volver a usar el botón de agregar. No se midió la latencia de una base remota ni Core Web Vitals de usuarios reales.

| Interacción                                  | Antes, mediana | Después, mediana |
| -------------------------------------------- | -------------: | ---------------: |
| Agregar un producto y verlo                  |       2.044 ms |             9 ms |
| Volver a usar la carta después de enviar     |       2.053 ms |            23 ms |
| Comandos antes de tocar Enviar, por producto |              1 |                0 |

Las cinco cargas anteriores estuvieron entre 2.032 y 2.057 ms; las locales, entre 8 y 15 ms. La diferencia supera la dispersión entre muestras. El flujo anterior esperaba `item.add` y luego `state`; el nuevo no hace peticiones al agregar, ajustar cantidades ni guardar notas. En una mesa libre también elimina la espera de `account.open` durante la carga. [Muestras completas](evidence/ordering-performance-2026-10-21.json).

La verificación del PIN sigue en el servidor. Su respuesta trae la instantánea de la mesa, evitando la petición posterior de estado y la recarga del catálogo al entrar. La prueba de navegador controla que completar el PIN no dispare esa petición adicional.

## Persistencia y recuperación

`order.submit` procesa el lote en una transacción: abre cuenta si corresponde, valida versión, permisos, productos y agregados, calcula importes con precios vigentes, inserta los renglones y genera el envío y su auditoría. Una falla revierte todo. Las inserciones y la validación de disponibilidad usan consultas por lote; no agregan consultas por cada renglón.

El estado «Enviando» es distinto de «Confirmado». Al enviar se cierra la mesa de inmediato y se vuelve al salón mientras llega la respuesta. El token local se descarta al salir; su liberación al servidor espera a que termine la solicitud para no invalidarla por el cierre. El próximo envío de esa mesa y las modificaciones de cuenta esperan la resolución del anterior. Si cambia el empleado, la respuesta anterior actualiza únicamente su cola original. Después de recargar, consultar/reintentar exige el PIN de su responsable; una respuesta perdida se consulta por clave antes de repetirla. Ante conflicto, «Actualizar» revisa la versión vigente explícitamente. No hay reintentos automáticos sin límite ni confirmaciones de cocina o pagos simuladas en el cliente.

Los borradores conservan mesa, cuenta elegida, productos, cantidades, notas, agregados y comensales. Solo viven en ese dispositivo y son visibles tras identificar al empleado correspondiente. El servidor sigue siendo la autoridad sobre precios, disponibilidad, cuentas y permisos.

La X cierra conservando el borrador. «Salir sin cambios» descarta los productos, comensales y personalizaciones locales de esa mesa; no cancela un pedido ya enviado ni borra su pendiente. En Gestión, enviar desde una mesa también guarda la solicitud y cierra antes de esperar la confirmación. Los productos que Gestión agregó mediante sus comandos previos ya están registrados en el servidor.

## Movimiento

Entradas de panel de 150 ms, aparición de renglones y formularios de 120 ms y respuesta al pulsar de 80 ms, usando opacidad y transformaciones sin esperas artificiales. El indicador de envío permanece activo mientras se espera una respuesta. Las animaciones se habilitan solo cuando el sistema no solicita movimiento reducido.

## Uso prolongado

Se comprobaron dos riesgos antes de corregirlos: un intervalo fijo podía iniciar otra lectura mientras la anterior seguía esperando, y el PIN descargaba todo el historial de la mesa. Con 200 cuentas cerradas y 1.000 consumos históricos de prueba, la instantánea del PIN pesaba 495.392 bytes; la misma consulta, limitada a la cuenta activa y su consumo, pesa 992 bytes. La prueba verifica además que Gestión conserva las 201 cuentas y los 1.001 consumos.

La actualización ahora espera la respuesta y luego cuenta siete segundos para la siguiente. Las llamadas simultáneas del mismo contexto comparten la lectura en curso. Cambiar de mesa u operador cancela la lectura anterior; esto solo cancela consultas de estado, nunca el comando que envía un pedido. Las pestañas ocultas pausan las actualizaciones periódicas y volver a verlas solicita una lectura actual. Al desmontar la aplicación se limpian el temporizador, el listener de visibilidad y la consulta pendiente.

Al enviar se elimina el borrador local vacío. Los borradores con productos y las solicitudes pendientes se conservan. No se programa ningún F5, cierre de sesión ni borrado automático de pedidos para disimular un problema de rendimiento.

Las sesiones del servidor vencen a las ocho horas. Una respuesta 401 en la actualización periódica deja de mantener una pantalla con credenciales vencidas: la terminal recupera su sesión técnica mediante el mismo arranque autorizado que usa al abrir la aplicación, descarta el permiso operativo anterior y exige volver a identificar al empleado por PIN. Conserva los borradores y no reenvía comandos automáticamente. En Gestión se presenta el login, manteniendo la cola pendiente del usuario. La recuperación espera a que no haya una operación en curso y no extiende el vencimiento del servidor ni guarda contraseñas/PIN. Las pruebas simulan el 401 y comprueban que no se navega ni se recarga el documento.

`tests/polling.test.ts` verifica espera de respuestas, pausas, reanudación, errores y limpieza. `tests/e2e/long-session.spec.ts` mide 70 ciclos de PIN, carga, nota, envío y cierre sin recargar. Después de diez ciclos de calentamiento compara memoria retenida tras GC, nodos, documentos, listeners y tiempo de respuesta al comienzo y al final. El presupuesto es hasta 50 nodos adicionales, ocho listeners y el mayor entre 2 MiB/25 % de memoria adicional; la mediana final de carga debe mantenerse por debajo de 200 ms y a menos de 50 ms de la inicial. Esto es una regresión acelerada con API simulada; no acredita todavía una jornada real de ocho horas ni hardware distinto.
