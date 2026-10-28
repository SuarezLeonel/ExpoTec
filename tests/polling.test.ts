import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startPolling } from '../frontend/src/services/polling.ts';

function visibility() {
  let hidden = false;
  const target = new EventTarget();
  Object.defineProperty(target, 'hidden', { get: () => hidden });
  return {
    document: target as unknown as Document,
    setHidden(value: boolean) {
      hidden = value;
      target.dispatchEvent(new Event('visibilitychange'));
    },
  };
}
const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

test('la actualización espera a que termine la anterior y no acumula trabajo', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const view = visibility();
  let calls = 0;
  let resolve!: () => void;
  const gate = new Promise<void>((done) => {
    resolve = done;
  });
  const stop = startPolling(
    () => {
      calls++;
      return gate;
    },
    7000,
    view.document,
  );
  try {
    t.mock.timers.tick(7000);
    assert.equal(calls, 1);
    t.mock.timers.tick(60_000);
    assert.equal(calls, 1);
    resolve();
    await settle();
    t.mock.timers.tick(6999);
    assert.equal(calls, 1);
    t.mock.timers.tick(1);
    assert.equal(calls, 2);
  } finally {
    stop();
    resolve();
    await settle();
  }
});

test('la pestaña oculta pausa las lecturas y volver actualiza sin duplicarlas', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const view = visibility();
  let calls = 0;
  const stop = startPolling(
    async () => {
      calls++;
    },
    7000,
    view.document,
  );
  t.mock.timers.tick(7000);
  await settle();
  assert.equal(calls, 1);
  view.setHidden(true);
  t.mock.timers.tick(60_000);
  await settle();
  assert.equal(calls, 1);
  view.setHidden(false);
  await settle();
  assert.equal(calls, 2);
  stop();
  view.setHidden(true);
  view.setHidden(false);
  t.mock.timers.tick(60_000);
  await settle();
  assert.equal(calls, 2);
});

test('un fallo puede recuperarse y detener durante una lectura no crea otro temporizador', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const view = visibility();
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const stop = startPolling(
    async () => {
      calls++;
      if (calls === 1) throw new Error('Sin conexión');
      await gate;
    },
    7000,
    view.document,
  );
  t.mock.timers.tick(7000);
  await settle();
  t.mock.timers.tick(7000);
  await settle();
  assert.equal(calls, 2);
  stop();
  release();
  await settle();
  t.mock.timers.tick(60_000);
  await settle();
  assert.equal(calls, 2);
});
