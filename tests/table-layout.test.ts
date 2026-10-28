import test from 'node:test';
import assert from 'node:assert/strict';
import { tableLayout } from '../frontend/src/services/table-layout.ts';
import type { Table } from '../frontend/src/types/index.ts';
const table = (id: string, x: number, y: number): Table => ({
  id,
  label: id,
  x,
  y,
  active: true,
  capacity: 4,
  sector: 'Prueba',
});
test('plano denso: conserva 80 mesas en 16 columnas y cinco filas sin superponer', () => {
  const tables = Array.from({ length: 80 }, (_, i) =>
    table(String(i + 1), i % 16, Math.floor(i / 16)),
  );
  const result = tableLayout(tables);
  assert.equal(result.columns, 16);
  assert.equal(result.rows, 5);
  assert.equal(Object.keys(result.positions).length, 80);
  assert.equal(
    new Set(Object.values(result.positions).map((p) => `${p.column}:${p.row}`)).size,
    80,
  );
});
test('coordenadas repetidas conservan todas las mesas visibles y no alteran datos guardados', () => {
  const tables = [table('1', 0, 0), table('2', 0, 0), table('3', 2000, 2000)];
  const original = JSON.stringify(tables);
  const layout = tableLayout(tables);
  assert.equal(new Set(Object.values(layout.positions).map((p) => `${p.column}:${p.row}`)).size, 3);
  assert.equal(JSON.stringify(tables), original);
  assert.deepEqual(tableLayout(tables), layout);
});
