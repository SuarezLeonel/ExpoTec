import type { Table } from '../types';
export function tableLayout(tables: Table[]) {
  const columns = Math.max(8, Math.min(20, 1 + Math.max(0, ...tables.map((t) => t.x))));
  const occupied = new Set<number>();
  const positions: Record<string, { column: number; row: number }> = {};
  for (const table of [...tables].sort(
    (a, b) => a.y - b.y || a.x - b.x || a.label.localeCompare(b.label, 'es', { numeric: true }),
  )) {
    let slot =
      Math.min(11, Math.max(0, table.y)) * columns + Math.min(columns - 1, Math.max(0, table.x));
    if (occupied.has(slot)) {
      slot = 0;
      while (occupied.has(slot)) slot++;
    }
    occupied.add(slot);
    positions[table.id] = { column: (slot % columns) + 1, row: Math.floor(slot / columns) + 1 };
  }
  return { columns, rows: Math.max(1, ...Object.values(positions).map((p) => p.row)), positions };
}
