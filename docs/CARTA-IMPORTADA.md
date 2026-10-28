# Carta general de Baguette

Fuente: https://baguette.com.ar/carta-general/

Documento enlazado: https://drive.google.com/file/d/1fubJWiPKsgbA3jZyErbEoYy4JN2nk6nf/preview

Consultado el 20 de octubre de 2026. Se revisaron visualmente las ocho páginas.
`backend/catalog/baguette-menu.json` guarda nombres, precios en pesos y resúmenes
de ingredientes. Los productos con precios distintos por tamaño tienen registros
separados. Se normalizaron abreviaturas y errores tipográficos para facilitar el pedido.
Los agregados sin precio se indican para consultar, sin asignarles importes inventados.

La carga se ejecuta una sola vez con `npm run menu:import`, sobre la base elegida
en `.env`, en modo demo. Para el entorno publicado se usa su archivo privado de
configuración con el mismo script. Toda la carga se realiza en una transacción:
verifica cantidad e importe total y deja auditoría. Retira únicamente los seis
productos ficticios iniciales; sus ventas e historial se conservan.

La importación queda registrada por fecha de fuente y una repetición no pisa
ediciones realizadas desde Catálogo. No se ejecuta automáticamente con cada
despliegue y no sincroniza cambios futuros del sitio externo.
