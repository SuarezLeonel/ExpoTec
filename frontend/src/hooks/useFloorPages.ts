/**
 * Hook para la organización espacial y cálculo del plano de mesas en el salón.
 *
 * Determina columnas, filas y mapa de posiciones calculadas a partir del listado de mesas activas.
 */

import { useRef } from 'react';
import type { Table } from '../types';
import { tableLayout } from '../services/table-layout';

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
