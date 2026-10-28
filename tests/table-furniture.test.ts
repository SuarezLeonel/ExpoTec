import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tableSeats } from '../frontend/src/components/TableFurniture.tsx';

test('dibuja una silla por lugar para distintas capacidades', () => {
  for (const shape of ['round', 'square', 'rectangular'] as const) {
    for (const capacity of [2, 4, 6, 8]) {
      assert.equal(tableSeats(shape, 120, 72, capacity).length, capacity);
    }
  }
});

test('distribuye simétricamente las sillas de mesas no redondas', () => {
  for (const capacity of [2, 4, 6, 8]) {
    const seats = tableSeats('rectangular', 120, 72, capacity);
    const counts = Object.fromEntries(
      (['top', 'right', 'bottom', 'left'] as const).map((side) => [
        side,
        seats.filter((seat) => seat.side === side).length,
      ]),
    );
    assert.equal(counts.top, counts.bottom);
    assert.equal(counts.left, counts.right);
  }
});

test('mantiene redondo el tablero aunque el espacio guardado sea rectangular', () => {
  const seats = tableSeats('round', 160, 80, 4);
  const right = seats.find((seat) => seat.x > 50)!;
  const bottom = seats.find((seat) => seat.y > 50)!;
  assert.equal(right.x, 50 + (((80 * 0.64) / 2 + 10) * 100) / 160);
  assert.equal(bottom.y, 50 + (((80 * 0.64) / 2 + 10) * 100) / 80);
});
