import test from 'node:test';
import assert from 'node:assert/strict';
import { cents } from '../frontend/src/services/api.ts';
test('interpreta dinero argentino sin separadores ambiguos ni punto flotante', () => {
  for (const [text, amount] of [
    ['0', 0],
    ['0,01', 1],
    ['0.29', 29],
    ['12,34', 1234],
    ['12.3', 1230],
    ['1000000', 100000000],
  ] as const)
    assert.equal(cents(text), amount);
});
test('rechaza negativos, exponentes, separadores de miles y rangos inseguros', () => {
  for (const text of [
    '-1',
    '1e3',
    '1.234',
    '1,000.20',
    '1.000,20',
    '12,345',
    'Infinity',
    'NaN',
    '999999999999999999999999999',
    '1000001',
    '',
  ])
    assert.throws(() => cents(text), text);
});
