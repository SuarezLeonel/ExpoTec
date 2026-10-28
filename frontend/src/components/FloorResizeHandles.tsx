import { useId, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import type { ResizeHandle } from '../services/floor-resize';

type FloorResizeHandlesProps = {
  item: { x: number; y: number; width: number; height: number; rotation: number };
  anchoredLeft?: boolean;
  preserveAspectRatio?: boolean;
  zoom: number;
  disabled?: boolean;
  begin: (event: PointerEvent<HTMLButtonElement>, handle: ResizeHandle) => void;
  nudge: (handle: ResizeHandle, delta: { x: number; y: number }) => void;
  cancel: () => void;
};

const handles: { handle: ResizeHandle; label: string }[] = [
  { handle: 'nw', label: 'esquina superior izquierda' },
  { handle: 'n', label: 'borde superior' },
  { handle: 'ne', label: 'esquina superior derecha' },
  { handle: 'e', label: 'borde derecho' },
  { handle: 'se', label: 'esquina inferior derecha' },
  { handle: 's', label: 'borde inferior' },
  { handle: 'sw', label: 'esquina inferior izquierda' },
  { handle: 'w', label: 'borde izquierdo' },
];

const handleAngles: Record<ResizeHandle, number> = {
  nw: 45,
  n: 90,
  ne: 135,
  e: 0,
  se: 45,
  s: 90,
  sw: 135,
  w: 0,
};
const resizeCursors = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'] as const;

export function FloorResizeHandles({
  item,
  anchoredLeft = false,
  preserveAspectRatio = false,
  zoom,
  disabled = false,
  begin,
  nudge,
  cancel,
}: FloorResizeHandlesProps) {
  const hintId = useId();
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const style = {
    left: item.x,
    top: item.y,
    width: item.width,
    height: item.height,
    transform: `rotate(${item.rotation}deg)`,
    transformOrigin: anchoredLeft ? 'left center' : 'center',
    '--floor-resize-target': `${20 / safeZoom}px`,
    '--floor-resize-grip': `${8 / safeZoom}px`,
    '--floor-resize-line': `${1 / safeZoom}px`,
  } as CSSProperties;

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, handle: ResizeHandle) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancel();
      return;
    }
    const step = event.shiftKey ? 20 : 10;
    const deltas: Record<string, { x: number; y: number }> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    const delta = deltas[event.key];
    if (!delta) return;
    event.preventDefault();
    event.stopPropagation();
    nudge(handle, delta);
  }

  return (
    <div className="floor-resize-selection" style={style} role="group" aria-label="Cambiar tamaño">
      <span id={hintId} className="visually-hidden">
        {preserveAspectRatio
          ? 'Arrastrá las esquinas para cambiar el tamaño manteniendo la proporción. '
          : 'Arrastrá las esquinas o los bordes para cambiar el tamaño. '}
        Usá las flechas para ajustar, Shift para pasos mayores y Escape para cancelar.
      </span>
      {handles
        .filter(({ handle }) => !preserveAspectRatio || handle.length === 2)
        .map(({ handle, label }) => (
          <button
            key={handle}
            type="button"
            className={`floor-resize-handle ${handle.length === 1 ? 'floor-resize-edge' : 'floor-resize-corner'}`}
            data-handle={handle}
            style={{
              cursor: disabled
                ? 'default'
                : resizeCursors[
                    ((Math.round((handleAngles[handle] + item.rotation) / 45) % 4) + 4) % 4
                  ],
            }}
            aria-label={`Cambiar tamaño desde ${label}`}
            aria-describedby={hintId}
            disabled={disabled}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              event.currentTarget.focus({ preventScroll: true });
              begin(event, handle);
            }}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => onKeyDown(event, handle)}
          />
        ))}
    </div>
  );
}
