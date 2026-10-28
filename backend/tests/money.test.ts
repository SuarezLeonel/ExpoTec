import test from 'node:test';
import assert from 'node:assert/strict';
import { percentCents, splitCents } from '../src/modules/money.js';
import { canonical } from '../src/modules/security.js';
import { mayResetDemo } from '../src/modules/demo-guard.js';

test('centavos: partes exactas con resto y redondeo comercial', () => {
  assert.deepEqual(splitCents(100, 3), [34, 33, 33]);
  assert.deepEqual(splitCents(1, 3), [1, 0, 0]);
  for (let amount = 0; amount < 1000; amount++) {
    for (let parts = 2; parts <= 30; parts++) {
      const values = splitCents(amount, parts);
      assert.equal(
        values.reduce((sum, v) => sum + v, 0),
        amount,
      );
      assert.ok(Math.max(...values) - Math.min(...values) <= 1);
    }
  }
  assert.equal(percentCents(101, 50), 51);
  assert.equal(percentCents(99, 100), 99);
  assert.throws(() => percentCents(100, 101));
  assert.throws(() => splitCents(1.2, 3));
});
test('contenido canónico conserva significado y detecta cambios', () => {
  assert.equal(canonical({ b: 2, a: { d: 4, c: 3 } }), canonical({ a: { c: 3, d: 4 }, b: 2 }));
  assert.notEqual(canonical({ amount: 1 }), canonical({ amount: 2 }));
});
test('reset destructivo solo admite bases exactas demo y test controladas', () => {
  assert.equal(mayResetDemo('postgresql://local/baguette_demo', true, 'development'), true);
  assert.equal(mayResetDemo('postgresql://local/baguette_test', true, 'test'), true);
  assert.equal(mayResetDemo('postgresql://local/baguette_test', true, 'production'), false);
  assert.equal(
    mayResetDemo('postgresql://local/restaurant_contest_2026', true, 'development'),
    false,
  );
  assert.equal(mayResetDemo('postgresql://local/real_demo_history', true, 'development'), false);
  assert.equal(mayResetDemo('postgresql://local/baguette_demo', false, 'development'), false);
});
