# Revisión acotada de seguridad y recuperación · 22/10/2026

Se revisaron los controles existentes de origen, CSRF, cookies, sesión, permisos, PIN, revocación, idempotencia, errores HTTP y recuperación de pedidos, usando la guía ECC `security-review`. No se publicaron cambios ni se modificaron datos operativos.

## Mejoras aplicadas

- **Confirmaciones exactas:** antes se aceptaba una respuesta que incluyera los IDs esperados junto con renglones adicionales o duplicados. Ahora la respuesta debe contener exactamente los renglones del pedido, una sola vez, de la cuenta y mesa correctas, con una versión positiva y segura. El orden de los renglones puede variar. Una respuesta inválida conserva el pedido pendiente de revisión.
- **Errores de codificación:** una solicitud con un charset o Content-Encoding no admitido se clasificaba como error interno 500. Ahora devuelve 415 con un mensaje JSON genérico, sin reflejar datos del cuerpo. Se verificaron también JSON inválido, cuerpos demasiado grandes y Cache-Control no-store. Esto evita presentar un rechazo de la solicitud como un resultado incierto del servidor.
- **Protección de las bases de prueba:** ambas suites que restauran esquemas ahora exigen un destino local, además del nombre exacto `baguette_test`. Se comprobó que rechazan un host remoto ficticio antes de importar la conexión. No se imprimieron credenciales.

## Validación

La primera ejecución de integración no pudo conectarse porque PostgreSQL local estaba detenido. Se inició la instancia persistente existente sin reinicializarla y se repitieron las comprobaciones:

- **92/92 pruebas de lógica e integración aprobadas**, sin omitidas: permisos, CSRF, revocación, intentos de PIN, recuperación, concurrencia, importes, pagos y los nuevos casos de confirmación/codificación.
- **11/11 recorridos de navegador aprobados**, sin reintentos: carga local, notas, cierre al enviar, almacenamiento lleno, respuesta perdida, pendientes por mesa y café con borrador anterior de Medialuna.
- Tipos, lint y compilación de producción aprobados; formato de los archivos cambiados comprobado.

Se usaron exclusivamente `baguette_test` y `baguette_e2e` para las pruebas destructivas. No se ejecutó la suite completa de navegador, una auditoría externa de dependencias ni una prueba de penetración. [Evidencia resumida](evidence/security-review-2026-10-22.json).

## Trabajo de mayor alcance

La carrera entre un envío en curso y el cambio de PIN quedó mitigada en la web: antes de validar el PIN siguiente espera los envíos ya iniciados en esa terminal. El modal aparece de inmediato e informa la espera. Se mantiene la revocación del servidor; otros clientes deben respetar esa secuencia. Separar la admisión de envíos de la sustitución de identidad en el servidor sigue siendo trabajo de mayor alcance. [Contexto, comprobación y límites](EDITOR-Y-ENVIOS-2026-10-22.md).
