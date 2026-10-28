import { test } from 'node:test';
import assert from 'node:assert/strict';
import { floorFrame, fitFloor, floorTableSize } from '../frontend/src/services/floor-frame.ts';
import type { Table } from '../frontend/src/types/index.ts';
const table = (id: string, x: number, y: number): Table => ({
  id,
  label: id,
  x,
  y,
  sector: 'Salón',
  active: true,
  capacity: 4,
});

test('el salón conserva los tamaños válidos del editor y acota dimensiones antiguas inválidas', () => {
  for (const size of [40, 64, 300, 500]) {
    const saved = { ...table('a', 120, 120), width: size, height: size };
    assert.deepEqual(floorTableSize(saved), { width: size, height: size });
    const frame = floorFrame([saved], []);
    assert.equal(frame.width, size + 32);
    assert.equal(frame.height, size + 32);
  }
  assert.deepEqual(floorTableSize({ width: 8000, height: 1 }), { width: 500, height: 40 });
});

test('ajusta al contenido lejano sin cambiar las coordenadas publicadas', () => {
  const tables = [table('a', 8000, 5000), table('b', 8200, 5100)];
  const original = JSON.stringify(tables);
  const frame = floorFrame(tables, []);
  assert.equal(frame.left, 7984);
  assert.equal(frame.top, 4984);
  assert.equal(frame.width, 324);
  assert.equal(frame.height, 224);
  for (const viewport of [
    { width: 320, height: 400 },
    { width: 1200, height: 650 },
  ]) {
    const scale = fitFloor(frame, viewport);
    assert.ok(frame.width * scale <= viewport.width);
    assert.ok(frame.height * scale <= viewport.height);
  }
  assert.equal(JSON.stringify(tables), original);
});

test('coordenadas antiguas de grilla se presentan sin superposición y se conservan los datos', () => {
  const tables = [table('a', 0, 0), table('b', 1, 0), table('c', 0, 1)];
  const original = JSON.stringify(tables);
  const frame = floorFrame(tables, []);
  assert.equal(new Set(frame.tables.map((t) => `${t.x}:${t.y}`)).size, 3);
  assert.ok(Math.abs(frame.tables[1]!.x - frame.tables[0]!.x) >= 92);
  assert.equal(JSON.stringify(tables), original);
});

test('el encuadre incluye mesas rotadas y paredes con su origen de giro', () => {
  const frame = floorFrame(
    [{ ...table('a', 100, 100), width: 200, height: 80, rotation: 90 }],
    [{ x: 400, y: 100, width: 200, height: 20, rotation: 90 }],
  );
  assert.ok(frame.left <= 160 && frame.top <= 40);
  assert.ok(frame.left + frame.width >= 410);
  assert.ok(frame.top + frame.height >= 310);
});

test('pocas mesas permanecen compactas aunque sobre espacio en el plano', () => {
  for (const count of [1, 5, 12]) {
    const tables = Array.from({ length: count }, (_, index) =>
      table(String(index), (index % 4) * 150, Math.floor(index / 4) * 150),
    );
    const frame = floorFrame(tables, []);
    for (const viewport of [
      { width: 1600, height: 800 },
      { width: 1000, height: 600 },
    ]) {
      const scale = fitFloor(frame, viewport);
      assert.equal(scale, 0.6);
      assert.ok(floorTableSize(tables[0]!).width * scale <= 56);
    }
  }
});
