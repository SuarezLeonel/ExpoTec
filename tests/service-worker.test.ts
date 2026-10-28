import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../frontend/public/sw.js', import.meta.url), 'utf8');
const origin = 'https://restaurant.example';
const cacheName = 'baguette-shell-test-build';
interface WorkerEvent {
  request: { url: string; method: string; mode: string };
  waitUntil: (promise: Promise<unknown>) => void;
  respondWith: (promise: Promise<Response>) => void;
}
function worker() {
  const handlers = new Map<string, (event: WorkerEvent) => void>();
  const stores = new Map<string, Map<string, Response>>();
  let online = true;
  let shellOk = true;
  const network = async (request: string | { url: string }) => {
    if (!online) throw new TypeError('offline');
    const pathname = new URL(typeof request === 'string' ? request : request.url, origin).pathname;
    return pathname === '/'
      ? new Response('<html><script src="/assets/app-current.js"></script></html>', {
          status: shellOk ? 200 : 503,
          headers: { 'content-type': 'text/html' },
        })
      : new Response(`network:${pathname}`);
  };
  runInNewContext(source.replace('__BUILD_ID__', 'test-build'), {
    URL,
    Response,
    fetch: network,
    self: {
      location: { origin },
      addEventListener: (name: string, handler: (event: WorkerEvent) => void) =>
        handlers.set(name, handler),
      skipWaiting() {},
      clients: { claim() {} },
    },
    caches: {
      keys: async () => [...stores.keys()],
      delete: async (key: string) => stores.delete(key),
      open: async (name: string) => {
        if (!stores.has(name)) stores.set(name, new Map());
        const store = stores.get(name)!;
        return {
          put: async (key: string, response: Response) => store.set(key, response),
          match: async (key: string) => store.get(key)?.clone(),
          addAll: async (keys: string[]) => {
            for (const key of keys) store.set(key, await network(key));
          },
        };
      },
    },
  });
  async function dispatch(name: string, pathname = '/', mode = 'navigate', method = 'GET') {
    let lifetime = Promise.resolve<unknown>(undefined);
    let response: Promise<Response> | undefined;
    handlers.get(name)!({
      request: { url: new URL(pathname, origin).href, mode, method },
      waitUntil: (promise) => {
        lifetime = promise;
      },
      respondWith: (promise) => {
        response = promise;
      },
    });
    await lifetime;
    return response;
  }
  return {
    dispatch,
    stores,
    offline: () => {
      online = false;
    },
    failShell: () => {
      shellOk = false;
    },
  };
}

test('la actualización elimina solo cachés anteriores de la aplicación', async () => {
  const app = worker();
  app.stores.set('baguette-shell-v2', new Map());
  app.stores.set('otro-sistema', new Map());
  await app.dispatch('install');
  await app.dispatch('activate');
  assert.equal(app.stores.has('baguette-shell-v2'), false);
  assert.equal(app.stores.has('otro-sistema'), true);
  assert.equal(app.stores.has(cacheName), true);
});

test('la caché queda acotada al shell instalado y funciona offline sin mezclar versiones', async () => {
  const app = worker();
  await app.dispatch('install');
  const keys = [...app.stores.get(cacheName)!.keys()];
  for (let i = 0; i < 50; i++) {
    await app.dispatch('fetch', `/gestion?mesa=${i}`);
    await app.dispatch('fetch', `/assets/old-${i}.js`, 'cors');
  }
  assert.deepEqual([...app.stores.get(cacheName)!.keys()], keys);
  app.offline();
  const shell = await app.dispatch('fetch', '/gestion?mesa=1');
  assert.match(await shell!.text(), /app-current.js/);
  const asset = await app.dispatch('fetch', '/assets/app-current.js?x=1', 'cors');
  assert.equal(await asset!.text(), 'network:/assets/app-current.js');
  app.stores.set('baguette-shell-old', new Map([['/assets/old.js', new Response('old')]]));
  assert.equal((await app.dispatch('fetch', '/assets/old.js', 'cors'))!.type, 'error');
  assert.equal(await app.dispatch('fetch', '/api/state', 'cors', 'POST'), undefined);
  assert.equal(await app.dispatch('fetch', '/uploads/private.png', 'cors'), undefined);
  assert.equal(await app.dispatch('fetch', '/otra-pagina'), undefined);
});

test('una respuesta de error no se instala como aplicación offline', async () => {
  const app = worker();
  app.stores.set('baguette-shell-previous', new Map([['/', new Response('previous')]]));
  app.failShell();
  await assert.rejects(app.dispatch('install'), /No se pudo guardar/);
  assert.equal(app.stores.get('baguette-shell-previous')!.has('/'), true);
  assert.equal(app.stores.get(cacheName)!.has('/'), false);
});
