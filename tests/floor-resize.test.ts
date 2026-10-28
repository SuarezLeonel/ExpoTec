import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resizeFloorItem, type ResizeHandle } from '../frontend/src/services/floor-resize.ts';

const options = { step: 1, minWidth: 16, minHeight: 16, maxWidth: 1000, maxHeight: 1000 };
const item = { x: 100, y: 100, width: 100, height: 80, rotation: 0 };
const directions: Record<ResizeHandle, [number, number]> = {
  nw: [-1, -1],
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
};

function oppositeAnchor(rectangle: typeof item, handle: ResizeHandle, anchoredLeft = false) {
  const [horizontal, vertical] = directions[handle];
  const angle = (rectangle.rotation * Math.PI) / 180;
  const originX = anchoredLeft ? 0 : rectangle.width / 2;
  const originY = rectangle.height / 2;
  const localX = ((1 - horizontal) * rectangle.width) / 2 - originX;
  const localY = ((1 - vertical) * rectangle.height) / 2 - originY;
  return {
    x: rectangle.x + originX + Math.cos(angle) * localX - Math.sin(angle) * localY,
    y: rectangle.y + originY + Math.sin(angle) * localX + Math.cos(angle) * localY,
  };
}

function assertAnchor(
  original: typeof item,
  resized: ReturnType<typeof resizeFloorItem>,
  handle: ResizeHandle,
  anchoredLeft = false,
) {
  const before = oppositeAnchor(original, handle, anchoredLeft);
  const after = oppositeAnchor({ ...resized, rotation: original.rotation }, handle, anchoredLeft);
  assert.ok(Math.abs(before.x - after.x) <= 0.51, `anchor x changed: ${before.x} -> ${after.x}`);
  assert.ok(Math.abs(before.y - after.y) <= 0.51, `anchor y changed: ${before.y} -> ${after.y}`);
}

test('los ocho bordes y esquinas conservan el lado opuesto', () => {
  const expected: Record<ResizeHandle, [number, number, number, number]> = {
    nw: [120, 110, 80, 70],
    n: [100, 110, 100, 70],
    ne: [100, 110, 120, 70],
    e: [100, 100, 120, 80],
    se: [100, 100, 120, 90],
    s: [100, 100, 100, 90],
    sw: [120, 100, 80, 90],
    w: [120, 100, 80, 80],
  };
  for (const handle of Object.keys(expected) as ResizeHandle[]) {
    const result = resizeFloorItem(item, handle, { x: 20, y: 10 }, options);
    const [x, y, width, height] = expected[handle];
    assert.deepEqual(result, { x, y, width, height });
    assertAnchor(item, result, handle);
  }
});

test('el arrastre se interpreta en los ejes de una mesa girada 90 grados', () => {
  const rotated = { ...item, rotation: 90 };
  const east = resizeFloorItem(rotated, 'e', { x: 0, y: 40 }, options);
  assert.deepEqual(east, { x: 80, y: 120, width: 140, height: 80 });
  assertAnchor(rotated, east, 'e');
  const northwest = resizeFloorItem(rotated, 'nw', { x: 20, y: -30 }, options);
  assert.deepEqual(northwest, { x: 95, y: 75, width: 130, height: 100 });
  assertAnchor(rotated, northwest, 'nw');
});

test('el punto opuesto queda fijo con angulos oblicuos para todos los tiradores', () => {
  for (const rotation of [37, -133, 270]) {
    const rotated = { ...item, x: 400, y: 400, rotation };
    for (const handle of Object.keys(directions) as ResizeHandle[]) {
      const result = resizeFloorItem(rotated, handle, { x: 27, y: -19 }, options);
      assertAnchor(rotated, result, handle);
      if (!directions[handle][0]) assert.equal(result.width, rotated.width);
      if (!directions[handle][1]) assert.equal(result.height, rotated.height);
      for (const value of Object.values(result)) assert.ok(Number.isInteger(value));
    }
  }
});

test('los elementos arquitectonicos respetan su origen de giro izquierdo', () => {
  const rotated = { ...item, rotation: 90 };
  const east = resizeFloorItem(rotated, 'e', { x: 0, y: 30 }, { ...options, anchoredLeft: true });
  assert.deepEqual(east, { x: 100, y: 100, width: 130, height: 80 });
  const west = resizeFloorItem(rotated, 'w', { x: 0, y: -30 }, { ...options, anchoredLeft: true });
  assert.deepEqual(west, { x: 100, y: 70, width: 130, height: 80 });
  for (const rotation of [0, 37, 90, -133]) {
    const original = { ...item, x: 500, y: 500, rotation };
    for (const handle of Object.keys(directions) as ResizeHandle[]) {
      const result = resizeFloorItem(
        original,
        handle,
        { x: 27, y: -19 },
        { ...options, anchoredLeft: true },
      );
      assertAnchor(original, result, handle, true);
    }
  }
});

test('el paso se aplica sobre el desplazamiento local, tambien con rotacion', () => {
  assert.deepEqual(resizeFloorItem(item, 'se', { x: 29, y: 31 }, { ...options, step: 20 }), {
    x: 100,
    y: 100,
    width: 120,
    height: 120,
  });
  assert.deepEqual(resizeFloorItem(item, 'se', { x: -9, y: -11 }, { ...options, step: 20 }), {
    x: 100,
    y: 100,
    width: 100,
    height: 60,
  });
  const rotation = 45;
  const angle = (rotation * Math.PI) / 180;
  const result = resizeFloorItem(
    { ...item, rotation },
    'se',
    {
      x: Math.cos(angle) * 28 - Math.sin(angle) * 31,
      y: Math.sin(angle) * 28 + Math.cos(angle) * 31,
    },
    { ...options, step: 20 },
  );
  assert.equal(result.width, 120);
  assert.equal(result.height, 120);
  assertAnchor({ ...item, rotation }, result, 'se');
});

test('las dimensiones se detienen en los limites sin mover el lado fijo', () => {
  const limits = { ...options, minWidth: 56, minHeight: 56, maxWidth: 220, maxHeight: 160 };
  for (const delta of [
    { x: 1000, y: 1000 },
    { x: -1000, y: -1000 },
  ]) {
    const result = resizeFloorItem(item, 'se', delta, limits);
    assert.equal(result.width, delta.x > 0 ? 220 : 56);
    assert.equal(result.height, delta.y > 0 ? 160 : 56);
    assertAnchor(item, result, 'se');
  }
});

test('al llegar al borde del plano se frena el arrastre completo conservando el ancla', () => {
  const original = { ...item, x: 10, y: 20 };
  const result = resizeFloorItem(original, 'nw', { x: -100, y: -100 }, options);
  assert.deepEqual(result, { x: 0, y: 10, width: 110, height: 90 });
  assertAnchor(original, result, 'nw');

  const upper = { ...item, x: 199990, y: 199980 };
  const capped = resizeFloorItem(upper, 'nw', { x: 50, y: 100 }, options);
  assert.deepEqual(capped, { x: 200000, y: 199993, width: 90, height: 67 });
  assertAnchor(upper, capped, 'nw');

  const rotated = { ...item, x: 0, rotation: 90 };
  assert.deepEqual(resizeFloorItem(rotated, 'e', { x: 0, y: 100 }, options), {
    x: rotated.x,
    y: rotated.y,
    width: rotated.width,
    height: rotated.height,
  });
});

test('los bordes espaciales y el ancla se conservan al redondear giros oblicuos', () => {
  for (const anchoredLeft of [false, true]) {
    for (const rotation of [17, 37, 79, 135, 241, 329]) {
      for (const x of [0, 1, 199999, 200000]) {
        const original = { ...item, x, y: x, rotation };
        for (const handle of Object.keys(directions) as ResizeHandle[]) {
          const result = resizeFloorItem(
            original,
            handle,
            { x: -403, y: 287 },
            { ...options, anchoredLeft },
          );
          assert.ok(result.x >= 0 && result.x <= 200000);
          assert.ok(result.y >= 0 && result.y <= 200000);
          assert.ok(result.width >= options.minWidth && result.width <= options.maxWidth);
          assert.ok(result.height >= options.minHeight && result.height <= options.maxHeight);
          assertAnchor(original, result, handle, anchoredLeft);
        }
      }
    }
  }
});

test('no modifica el objeto ni las opciones originales', () => {
  const original = Object.freeze({ ...item, rotation: 37 });
  const settings = Object.freeze({ ...options, anchoredLeft: true });
  resizeFloorItem(original, 'nw', Object.freeze({ x: 44, y: -71 }), settings);
  assert.deepEqual(original, { ...item, rotation: 37 });
  assert.deepEqual(settings, { ...options, anchoredLeft: true });
});

test('las esquinas mantienen la proporcion al agrandar y achicar, incluso con giro y cuadricula', () => {
  for (const rotation of [0, 37, 90, 241]) {
    for (const step of [1, 20]) {
      const original = { ...item, x: 400, y: 400, width: 64, height: 64, rotation };
      const angle = (rotation * Math.PI) / 180;
      for (const handle of ['nw', 'ne', 'se', 'sw'] as const) {
        const [horizontal, vertical] = directions[handle];
        for (const change of [-17, 53]) {
          const localX = horizontal * change;
          const localY = (vertical * change) / 2;
          const result = resizeFloorItem(
            original,
            handle,
            {
              x: Math.cos(angle) * localX - Math.sin(angle) * localY,
              y: Math.sin(angle) * localX + Math.cos(angle) * localY,
            },
            { ...options, step, preserveAspectRatio: true },
          );
          assert.equal(result.width, 64 + Math.round(change / step) * step);
          assert.equal(result.height, result.width);
          assertAnchor(original, result, handle);
        }
      }
    }
  }
});

test('la proporcion se conserva en los limites de tamaño y del plano', () => {
  const original = { ...item, x: 10, y: 20, width: 64, height: 64 };
  const limits = {
    ...options,
    minWidth: 40,
    minHeight: 50,
    maxWidth: 500,
    maxHeight: 300,
    preserveAspectRatio: true,
  };
  for (const [delta, size] of [
    [-1000, 50],
    [1000, 300],
  ]) {
    const result = resizeFloorItem(original, 'se', { x: delta, y: delta / 2 }, limits);
    assert.equal(result.width, size);
    assert.equal(result.height, size);
    assertAnchor(original, result, 'se');
  }
  const result = resizeFloorItem(original, 'nw', { x: -100, y: -50 }, limits);
  assert.deepEqual(result, { x: 0, y: 10, width: 74, height: 74 });
  assertAnchor(original, result, 'nw');
  for (const rotation of [17, 37, 79, 135, 241, 329]) {
    for (const coordinate of [0, 1, 199999, 200000]) {
      const rotated = { ...original, x: coordinate, y: coordinate, rotation };
      for (const handle of ['nw', 'ne', 'se', 'sw'] as const) {
        const resized = resizeFloorItem(rotated, handle, { x: -403, y: 287 }, limits);
        assert.equal(resized.width, resized.height);
        assert.ok(resized.x >= 0 && resized.x <= 200000);
        assert.ok(resized.y >= 0 && resized.y <= 200000);
        assertAnchor(rotated, resized, handle);
      }
    }
  }
});
