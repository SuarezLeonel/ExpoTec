import { spawn } from 'node:child_process';
const children = [];
function start(args) {
  const child = spawn(process.execPath, args, { stdio: 'inherit', env: process.env });
  children.push(child);
  child.on('exit', (code) => {
    if (code) {
      console.error('Un servicio se detuvo con error', code);
      stop();
    }
  });
}
function stop() {
  for (const child of children) child.kill('SIGTERM');
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
start(['--env-file=.env', '--import', 'tsx', '--watch', 'backend/src/server.ts']);
start([
  'node_modules/vite/bin/vite.js',
  '--config',
  'frontend/vite.config.ts',
  '--host',
  '127.0.0.1',
]);
