# Integraciones y conservación

Fecha de referencia: 18/10/2026. Ninguna integración externa de este prototipo debe presentarse como servicio real.

| Área        | Demostración                                                                                    | Pendiente externo                                                    |
| ----------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Pagos       | Registro interno por efectivo, débito, crédito y transferencia; saldo y reintegros persistentes | Terminal, adquirente/banco, conciliación y confirmaciones externas   |
| Cocina/bar  | Cola persistente, tickets por destino, fallos, incertidumbre y copias auditadas                 | Driver/protocolo, dispositivo, confirmación física y prueba en local |
| Facturación | Preparar, solicitar, aceptar/rechazar o dejar respuesta incierta; reintento y consulta seguros  | Alta fiscal, autenticación, homologación y emisión real              |
| Correo      | Bandeja local protegida para recuperación                                                       | Proveedor, dominio, entrega y política de retención                  |

## Impresión

Generado, enviado y confirmado son estados distintos. El modo desconectado deja un error recuperable. Si pudo imprimirse y se perdió la respuesta, mostrar estado incierto; el operador debe conciliar antes de crear una copia. Cada reimpresión requiere motivo y marca de copia. El diálogo de impresión del navegador no acredita papel emitido ni impresión física exactamente una vez.

## Facturación argentina

Los documentos incluyen **“Demostración. Sin validez fiscal”** y datos ficticios. Pago y facturación mantienen estados independientes. Resolver un rechazo o consultar una respuesta incierta no borra el pago ni debe duplicar un comprobante.

La futura integración debe contrastarse con la documentación oficial vigente y con el responsable contable. Fuentes consultadas el 18/10/2026: [servicios de facturación](https://www.arca.gob.ar/fe/ayuda/webservice.asp), [homologación externa](https://www.arca.gob.ar/fe/ayuda/homologacion_externa.asp), [autenticación WSAA](https://www.arca.gob.ar/ws/documentacion/wsaa.asp) y [certificados](https://www.arca.gob.ar/ws/documentacion/certificados.asp). Definir servicio y régimen aplicables, emisor, punto de venta, tipos de comprobante, receptor, conceptos/impuestos, certificados y autorización de servicio, ambientes separados, numeración, consulta posterior a fallos, notas de crédito, QR y conservación. Esta lista identifica trabajo pendiente; no determina obligaciones fiscales ni afirma homologación, CAE válido o conexión a ARCA.

## Archivos

Cada descarga generada conserva archivo y registro en el servidor: nombre, tipo, actor, fecha, entidad y ubicación. El acceso se valida por permiso; únicamente la carta pública admite acceso público. Generar, solicitar y terminar la respuesta HTTP son eventos diferentes. `file_deliveries.delivered_at` se actualiza al evento HTTP `finish`; no confirma impresión ni que el usuario guardó el archivo en su equipo.

Respaldar la base junto con el directorio de almacenamiento configurado. No incluir contraseñas, tokens, datos de tarjetas ni datos fiscales reales. Las imágenes de productos ficticios no se presentan como fotografías oficiales; la identidad observada se documenta en [IDENTIDAD.md](IDENTIDAD.md).
