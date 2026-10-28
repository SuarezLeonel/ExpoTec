# Publicación en Vercel

El proyecto se despliega desde la raíz: Vite genera `frontend/dist` y
`api/index.ts` expone Express como una función. Las rutas `/api/*` y `/uploads/*`
conservan el mismo dominio que el frontend. `/gestion` y `/carta` sirven la
aplicación React.

PostgreSQL debe estar alojado fuera de la función. La migración
`007_persistent_assets.sql` guarda las nuevas imágenes y exportaciones en la
base, junto con los datos operativos. Los archivos anteriores de una instalación
local siguen siendo legibles desde `STORAGE_DIR`; no se suben automáticamente.
El almacenamiento de imágenes consume la cuota de la base gratuita.

## Configuración

- `DATABASE_URL`: conexión PostgreSQL con TLS, provista por Neon.
- `OPERATION_HASH_KEY`: secreto aleatorio estable de al menos 32 caracteres.
- `DEMO_PASSWORD`: contraseña inicial aleatoria de Gestión.
- `DEMO_MODE`: habilitar solamente para una demostración autorizada.
- `NODE_ENV=production`: proporcionado por Vercel.

Los dominios del despliegue y de producción se incorporan a los orígenes
permitidos usando las variables de sistema de Vercel. Para dominios adicionales,
configurar `ALLOWED_ORIGINS`.

El proyecto está conectado a `NachoTorress/GestionCafe`: cada push a `main`
publica frontend y backend. La compilación de producción aplica las migraciones
pendientes después de compilar, antes de activar la nueva versión. La carga
inicial usa `backend/src/database/seed.ts`; requiere modo demo y conserva los
registros existentes. No ejecutar pruebas destructivas contra la base publicada.

`.env.production.local` y `.vercel/` contienen configuración privada y están
excluidos de Git y del despliegue. Conservar la clave de operaciones junto con
los respaldos. No reutilizar la contraseña de ejemplo del README.

La terminal compartida tiene acceso público en modo demo y usa los PIN ficticios
documentados. Publicar esta demostración no habilita el sistema para operar con
datos reales ni para emitir comprobantes fiscales.
