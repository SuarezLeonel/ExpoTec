# Demo operativa Baguette — especificación vigente

Fecha: 18/10/2026. Fuente inicial conservada en [REQUISITOS-ORIGINALES.txt](REQUISITOS-ORIGINALES.txt). Se trabaja en el proyecto existente GestionCafe, cuyo repositorio inicialmente solo contenía `.git`, sin HEAD ni instrucciones aplicables. Se conservan los cambios útiles posteriores. No se publica ni se hace push.

## Instrucción posterior que prevalece

El usuario reemplazó el acceso individual del salón y las etapas de preparación por una terminal compartida:

- `/` abre directamente el salón con sesión técnica automática; no muestra selección de empleado ni login individual.
- Cada entrada a una mesa, libre u ocupada, exige cuatro dígitos. El servidor identifica al empleado habilitado mediante el sufijo de DNI configurado, sin almacenar el documento completo. Los PIN activos duplicados se rechazan: no se adivina entre identidades.
- El comprobante operativo queda ligado a terminal, empleado y mesa. Se guarda solo en memoria y se descarta al cerrar o cambiar de mesa; volver a entrar exige PIN, aunque sea la misma mesa. El vencimiento máximo del servidor no sustituye esta reentrada.
- `/gestion` mantiene acceso con usuario/contraseña separado para caja/encargado. Un PIN de administrador en la terminal no habilita gestión de catálogo, usuarios o configuración.
- Enviar marca el consumo como **Pedido**. La operación nueva no requiere cocina, preparando, listo o entregado, ni exige esas etapas para cobrar/cerrar. Los datos históricos conservan trazabilidad.
- La página inicial no desplaza el documento en escritorio, tablet ni celular; cada panel administra su contenido y las mesas se paginan si no caben. Los controles de página deben quedar accesibles.

Estas indicaciones sustituyen el flujo anterior de camarero autenticado con contraseña, reutilización del PIN al reabrir y avance obligatorio de preparación. El resto del alcance original sigue vigente salvo conflicto explícito.

## Arquitectura y módulos

Una sucursal, PostgreSQL independiente, monolito Node.js 24 LTS/TypeScript ESM/Express y frontend React/TypeScript/Vite/Bootstrap. Módulos: terminal, gestión, catálogo/carta pública, salón/cuentas/pedidos, cobros/descuentos/reintegros/caja, impresión, facturación de prueba, archivos y auditoría. API de datos exclusivamente POST; centavos enteros, snapshots de venta, transacciones, versiones e idempotencia persistente.

## Supuestos reversibles

- Moneda ARS, zona `BRANCH_TIMEZONE` validada; catálogo, precios, personas y sufijos ficticios.
- El PIN identifica al ejecutante de la entrada actual, no necesariamente al responsable histórico de la cuenta. No permite elevar la sesión técnica a gestión.
- El camarero no descuenta, anula, reduce consumos enviados, cobra ni cierra cuentas; caja/encargado ejecutan lo autorizado desde su acceso correspondiente.
- Sin conexión se conservan borradores/pendientes admitidos. No se puede identificar un empleado nuevo mediante PIN offline ni abrir una mesa nueva. Sincronizar exige servidor y autorización vigente.
- La edición/división de consumos con pagos o descuentos se limita para conservar coherencia; ajustes financieros compensatorios e historial inmutable.
- PostgreSQL local real con `embedded-postgres` o servidor externo. Impresión, bancos, correo y facturación son simulados. No hay CAE, ARCA ni papel físico confirmados.

## Identidad visual observada

Sitio [baguette.com.ar](https://baguette.com.ar/) inspeccionado en escritorio y 390×844 el 18/10/2026. Logo SVG original, azul `#2B5369`/`#183849`, dorado `#D2B677`, crema `#FDF7ED`, blanco; Inter y APOLLO verificadas. Fuentes y recursos en [IDENTIDAD.md](IDENTIDAD.md). Oscuro es adaptación de la aplicación, sin atribuirlo a la marca. No se asignan fotos oficiales a productos ficticios.

## Aceptación y validación

1. Salón directo; PIN en cada entrada identifica al empleado sin selector y no se reutiliza al cerrar/reabrir.
2. Sesiones técnica y de gestión independientes; terminal rechaza catálogo incluso con PIN administrador.
3. PIN único activo, ceros iniciales, revocación, límites de intentos y ausencia de secretos en logs/cola/auditoría.
4. Alta, envío a Pedido, división válida, cobro parcial/combinado y cierre sin etapas de preparación; sin pérdidas históricas.
5. Documento inicial sin scroll en tamaños comprobados y paginación útil con muchas mesas; teclado y ambos temas.
6. Persistencia real, integridad, versiones, duplicados y respuestas perdidas comprobados por API y navegador, distinguiendo sus alcances.
7. Manual, contrato, permisos y trece recorridos actualizados; [ESTADO-PRUEBAS.md](ESTADO-PRUEBAS.md) separa implementado, probado, simulado y pendiente. La evidencia anterior no acredita automáticamente este cambio.

Inicio reproducible: `npm run setup`, `db:start`, `db:migrate`, `db:seed`, `build`, `npm start`. Calidad: `typecheck`, `lint`, `format:check`, `npm test`, `test:e2e`, `test:persistence`.
