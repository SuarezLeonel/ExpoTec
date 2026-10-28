# Baguette · demo de operación gastronómica

Prototipo local para una sucursal ficticia. React + TypeScript + Vite + Bootstrap; API Node.js + TypeScript + Express; PostgreSQL real. El catálogo es compartido con la carta pública. Precios, personas y operaciones son ficticios; impresión, correo, medios de pago y facturación usan adaptadores de demostración. **Demostración. Sin validez fiscal.**

## Inicio en Windows

Requisito: Node.js 24 LTS con npm. Abrí una terminal en la raíz del proyecto. Las dependencias se instalan desde la raíz; el frontend es un workspace y el backend usa las dependencias compartidas.

```powershell
npm install
npm run setup
npm run db:start
```

El último comando inicia PostgreSQL local real; dejá esa terminal abierta. En otra terminal, desde la misma carpeta:

```powershell
npm run db:migrate
npm run db:seed
npm run build
npm start
```

Abrí [la terminal local](http://127.0.0.1:3100/) (o el puerto configurado): muestra el salón directamente, sin login de empleado. [Gestión](http://127.0.0.1:3100/gestion) mantiene el acceso independiente con usuario y contraseña para caja/encargado. Esta versión compilada permite comprobar la recarga sin conexión. Para editar con recarga automática, usá `npm run dev` y la dirección que informa Vite; el servidor de desarrollo no registra el service worker. Los datos de PostgreSQL se conservan entre reinicios. No vuelvas a sembrar para recuperar una sesión de trabajo: iniciar base y aplicación es suficiente.

`npm run setup` crea `.env` con contraseña aleatoria para la base y una clave aleatoria `OPERATION_HASH_KEY` para idempotencia y protección/localización de PIN; conserva los valores existentes. Guardá esa clave junto con los respaldos de la base: cambiarla impide verificar reintentos y PIN protegidos con el secreto anterior. La copia de referencia de backend está en `backend/.env.example`. Los puertos, orígenes, almacenamiento, conexión y `BRANCH_TIMEZONE` se ajustan por variables de entorno validadas. El puerto inicial de PostgreSQL es 55432; la API escucha en 3100 y Vite en 5173 por defecto. No uses datos personales ni credenciales fiscales reales.

Para un PostgreSQL externo, configurá `DATABASE_URL` y una base separada en `TEST_DATABASE_URL`; omití `db:start`. Las credenciales y permisos de creación corresponden al servidor elegido. El lanzador local crea `baguette_demo` y `baguette_test`; las pruebas no deben apuntar a una base operativa.

## Comprobaciones

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
npm run test:persistence
```

`npm test` necesita PostgreSQL activo y una base de pruebas separada. E2E compila e inicia su propia API en `E2E_PORT` (3101 por defecto), restaura exclusivamente `baguette_e2e` y conserva `baguette_demo`. Requiere el PostgreSQL local activo y un navegador disponible: utiliza `BROWSER_EXECUTABLE`, Brave/Edge detectado en Windows o Chromium de Playwright. Si no hay navegador compatible, instalalo con `npx playwright install chromium`. Los requisitos previos y resultados efectivamente ejecutados se registran en [docs/ESTADO-PRUEBAS.md](docs/ESTADO-PRUEBAS.md). La existencia de un comando o de una prueba no acredita que haya sido ejecutada.

Para usar la compilación local, ejecutá `npm run build` y luego `npm start` con PostgreSQL activo. La API sirve también el frontend compilado en el puerto configurado.

`npm run test:persistence` reinicia únicamente el cluster PostgreSQL demo local dentro del proyecto, verifica cantidades y huella de operaciones antes/después y escribe `test-results/persistence.json`. Ejecutalo sin otras pruebas o escrituras en curso.

## Uso y documentación

- [Revisión ECC del 21/10/2026](docs/REVISION-2026-10-21.md): cierre al enviar, salida sin cambios, caché acotada y prioridades pendientes.
- [Revisión del 20/10/2026](docs/REVISION-2026-10-20.md): mejoras de seguridad, recuperación y usabilidad, con alcance de las verificaciones.
- [Manual de usuario](docs/MANUAL-USUARIO.md): ingreso y operación por rol.
- [Guion de reunión](docs/GUION-REUNION.md): trece recorridos y preguntas para el encargado.
- [Arquitectura](docs/ARQUITECTURA.md), [permisos](docs/PERMISOS.md) y [reglas operativas](docs/REGLAS-OPERATIVAS.md).
- [API](docs/API.md) y [contrato detallado](docs/API-CONTRACT.md).
- [Integraciones](docs/INTEGRACIONES.md), [identidad visual](docs/IDENTIDAD.md) y [especificación](docs/SPEC.md).

La restauración destructiva desde la aplicación requiere administrador, modo demostración y confirmación literal `RESTAURAR DEMO`. La alternativa de terminal es `npm run demo:reset`, también limitada a `baguette_demo`, con la misma confirmación. Conservá una copia de la base y del almacenamiento si necesitás preservar evidencia. Los usuarios ficticios son `admin`, `caja`, `mozo`, `moza`, `cocina` y `bar`; la contraseña inicial se toma de `DEMO_PASSWORD` (por defecto local `DemoBaguette2026!`). Deben reemplazarse antes de cualquier uso fuera de la demostración.

La demo tiene almacenamiento persistente y reglas operativas reales. Las limitaciones pendientes se indican en el registro de pruebas; no constituye una habilitación para operar una sucursal en producción.

## Terminal compartida y pedidos

El PIN se valida automáticamente al completar el cuarto dígito, sin tocar un botón ni presionar Enter. Si es incorrecto, el campo se limpia y conserva el foco para volver a escribirlo.

En la terminal, agregar productos, cambiar cantidades y escribir notas arma un borrador guardado en el dispositivo, separado por empleado y mesa. «Enviar pedido» guarda primero la solicitud local, inicia el envío de todos los renglones juntos en segundo plano y cierra la mesa de inmediato, volviendo al salón. «Enviando» pasa a confirmado solo con la respuesta del servidor. La cuenta de una mesa libre se crea al confirmar ese primer envío. Si falta conexión o se pierde la respuesta, el pedido queda en Pendientes para consultar/reintentar sin duplicarlo, con el PIN de su responsable. El botón de envío de esa mesa espera la confirmación anterior; se puede seguir armando el siguiente pedido. Las animaciones duran 80–150 ms y respetan movimiento reducido.

La terminal obtiene automáticamente una sesión técnica limitada. Tocar cualquier mesa, libre u ocupada, solicita un PIN de cuatro dígitos que identifica al empleado sin selector de persona. Luego abre la carta por categoría → subcategoría → producto → variante. La carta importada reúne sus 27 secciones en cinco principales: Cafetería, Desayunos, Cocina, Dulces y Bebidas. Tocar un producto permite elegir una variante, ajustar la cantidad con +/− y agregar observaciones escritas o rápidas en la misma pantalla. Los productos individuales conservan el botón + para sumar una unidad. El pedido aparece al costado; en celular se alterna Carta/Pedido. «Nota» permite comentar un ítem desde el pedido y «Enviar pedido» permanece al pie. Cobrar y solicitar cuenta están a la vista, según los permisos; las demás operaciones siguen en «Opciones de cuenta».

Catálogo permite crear principales y subcategorías mediante «Categoría principal», y configurar «Producto base» y «Nombre de la variante» en cada producto. Las opciones con el mismo producto base y subcategoría se agrupan tanto en la comandera como en la carta pública. Cada variante conserva su identificación, precio, agregados, disponibilidad y visibilidad propios. La migración `011_category_hierarchy.sql` reorganiza las secciones conservando sus IDs, productos y consumos; las futuras importaciones aplican la misma jerarquía. Desactivar una principal impide nuevos pedidos de toda su rama, conservando las instantáneas existentes.

El encargado configura solo los cuatro últimos dígitos del DNI, sin documento completo. Los PIN activos deben ser únicos; los duplicados se rechazan. La demo usa sufijos ficticios: admin 4101, caja 4202, mozo 4303 y moza 4606. El token operativo queda ligado a terminal, empleado y mesa; solo vive en memoria. Salir, cambiar de mesa o recargar lo descarta; **volver a entrar siempre pide PIN**, aunque sea la misma mesa. El máximo de diez minutos del servidor no evita esa reentrada. La salida solicita además liberar la autorización al servidor; una nueva identificación invalida las anteriores de esa terminal.

Enviar marca los ítems como **Pedido**. No hay que pasar por cocina, preparando, listo o entregado para cobrar/cerrar. Se conservan registros anteriores. El camarero agrega/envía y realiza sus acciones permitidas; no descuenta, anula, cobra ni cierra. Gestión de catálogo, usuarios y configuración exige `/gestion`; **un PIN administrador en la terminal no concede esos permisos**. La API verifica contexto y rol.

Sin conexión se conservan pendientes admitidos, sin PIN ni token operativo. No se identifica un empleado nuevo ni se abre una mesa nueva offline. Para sincronizar después de recargar se vuelve a ingresar el PIN online del operador correspondiente. El arranque automático exige `DEMO_MODE=true`; la ejecución actual escucha en `127.0.0.1` por configuración, sin una comprobación adicional de IP en ese endpoint. El enrolamiento de dispositivos de producción queda pendiente. [Estado de pruebas](docs/ESTADO-PRUEBAS.md) separa la evidencia anterior y la validación de esta revisión.

La migración a terminal conserva datos e historial. El seed puede completar el localizador de los PIN ficticios conocidos después de verificar su hash. Un PIN personalizado anterior no se puede recuperar ni adivinar desde su verificador: el encargado debe configurarlo nuevamente desde Gestión antes de identificar a esa persona en terminal.
