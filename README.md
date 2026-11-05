# Gestion - cafe · Sistema de Gestión Gastronómica (Cafetería & Salón)

Sistema integral de punto de venta (POS), comandas y administración gastronómica diseñado para sucursales de cafetería y gastronomía. Implementa una arquitectura **offline-first**, soporte de terminales compartidas táctiles con identificación por PIN, auditoría de libro inmutable (ledger) y compatibilidad con bases de datos relacionales duales (**PostgreSQL** y **MySQL / TiDB Cloud en AWS**).

---

## 1. Tecnologías Principales

* **Frontend**:
  * **React 19** + **TypeScript 5.9** sobre **Vite 7.3** (compilación ultrarrápida y HMR).
  * **Bootstrap 5.3** + Sistema de diseño CSS personalizado (modo claro/oscuro dinámico).
  * **Lucide React** para iconografía consistente y accesible.
  * **Service Worker** para soporte offline y caché controlada del shell de la aplicación.
* **Backend**:
  * **Node.js (LTS 22 / 24)** en modo ECMAScript Modules (`"type": "module"`).
  * **Express 5.2** con enrutamiento modular y manejo centralizado de errores.
  * **Zod 4.3** para validación estricta de esquemas de datos y contratos de entrada.
  * **Helmet** con CSP riguroso, CORS parametrizado y cookies de sesión con `SameSite=Lax`.
  * **Sharp** para optimización y reescalado de imágenes a formato WebP.
* **Base de Datos (Soporte Dual)**:
  * **PostgreSQL (v14–v18)**: Motor relacional principal con soporte para clúster local embebido (`embedded-postgres`), Docker o servidores gestionados.
  * **MySQL 8.0 / TiDB Cloud (AWS)**: Motor cloud serverless escalable con cifrado obligatorio TLS 1.2.
* **Calidad y Pruebas**:
  * **Node Test Runner** nativo con ejecución mediante **TSX**.
  * **Playwright** para pruebas E2E de navegador completas.
  * **ESLint 9** (Flat Config) + **TypeScript-ESLint 8** + **Prettier 3**.

---

## 2. Estructura del Proyecto

```text
├── api/                        # Entrada serverless para despliegues (Vercel)
│   └── index.ts
├── backend/                    # Servidor, API y lógica de negocio
│   ├── catalog/                # Catálogo JSON maestro de productos iniciales
│   ├── sql/                    # Migraciones PostgreSQL y esquema MySQL (database_mysql.sql)
│   ├── src/
│   │   ├── app.ts              # Fábrica de aplicación Express, seguridad y middlewares
│   │   ├── server.ts           # Punto de arranque del servidor HTTP local
│   │   ├── config/             # Validación de variables de entorno con Zod
│   │   ├── database/           # Abstracción de conexión dual (pg / mysql2) y transacciones
│   │   ├── middleware/         # Autenticación, protección CSRF y control de roles
│   │   └── modules/            # Controladores y comandos (cuentas, pedidos, caja, mesas)
│   └── tests/                  # Pruebas de integración, dinero exacto y seguridad
├── frontend/                   # Aplicación cliente SPA
│   ├── public/                 # Service Worker (sw.js), tipografías e isotipos
│   └── src/
│       ├── app.tsx             # Shell principal de gestión, navbar y router SPA
│       ├── main.tsx            # Punto de montaje del DOM e importación de estilos
│       ├── components/         # Workspace de comandas, paleta del salón, terminal y UI
│       ├── contexts/           # Estado global reactivo (Store.tsx) y tema visual (Theme.tsx)
│       ├── hooks/              # Hooks personalizados (useLocalOrder, useFloorViewport, etc.)
│       ├── pages/              # Vistas: Salón, Cocina, Caja, Catálogo, Auditoría, Editor, Login
│       ├── services/           # Cliente HTTP (api.ts), permisos, categorías y polling
│       ├── styles/             # Hojas de estilo del sistema de diseño (tokens, layouts, temas)
│       └── types/              # Tipos TypeScript compartidos en frontend
├── docs/                       # Documentación técnica, API contracts y BASE-DE-DATOS.md
├── scripts/                    # Scripts utilitarios (setup, dev, build, db, migraciones)
├── tests/                      # Pruebas unitarias de interfaz y suite E2E de Playwright
├── .env.example                # Plantilla de entorno para desarrollo local
├── .env.production.example     # Plantilla de entorno documentada para producción
├── vercel.json                 # Configuración de rutas y rewrites de despliegue
└── package.json                # Dependencias unificadas de workspace y scripts de ejecución
```

---

## 3. Rutas y Experiencia de Usuario

La aplicación distribuye sus funcionalidades en tres accesos bien definidos:

1. **Terminal de Salón (`/` o `/terminal`)**:
   * Vista táctil de pantalla completa diseñada para los mozos en el salón.
   * Muestra las mesas organizadas por sectores (Interior, Terraza, Barra, etc.).
   * Al tocar cualquier mesa libre u ocupada, solicita un **PIN personal de 4 dígitos** (últimos 4 dígitos del DNI).
   * Al validar el PIN, abre el espacio de comanda (`TableOrderWorkspace`) para agregar productos, variantes, observaciones y enviar el pedido en un solo toque, cerrando la mesa de inmediato.
2. **Panel de Gestión (`/gestion`)**:
   * Acceso protegido mediante **usuario y contraseña** para supervisores, encargados y cajeros.
   * Brinda acceso según permisos a:
     * **Caja**: Apertura, arqueo, ingresos/egresos y cobro de cuentas.
     * **Cocina / Bar**: Pantalla de preparación de comandas en tiempo real.
     * **Catálogo**: Edición de productos, precios, categorías jerárquicas y variantes.
     * **Diseño del salón**: Editor visual con cuadrícula, zoom, rotación y mobiliario.
     * **Auditoría**: Trazabilidad detallada de todas las operaciones realizadas.
3. **Carta Pública Digital (`/carta`)**:
   * Menú digital interactivo para los clientes, agrupado por categorías principales y variantes, sin acceso a operaciones internas.

---

## 4. Requisitos Previos

* **Node.js**: Versión **22 LTS** o **24 LTS**.
* **npm**: Versión 10 o superior (incluido con Node.js).
* *(Opcional)*: Clúster de **TiDB Cloud** o **PostgreSQL externo** si no se utiliza la base local embebida.

---

## 5. Instalación y Puesta en Marcha

### Paso 1: Clonar e instalar dependencias

```powershell
git clone https://github.com/SuarezLeonel/ExpoTec.git
cd ExpoTec
npm install
```

### Paso 2: Configurar variables de entorno y base local

El comando `setup` genera automáticamente un archivo `.env` con contraseñas aleatorias seguras y la clave criptográfica `OPERATION_HASH_KEY` necesaria para el sellado de PINs e idempotencia:

```powershell
npm run setup
```

### Paso 3: Iniciar la base de datos local

Iniciá el motor de PostgreSQL local embebido (dejá esta terminal abierta):

```powershell
npm run db:start
```

### Paso 4: Migrar, sembrar y compilar

En otra terminal, desde la carpeta del proyecto:

```powershell
# Aplica las migraciones estructurales
npm run db:migrate

# Siembra los usuarios iniciales, mesas y catálogo base
npm run db:seed

# Compila el frontend optimizado para producción
npm run build

# Inicia el servidor de la aplicación
npm start
```

La aplicación estará lista en:
* **Terminal de salón**: [http://127.0.0.1:3100/](http://127.0.0.1:3100/)
* **Panel de gestión**: [http://127.0.0.1:3100/gestion](http://127.0.0.1:3100/gestion)
* **Carta pública**: [http://127.0.0.1:3100/carta](http://127.0.0.1:3100/carta)

---

## 6. Modo Desarrollo con Recarga Rápida (HMR)

Para trabajar activamente en el código fuente con recarga en caliente:

```powershell
npm run dev
```

Vite iniciará el servidor de desarrollo en `http://localhost:5173`, redirigiendo automáticamente las llamadas `/api/*` al backend Express en el puerto 3100.

---

## 7. Conexión con TiDB Cloud (MySQL en la Nube)

Si preferís operar el sistema utilizando un clúster en la nube de **TiDB Cloud**:

1. En tu archivo `.env`, configurá la variable `DATABASE_URL`:
   ```env
   DATABASE_URL=mysql://<USUARIO>:<CONTRASENA>@gateway01.sa-east-1.prod.aws.tidbcloud.com:4000/cafe_demo?ssl={"rejectUnauthorized":true}
   ```
2. Ejecutá la migración automática a TiDB:
   ```powershell
   npm run db:migrate:tidb
   ```
3. El backend detectará automáticamente el protocolo `mysql:` y utilizará el pool de conexiones optimizado con reintentos para sockets en la nube.

---

## 8. Usuarios de Prueba y PINs de Demostración

La base de demostración incluye los siguientes usuarios preconfigurados con la contraseña unificada `DemoBaguette2026!`:

| Usuario | Nombre | Rol | PIN de Salón | Permisos Destacados |
| :--- | :--- | :--- | :---: | :--- |
| `admin` | Ana Encargada | `admin` | `4101` | Acceso global a todas las funciones y configuraciones. |
| `caja` | Carla Cajera | `cashier` | `4202` | Apertura/cierre de caja, cobros, facturación y descuentos. |
| `mozo` | Martín Camarero | `waiter` | `4303` | Apertura de mesas, carga y envío de comandas. |
| `moza` | María Camarera | `waiter` | `4606` | Apertura de mesas, carga y envío de comandas. |
| `cocina` | Lucía Cocina | `kitchen` | `4404` | Visualización y cambio de estados en pantalla de cocina. |

---

## 9. Comandos Disponibles en `package.json`

| Comando | Descripción |
| :--- | :--- |
| `npm run setup` | Crea `.env` con secretos criptográficos aleatorios si no existe. |
| `npm run db:start` | Inicia el motor PostgreSQL embebido local en el puerto 55432. |
| `npm run db:migrate` | Aplica las migraciones pendientes en PostgreSQL. |
| `npm run db:seed` | Carga usuarios, mesas, carta y plano inicial en la base activa. |
| `npm run db:migrate:tidb` | Ejecuta el esquema `backend/sql/database_mysql.sql` en TiDB Cloud. |
| `npm run dev` | Inicia backend y frontend en modo desarrollo con Vite HMR. |
| `npm run build` | Compila frontend y valida tipos para producción en `frontend/dist`. |
| `npm start` | Inicia el servidor Node.js sirviendo la API y el frontend compilado. |
| `npm run typecheck` | Comprobación estricta de tipos TypeScript en backend y frontend. |
| `npm run lint` | Análisis estático de código con ESLint en todo el repositorio. |
| `npm test` | Ejecuta la suite de 100 pruebas de lógica, integración y seguridad. |
| `npm run test:e2e` | Ejecuta las pruebas automatizadas de navegador con Playwright. |
| `npm run demo:reset` | Restaura la base de demostración a su estado inicial de fábrica. |

---

## 10. Documentación Complementaria

* [**Arquitectura de Base de Datos**](docs/BASE-DE-DATOS.md): Detalle técnico de tablas, campos, claves foráneas, índices y reglas del libro contable inmutable.
* [**Reglas Operativas**](docs/REGLAS-OPERATIVAS.md): Circuitos de comanda, cobro, asignación de mesas y reglas de negocio gastronómicas.
* [**Contrato de API**](docs/API-CONTRACT.md): Especificación detallada de endpoints, parámetros y estructuras de respuesta.
* [**Manual de Usuario**](docs/MANUAL-USUARIO.md): Guía de uso y procedimientos para cada rol del salón.
