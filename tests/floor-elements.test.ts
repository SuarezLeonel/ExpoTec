import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schemas } from '../backend/src/modules/validation.ts';
import { floorFrame } from '../frontend/src/services/floor-frame.ts';

const chair = {
  id: '40000000-0000-4000-8000-000000000001',
  kind: 'chair' as const,
  sector: 'Salón' as const,
  x: 100,
  y: 100,
  width: 28,
  height: 28,
  rotation: 90,
};

test('el servidor acepta y conserva sillas al guardar y leer un plano', () => {
  const input = { expected_revision: 1, layout: { tables: [], elements: [chair] } };
  const saved = schemas['floor-plan.draft.save'].parse(input);
  const restored = schemas['floor-plan.draft.save'].shape.layout.parse(
    JSON.parse(JSON.stringify(saved.layout)),
  );
  assert.deepEqual(restored.elements, [chair]);
  assert.equal(
    schemas['floor-plan.draft.save'].safeParse({
      ...input,
      layout: { tables: [], elements: [{ ...chair, kind: 'unknown' }] },
    }).success,
    false,
  );
});

test('las sillas giran desde el centro y el encuadre incluye todo su respaldo', () => {
  const frame = floorFrame([], [{ ...chair, width: 40, height: 20 }]);
  assert.deepEqual(
    { left: frame.left, top: frame.top, width: frame.width, height: frame.height },
    {
      left: 94,
      top: 74,
      width: 52,
      height: 72,
    },
  );
});
