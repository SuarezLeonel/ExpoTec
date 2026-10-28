import { useRef } from 'react';
import type { Table } from '../types';
import { tableLayout } from '../services/table-layout';

/** The live floor is one continuous map; its viewport, not pagination, handles large layouts. */
export function floorView(tables: Table[]) {
  const layout = tableLayout(tables);
  return {
    columns: layout.columns,
    rows: layout.rows,
    pages: [tables],
    positions: layout.positions,
  };
}

export function useFloorPages(tables: Table[]) {
  const ref = useRef<HTMLDivElement>(null);
  return { ref, ...floorView(tables) };
}
