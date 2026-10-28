import type { FloorElement, Table } from '../types';

export function floorTableSize(table: Pick<Table, 'width' | 'height'>) {
  return {
    width: Math.max(40, Math.min(table.width ?? 92, 500)),
    height: Math.max(40, Math.min(table.height ?? 92, 500)),
  };
}

type Shape = {
  kind?: FloorElement['kind'];
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  anchoredLeft?: boolean;
};
export function floorFrame(tables: Table[], elements: Shape[], placement?: Shape | null) {
  const legacy =
    tables.length > 1 &&
    !elements.length &&
    !placement &&
    tables.every((t) => t.x < 20 && t.y < 20);
  const columns = Math.ceil(Math.sqrt(tables.length * 1.3));
  const cellWidth = Math.max(92, ...tables.map((t) => floorTableSize(t).width)) + 32;
  const cellHeight = Math.max(92, ...tables.map((t) => floorTableSize(t).height)) + 32;
  const displayed = legacy
    ? [...tables]
        .sort((a, b) => a.y - b.y || a.x - b.x)
        .map((table, index) => ({
          ...table,
          x: 20 + (index % columns) * cellWidth,
          y: 20 + Math.floor(index / columns) * cellHeight,
        }))
    : tables;
  const shapes: Shape[] = [
    ...displayed.map((table) => ({
      ...table,
      ...floorTableSize(table),
    })),
    ...elements.map((element) => ({ ...element, anchoredLeft: element.kind !== 'chair' })),
    ...(placement ? [placement] : []),
  ];
  const bounds = shapes.map((shape) => {
    const angle = ((shape.rotation || 0) * Math.PI) / 180;
    const width =
      Math.abs(shape.width * Math.cos(angle)) + Math.abs(shape.height * Math.sin(angle));
    const height =
      Math.abs(shape.width * Math.sin(angle)) + Math.abs(shape.height * Math.cos(angle));
    const cx = shape.x + (shape.anchoredLeft ? shape.width * Math.cos(angle) : shape.width) / 2;
    const cy =
      shape.y + shape.height / 2 + (shape.anchoredLeft ? (shape.width * Math.sin(angle)) / 2 : 0);
    return {
      left: cx - width / 2,
      top: cy - height / 2,
      right: cx + width / 2,
      bottom: cy + height / 2,
    };
  });
  const left = (bounds.length ? Math.min(...bounds.map((b) => b.left)) : 0) - 16;
  const top = (bounds.length ? Math.min(...bounds.map((b) => b.top)) : 0) - 16;
  return {
    tables: displayed,
    left,
    top,
    width: Math.max(1, ...bounds.map((b) => b.right - left)) + 16,
    height: Math.max(1, ...bounds.map((b) => b.bottom - top)) + 16,
  };
}

export function fitFloor(
  frame: { width: number; height: number },
  viewport: { width: number; height: number },
) {
  return Math.min(
    // Keep a compact base scale even when a sparse floor has room to grow.
    0.6,
    Math.max(0.01, (viewport.width - 8) / frame.width),
    Math.max(0.01, (viewport.height - 8) / frame.height),
  );
}
