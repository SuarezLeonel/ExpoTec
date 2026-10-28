import { ensure } from './errors.js';
import type { Data } from './validation.js';

type FloorTable = Data<'floor-plan.draft.save'>['layout']['tables'][number];

function bounds(table: Pick<FloorTable, 'x' | 'y' | 'width' | 'height' | 'rotation'>) {
  const radians = (table.rotation * Math.PI) / 180;
  const width =
    Math.abs(table.width * Math.cos(radians)) + Math.abs(table.height * Math.sin(radians));
  const height =
    Math.abs(table.width * Math.sin(radians)) + Math.abs(table.height * Math.cos(radians));
  return {
    left: table.x + (table.width - width) / 2,
    top: table.y + (table.height - height) / 2,
    right: table.x + (table.width + width) / 2,
    bottom: table.y + (table.height + height) / 2,
  };
}

export function ensureTablesDoNotOverlap(tables: FloorTable[]) {
  const active = tables.filter((table) => table.active);
  for (let index = 0; index < active.length; index++) {
    const current = active[index]!;
    const a = bounds(current);
    for (const other of active.slice(index + 1)) {
      if (other.sector !== current.sector) continue;
      const b = bounds(other);
      ensure(
        a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top,
        422,
        'FLOOR_PLAN_OVERLAP',
        `Las mesas ${current.label} y ${other.label} se superponen en el plano.`,
      );
    }
  }
}
