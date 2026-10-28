import { createApp } from './app.js';
import { config } from './config/env.js';
import { pool } from './database/db.js';

await pool.query('SELECT 1 FROM schema_migrations LIMIT 1');
const server = createApp().listen(config.PORT, config.HOST, () =>
  process.stdout.write(`Demo gastronómica disponible en http://${config.HOST}:${config.PORT}\n`),
);
let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  server.close(() => {
    void pool.end().then(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
