import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { Circle, Square, RectangleHorizontal, BrickWall, Trash2, X } from 'lucide-react';

export type PaletteItem = 'round' | 'square' | 'rectangular' | 'wall';
const entries = [
  { kind: 'round', name: 'Agregar mesa', icon: Circle, caption: 'Mesa redonda' },
  { kind: 'square', name: 'Mesa cuadrada', icon: Square, caption: 'Mesa cuadrada' },
  {
    kind: 'rectangular',
    name: 'Mesa rectangular',
    icon: RectangleHorizontal,
    caption: 'Mesa rectangular',
  },
  { kind: 'wall', name: 'Agregar pared', icon: BrickWall, caption: 'Pared' },
] as const;

export function floorItemSize(kind: PaletteItem) {
  return {
    width: kind === 'wall' ? 180 : kind === 'rectangular' ? 96 : 64,
    height: kind === 'wall' ? 8 : kind === 'rectangular' ? 56 : 64,
  };
}

export function floorDropPoint(
  canvas: HTMLDivElement | null,
  zoom: number,
  snap: boolean,
  x: number,
  y: number,
) {
  const rect = canvas?.getBoundingClientRect();
  const viewport = canvas?.parentElement?.getBoundingClientRect();
  if (
    !rect ||
    !viewport ||
    x < Math.max(0, rect.left, viewport.left) ||
    x > Math.min(window.innerWidth, rect.right, viewport.right) ||
    y < Math.max(0, rect.top, viewport.top) ||
    y > Math.min(window.innerHeight, rect.bottom, viewport.bottom)
  )
    return null;
  const step = snap ? 20 : 1;
  return {
    x: Math.min(200_000, Math.max(0, Math.round((x - rect.left) / zoom / step) * step)),
    y: Math.min(200_000, Math.max(0, Math.round((y - rect.top) / zoom / step) * step)),
  };
}

export function FloorPalette({
  disabled,
  canvas,
  zoom,
  snap,
  place,
  remove,
  active,
  choose,
}: {
  disabled: boolean;
  canvas: RefObject<HTMLDivElement | null>;
  zoom: number;
  snap: boolean;
  place: (kind: PaletteItem, x: number, y: number) => void;
  remove?: () => void;
  active: PaletteItem | null;
  choose: (kind: PaletteItem | null) => void;
}) {
  const drag = useRef<{
    kind: PaletteItem;
    x: number;
    y: number;
    moved: boolean;
    pointerId: number;
  } | null>(null);
  const ignoreClick = useRef(false);
  const [ghost, setGhost] = useState<{
    kind: PaletteItem;
    x: number;
    y: number;
    valid: boolean;
  } | null>(null);
  const cancel = () => {
    if (drag.current) ignoreClick.current = true;
    drag.current = null;
    setGhost(null);
  };
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancel();
    };
    window.addEventListener('keydown', escape);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('keydown', escape);
      window.removeEventListener('blur', cancel);
    };
  }, []);
  const finish = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    setGhost(null);
    if (!current.moved || disabled) return;
    ignoreClick.current = true;
    const point = floorDropPoint(canvas.current, zoom, snap, event.clientX, event.clientY);
    choose(null);
    if (point) place(current.kind, point.x, point.y);
  };
  const entry = entries.find((entry) => entry.kind === ghost?.kind);
  return (
    <>
      <aside className="editor-tools editor-palette editor-toolstrip" aria-label="Herramientas">
        <strong>Herramientas</strong>
        <p className="palette-hint" role="status">
          {disabled
            ? 'Volvé a editar para modificar el plano.'
            : active
              ? `Tocá el plano para colocar: ${entries.find((item) => item.kind === active)!.caption.toLocaleLowerCase()}.`
              : 'Arrastrá un icono al plano o tocá uno para ubicarlo.'}
        </p>
        <div className="palette-icons">
          {entries.map(({ kind, name, icon: Icon, caption }) => (
            <button
              key={kind}
              type="button"
              disabled={disabled}
              aria-label={name}
              aria-pressed={active === kind}
              title={`${caption}: arrastrá o tocá para ubicar`}
              className="palette-icon palette-draggable"
              onClick={(event) => {
                if (ignoreClick.current && event.detail !== 0) {
                  ignoreClick.current = false;
                  return;
                }
                ignoreClick.current = false;
                if (event.detail === 0)
                  canvas.current?.parentElement?.scrollIntoView({
                    block: 'nearest',
                    inline: 'nearest',
                    behavior: 'instant',
                  });
                choose(active === kind ? null : kind);
              }}
              onPointerDown={(event) => {
                if (disabled || event.button !== 0 || !event.isPrimary || drag.current) return;
                ignoreClick.current = false;
                event.currentTarget.setPointerCapture(event.pointerId);
                drag.current = {
                  kind,
                  x: event.clientX,
                  y: event.clientY,
                  moved: false,
                  pointerId: event.pointerId,
                };
              }}
              onPointerMove={(event) => {
                const current = drag.current;
                if (!current || current.pointerId !== event.pointerId) return;
                if (Math.hypot(event.clientX - current.x, event.clientY - current.y) > 5)
                  current.moved = true;
                if (!current.moved) return;
                const point = floorDropPoint(
                  canvas.current,
                  zoom,
                  snap,
                  event.clientX,
                  event.clientY,
                );
                const rect = canvas.current?.getBoundingClientRect();
                setGhost({
                  kind: current.kind,
                  x: point && rect ? rect.left + point.x * zoom : event.clientX,
                  y: point && rect ? rect.top + point.y * zoom : event.clientY,
                  valid: Boolean(point),
                });
              }}
              onPointerUp={finish}
              onPointerCancel={cancel}
              onLostPointerCapture={() => {
                if (drag.current) cancel();
              }}
            >
              <Icon size={28} aria-hidden="true" />
              <span>{caption}</span>
            </button>
          ))}
          {active && (
            <button
              type="button"
              className="palette-icon"
              aria-label="Cancelar colocación"
              title="Cancelar colocación (Escape)"
              onClick={() => choose(null)}
            >
              <X size={23} />
              <span>Cancelar</span>
            </button>
          )}
          <button
            type="button"
            className="palette-icon editor-delete"
            title={remove ? 'Eliminar seleccionado' : 'Seleccioná un objeto para eliminarlo'}
            aria-label="Eliminar seleccionado"
            disabled={disabled || !remove}
            onClick={remove}
          >
            <Trash2 size={23} />
            <span>Eliminar</span>
          </button>
        </div>
      </aside>
      {ghost && entry && (
        <div
          className={`palette-ghost ${ghost.valid ? 'floor-placement-shape ' + ghost.kind : 'invalid'}`}
          aria-hidden="true"
          style={{
            left: ghost.x,
            top: ghost.y,
            ...(ghost.valid
              ? {
                  width: floorItemSize(ghost.kind).width * zoom,
                  height: floorItemSize(ghost.kind).height * zoom,
                }
              : {}),
          }}
        >
          {!ghost.valid && <entry.icon size={28} />}
        </div>
      )}
    </>
  );
}
