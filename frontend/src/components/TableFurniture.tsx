import type { CSSProperties, ReactNode } from 'react';
import type { Table } from '../types';

type TableFurnitureProps = {
  shape?: Table['shape'];
  width: number;
  height: number;
  capacity: number;
  children?: ReactNode;
};

type Seat = { x: number; y: number; side: 'top' | 'right' | 'bottom' | 'left' };

export function tableSeats(
  shape: Table['shape'],
  width: number,
  height: number,
  capacity: number,
): Seat[] {
  const count = Math.max(1, Math.min(50, Math.floor(capacity || 1)));
  const boardWidth =
    (shape === 'round' || shape === 'square' ? Math.min(width, height) : width) * 0.64;
  const boardHeight =
    (shape === 'round' || shape === 'square' ? Math.min(width, height) : height) * 0.64;
  if (shape === 'round') {
    return Array.from({ length: count }, (_, index) => {
      const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
      return {
        x: 50 + (Math.cos(angle) * (boardWidth / 2 + 10) * 100) / width,
        y: 50 + (Math.sin(angle) * (boardHeight / 2 + 10) * 100) / height,
        side:
          Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle))
            ? Math.cos(angle) > 0
              ? 'right'
              : 'left'
            : Math.sin(angle) > 0
              ? 'bottom'
              : 'top',
      };
    });
  }

  const pairs = Math.floor(count / 2);
  const horizontalPairs = Math.round((pairs * boardWidth) / (boardWidth + boardHeight));
  const horizontalSeats = horizontalPairs * 2;
  const verticalSeats = (pairs - horizontalPairs) * 2;
  const boardLeft = (width - boardWidth) / 2;
  const boardTop = (height - boardHeight) / 2;
  const sideCounts = [
    horizontalSeats / 2,
    verticalSeats / 2,
    horizontalSeats / 2,
    verticalSeats / 2,
  ];
  const sides: Seat['side'][] = ['top', 'right', 'bottom', 'left'];
  const result: Seat[] = [];
  sides.forEach((side, sideIndex) => {
    const sideCount = sideCounts[sideIndex];
    for (let index = 0; index < sideCount; index++) {
      const position = (index + 1) / (sideCount + 1);
      result.push({
        x:
          side === 'left'
            ? (boardLeft / width) * 100
            : side === 'right'
              ? ((boardLeft + boardWidth) / width) * 100
              : ((boardLeft + position * boardWidth) / width) * 100,
        y:
          side === 'top'
            ? (boardTop / height) * 100
            : side === 'bottom'
              ? ((boardTop + boardHeight) / height) * 100
              : ((boardTop + position * boardHeight) / height) * 100,
        side,
      });
    }
  });
  if (count % 2) {
    result.push({ x: 50, y: (boardTop / height) * 100, side: 'top' });
  }
  return result;
}

export function TableFurniture({
  shape = 'round',
  width,
  height,
  capacity,
  children,
}: TableFurnitureProps) {
  const seats = tableSeats(shape, width, height, capacity);
  const boardWidth =
    (shape === 'round' || shape === 'square' ? Math.min(width, height) : width) * 0.64;
  const boardHeight =
    (shape === 'round' || shape === 'square' ? Math.min(width, height) : height) * 0.64;
  return (
    <span className={`table-furniture ${shape}`} aria-hidden="true">
      {seats.map((seat, index) => (
        <i
          key={index}
          className={`table-chair ${seat.side}`}
          style={{ left: `${seat.x}%`, top: `${seat.y}%` } as CSSProperties}
        />
      ))}
      <span
        className="table-board"
        style={{
          width: `${(boardWidth / width) * 100}%`,
          height: `${(boardHeight / height) * 100}%`,
          left: '50%',
          top: '50%',
          right: 'auto',
          bottom: 'auto',
          transform: 'translate(-50%, -50%)',
        }}
      >
        {children}
      </span>
    </span>
  );
}
