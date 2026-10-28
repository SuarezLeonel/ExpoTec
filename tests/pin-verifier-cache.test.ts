import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pinVerifierCache } from '../backend/src/modules/pin-verifier-cache.ts';

test('reutiliza solo verificaciones correctas del mismo valor protegido y hash', async () => {
  let calls = 0;
  const verify = pinVerifierCache(async () => {
    calls++;
    return true;
  });
  assert.equal(await verify('protected-a', 'hash-a'), true);
  assert.equal(await verify('protected-a', 'hash-a'), true);
  assert.equal(calls, 1);
  await verify('protected-a', 'hash-b');
  await verify('protected-b', 'hash-b');
  assert.equal(calls, 3);
});

test('caduca, limita entradas y no guarda rechazos ni errores', async () => {
  let now = 0;
  let calls = 0;
  const verify = pinVerifierCache(
    async (value) => {
      calls++;
      if (value === 'error') throw new Error('failure');
      return value !== 'invalid';
    },
    () => now,
    10,
    2,
  );
  await verify('a', 'hash');
  now = 11;
  await verify('a', 'hash');
  assert.equal(calls, 2);
  await verify('b', 'hash');
  await verify('c', 'hash');
  await verify('a', 'hash');
  assert.equal(calls, 5);
  assert.equal(await verify('invalid', 'hash'), false);
  assert.equal(await verify('invalid', 'hash'), false);
  await assert.rejects(verify('error', 'hash'));
  await assert.rejects(verify('error', 'hash'));
  assert.equal(calls, 9);
});

test('solicitudes concurrentes comparten la derivación pendiente', async () => {
  let calls = 0;
  let finish!: (valid: boolean) => void;
  const verify = pinVerifierCache(() => {
    calls++;
    return new Promise<boolean>((resolve) => {
      finish = resolve;
    });
  });
  const first = verify('protected', 'hash');
  const second = verify('protected', 'hash');
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(calls, 1);
  finish(true);
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
});
