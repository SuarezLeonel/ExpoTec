import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { Check, Eye, Grid2X2, Minus, Plus, Redo2, RotateCw, Save, Undo2 } from 'lucide-react';
import { Confirm } from '../components/UI';
import { useStore } from '../contexts/Store';
import { FloorResizeHandles } from '../components/FloorResizeHandles';
import { TableFurniture } from '../components/TableFurniture';
import {
  FloorPalette,
  floorDropPoint,
  floorItemSize,
  type PaletteItem,
} from '../components/FloorPalette';
import { resizeFloorItem, type ResizeHandle } from '../services/floor-resize';
import type { FloorElement, FloorLayout, Table } from '../types';

const normalizeSector = (value?: string): 'Salón' | 'Patio' =>
  value?.toLocaleLowerCase() === 'patio' ? 'Patio' : 'Salón';
const initialLayout = (state: ReturnType<typeof useStore>['state']): FloorLayout => {
  const saved = state?.floorPlanDraft?.draft ??
    state?.floorPlan?.published ?? {
      tables: (state?.tables ?? []).map((table) => ({
        ...table,
        shape: table.shape ?? 'round',
        width: table.width ?? 92,
        height: table.height ?? 92,
        rotation: table.rotation ?? 0,
      })),
      elements: [],
    };
  return {
    tables: saved.tables.map((table) => ({
      ...table,
      sector: normalizeSector(table.sector),
    })),
    elements: saved.elements.map((element) => ({
      ...element,
      sector: normalizeSector(element.sector),
    })),
  };
};

export function FloorPlanEditor() {
  const { state, command, refresh } = useStore();
  const [layout, setLayout] = useState<FloorLayout>(() => initialLayout(state));
  const [activeSector, setActiveSector] = useState<'Salón' | 'Patio'>('Salón');
  const [undoStack, setUndoStack] = useState<FloorLayout[]>([]);
  const [redoStack, setRedoStack] = useState<FloorLayout[]>([]);
  const [selected, setSelected] = useState('');
  const [placing, setPlacing] = useState<PaletteItem | null>(null);
  const [placementPoint, setPlacementPoint] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [zoom, setZoom] = useState(0.8);
  const [showGrid, setShowGrid] = useState(true);
  const [snap, setSnap] = useState(true);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [tableContextMenu, setTableContextMenu] = useState<{
    tableId: string;
    x: number;
    y: number;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [revision, setRevision] = useState(state?.floorPlanDraft?.draft_revision ?? 1);
  const [version, setVersion] = useState(
    state?.floorPlanDraft?.version ?? state?.floorPlan?.version ?? 1,
  );
  const hadState = useRef(Boolean(state));
  useEffect(() => {
    if (state && !hadState.current) {
      setLayout(initialLayout(state));
      setRevision(state.floorPlanDraft?.draft_revision ?? 1);
      setVersion(state.floorPlanDraft?.version ?? state.floorPlan?.version ?? 1);
    }
    hadState.current = Boolean(state);
  }, [state]);
  const canvas = useRef<HTMLDivElement>(null);
  const ignorePlacementClick = useRef(false);
  const drag = useRef<{
    id: string;
    startX: number;
    startY: number;
    origin: FloorLayout;
    changed: boolean;
  } | null>(null);
  const resizing = useRef<{
    id: string;
    handle: ResizeHandle;
    startX: number;
    startY: number;
    zoom: number;
    origin: FloorLayout;
    changed: boolean;
    target: HTMLButtonElement;
    pointerId: number;
  } | null>(null);
  const selectedTable = layout.tables.find(
    (table) => `table:${table.id}` === selected && table.sector === activeSector && table.active,
  );
  const selectedElement = layout.elements.find(
    (element) => `element:${element.id}` === selected && element.sector === activeSector,
  );
  const visibleTables = layout.tables.filter((table) => table.sector === activeSector);
  const visibleElements = layout.elements.filter((element) => element.sector === activeSector);
  const isDirty = useMemo(
    () => JSON.stringify(layout) !== JSON.stringify(initialLayout(state)),
    [layout, state],
  );
  const pushLayout = (next: FloorLayout) => {
    setUndoStack((stack) => [...stack.slice(-49), layout]);
    setRedoStack([]);
    setLayout(next);
  };
  const point = (event: PointerEvent) => {
    const rect = canvas.current!.getBoundingClientRect();
    const rawX = Math.max(0, (event.clientX - rect.left) / zoom);
    const rawY = Math.max(0, (event.clientY - rect.top) / zoom);
    return snap
      ? { x: Math.round(rawX / 20) * 20, y: Math.round(rawY / 20) * 20 }
      : { x: Math.round(rawX), y: Math.round(rawY) };
  };
  const setTable = (id: string, update: Partial<FloorLayout['tables'][number]>) => {
    pushLayout({
      ...layout,
      tables: layout.tables.map((table) => (table.id === id ? { ...table, ...update } : table)),
    });
  };
  const setElement = (id: string, update: Partial<FloorElement>) => {
    pushLayout({
      ...layout,
      elements: layout.elements.map((element) =>
        element.id === id ? { ...element, ...update } : element,
      ),
    });
  };
  const resizeLayout = (
    origin: FloorLayout,
    id: string,
    handle: ResizeHandle,
    delta: { x: number; y: number },
    step: number,
  ) => {
    const table = id.startsWith('table:');
    const item = table
      ? origin.tables.find((item) => `table:${item.id}` === id)
      : origin.elements.find((item) => `element:${item.id}` === id);
    if (!item) return origin;
    const bounds = resizeFloorItem(item, handle, delta, {
      step,
      anchoredLeft: !table,
      preserveAspectRatio: table && 'shape' in item && item.shape !== 'rectangular',
      minWidth: table ? 40 : 10,
      minHeight: table ? 40 : 4,
      maxWidth: table ? 500 : 2000,
      maxHeight: table ? 500 : 1000,
    });
    return {
      ...origin,
      tables: origin.tables.map((item) =>
        `table:${item.id}` === id ? { ...item, ...bounds } : item,
      ),
      elements: origin.elements.map((item) =>
        `element:${item.id}` === id ? { ...item, ...bounds } : item,
      ),
    };
  };
  const cancelGesture = () => {
    const current = resizing.current;
    resizing.current = null;
    if (current) {
      setLayout(current.origin);
      if (current.target.hasPointerCapture(current.pointerId))
        current.target.releasePointerCapture(current.pointerId);
    }
    if (drag.current) setLayout(drag.current.origin);
    drag.current = null;
  };
  const beginResize = (event: PointerEvent<HTMLButtonElement>, handle: ResizeHandle) => {
    if (preview || busy || placing || event.button !== 0 || resizing.current) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    setTableContextMenu(null);
    resizing.current = {
      id: selected,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      zoom,
      origin: layout,
      changed: false,
      target: event.currentTarget,
      pointerId: event.pointerId,
    };
  };
  const nudgeResize = (handle: ResizeHandle, delta: { x: number; y: number }) => {
    const item = selectedTable || selectedElement;
    if (!item || preview || busy || resizing.current) return;
    const angle = (item.rotation * Math.PI) / 180;
    const next = resizeLayout(
      layout,
      selected,
      handle,
      {
        x: delta.x * Math.cos(angle) - delta.y * Math.sin(angle),
        y: delta.x * Math.sin(angle) + delta.y * Math.cos(angle),
      },
      1,
    );
    if (JSON.stringify(next) !== JSON.stringify(layout)) pushLayout(next);
  };
  const addTable = (x = 120, y = 120, shape: NonNullable<Table['shape']> = 'round') => {
    const id = crypto.randomUUID();
    const used = new Set(layout.tables.map((table) => table.label.toLocaleLowerCase()));
    let index = 1;
    while (used.has(String(index))) index++;
    const table = {
      id,
      label: String(index),
      capacity: 4,
      sector: activeSector,
      x,
      y,
      shape,
      width: shape === 'rectangular' ? 96 : 64,
      height: shape === 'rectangular' ? 56 : 64,
      rotation: 0,
      active: true,
    };
    pushLayout({ ...layout, tables: [...layout.tables, table] });
    setSelected(`table:${id}`);
  };
  const addElement = (kind: Extract<PaletteItem, FloorElement['kind']>, x: number, y: number) => {
    const id = crypto.randomUUID();
    const element: FloorElement = {
      id,
      kind,
      sector: activeSector,
      x,
      y,
      ...floorItemSize(kind),
      rotation: 0,
    };
    pushLayout({ ...layout, elements: [...layout.elements, element] });
    setSelected(`element:${id}`);
  };
  const placeItem = (kind: PaletteItem, x: number, y: number) => {
    if (preview || busy) return;
    if (kind === 'round' || kind === 'square' || kind === 'rectangular') addTable(x, y, kind);
    else addElement(kind, x, y);
    setPlacing(null);
    setPlacementPoint(null);
  };
  const choosePlacement = (kind: PaletteItem | null) => {
    setPlacing(kind);
    setSelected('');
    setTableContextMenu(null);
    const rect = canvas.current?.parentElement?.getBoundingClientRect();
    setPlacementPoint(
      kind && rect
        ? floorDropPoint(
            canvas.current,
            zoom,
            snap,
            (Math.max(0, rect.left) + Math.min(window.innerWidth, rect.right)) / 2,
            (Math.max(0, rect.top) + Math.min(window.innerHeight, rect.bottom)) / 2,
          )
        : null,
    );
    if (kind) canvas.current?.focus({ preventScroll: true });
  };
  const saveDraft = async () => {
    choosePlacement(null);
    setBusy(true);
    setMessage('');
    try {
      const result = (await command('floor-plan.draft.save', {
        expected_revision: revision,
        layout,
      })) as { draft_revision: number; version: number };
      setRevision(result.draft_revision);
      setVersion(result.version);
      setMessage('Borrador guardado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar el borrador.');
    } finally {
      setBusy(false);
    }
  };
  const publish = async () => {
    choosePlacement(null);
    setBusy(true);
    setMessage('');
    try {
      let currentRevision = revision;
      if (isDirty) {
        const saved = (await command('floor-plan.draft.save', {
          expected_revision: revision,
          layout,
        })) as { draft_revision: number; version: number };
        currentRevision = saved.draft_revision;
        setRevision(saved.draft_revision);
        setVersion(saved.version);
      }
      const result = (await command('floor-plan.publish', {
        expected_revision: currentRevision,
        expected_version: version,
      })) as { draft_revision: number; version: number };
      await refresh();
      setRevision(result.draft_revision);
      setVersion(result.version);
      setMessage(`Plano publicado · versión ${result.version}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo publicar el plano.');
    } finally {
      setBusy(false);
    }
  };
  const onCanvasDown = (event: PointerEvent<HTMLDivElement>) => {
    if (preview || busy || event.target !== canvas.current) return;
    setSelected('');
  };
  const onCanvasMove = (event: PointerEvent<HTMLDivElement>) => {
    if (placing) {
      setPlacementPoint(floorDropPoint(canvas.current, zoom, snap, event.clientX, event.clientY));
      return;
    }
    if (resizing.current) {
      const current = resizing.current;
      if (current.pointerId !== event.pointerId) return;
      const next = resizeLayout(
        current.origin,
        current.id,
        current.handle,
        {
          x: (event.clientX - current.startX) / current.zoom,
          y: (event.clientY - current.startY) / current.zoom,
        },
        snap ? 20 : 1,
      );
      current.changed = JSON.stringify(next) !== JSON.stringify(current.origin);
      setLayout(next);
      return;
    }
    if (drag.current) {
      const pos = point(event);
      const d = drag.current;
      const dx = pos.x - d.startX;
      const dy = pos.y - d.startY;
      drag.current.changed = dx !== 0 || dy !== 0;
      setLayout({
        ...d.origin,
        tables: d.origin.tables.map((item) =>
          `table:${item.id}` === d.id
            ? {
                ...item,
                x: Math.max(0, item.x + dx),
                y: Math.max(0, item.y + dy),
              }
            : item,
        ),
        elements: d.origin.elements.map((item) =>
          `element:${item.id}` === d.id
            ? {
                ...item,
                x: Math.max(0, item.x + dx),
                y: Math.max(0, item.y + dy),
              }
            : item,
        ),
      });
    }
  };
  const onCanvasUp = (event: PointerEvent<HTMLDivElement>) => {
    if (resizing.current) {
      const current = resizing.current;
      if (current.pointerId !== event.pointerId) return;
      resizing.current = null;
      if (current.changed) {
        setUndoStack((stack) => [...stack.slice(-49), current.origin]);
        setRedoStack([]);
      }
      return;
    }
    if (drag.current) {
      const completedDrag = drag.current;
      if (completedDrag.changed) {
        setUndoStack((stack) => [...stack.slice(-49), completedDrag.origin]);
        setRedoStack([]);
      }
      drag.current = null;
    }
  };
  const beginDrag = (event: PointerEvent, id: string) => {
    if (preview || busy || placing || event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const pos = point(event);
    setSelected(id);
    drag.current = {
      id,
      startX: pos.x,
      startY: pos.y,
      origin: layout,
      changed: false,
    };
  };
  const requestDelete = (target = selected) => {
    if (!target) return;
    setDeleteTarget(target);
    setTableContextMenu(null);
  };
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    if (target.startsWith('table:'))
      pushLayout({
        ...layout,
        tables: layout.tables.filter((table) => `table:${table.id}` !== target),
      });
    else
      pushLayout({
        ...layout,
        elements: layout.elements.filter((element) => `element:${element.id}` !== target),
      });
    setSelected('');
    setDeleteTarget(null);
  };
  const duplicateTable = (tableId: string) => {
    const source = layout.tables.find((table) => table.id === tableId);
    if (!source) return;
    const usedLabels = new Set(layout.tables.map((table) => table.label.toLocaleLowerCase()));
    let index = 1;
    while (usedLabels.has(String(index))) index++;
    const copy = {
      ...source,
      id: crypto.randomUUID(),
      label: String(index),
      x: source.x + source.width + 20,
      y: source.y + source.height + 20,
      active: true,
    };
    pushLayout({ ...layout, tables: [...layout.tables, copy] });
    setSelected(`table:${copy.id}`);
    setTableContextMenu(null);
  };
  const retryLoad = async () => {
    setBusy(true);
    setMessage('');
    try {
      await refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `No se pudo cargar el estado del salón: ${error.message}`
          : 'No se pudo cargar el estado del salón. Revisá la conexión e intentá de nuevo.',
      );
    } finally {
      setBusy(false);
    }
  };
  if (!state)
    return (
      <div className="floor-editor-page">
        <section className="alert alert-warning" role="alert">
          <strong>No se pudo cargar el plano.</strong>
          <p>
            El editor no recibió los datos del salón. Reintentá la carga; si vuelve a fallar, el
            mensaje indicará el problema del servidor.
          </p>
          {message && <p className="floor-editor-load-error">{message}</p>}
          <button className="btn btn-primary" onClick={() => void retryLoad()} disabled={busy}>
            <RotateCw size={17} /> {busy ? 'Cargando…' : 'Reintentar carga'}
          </button>
        </section>
      </div>
    );
  const tableStyle = (table: FloorLayout['tables'][number]): CSSProperties =>
    ({
      left: table.x,
      top: table.y,
      width: table.width,
      height: table.height,
      transform: `rotate(${table.rotation}deg)`,
      borderRadius: table.shape === 'round' ? '50%' : table.shape === 'square' ? 10 : 12,
    }) as CSSProperties;
  const canvasWidth = Math.max(
    1200,
    ...visibleTables.map((table) => table.x + table.width + 80),
    ...visibleElements.map((element) => element.x + element.width + 80),
  );
  const canvasHeight = Math.max(
    900,
    ...visibleTables.map((table) => table.y + table.height + 80),
    ...visibleElements.map((element) => element.y + element.height + 80),
  );
  return (
    <div
      className="floor-editor-page"
      onKeyDownCapture={(event) => {
        if (event.key === 'Escape') {
          choosePlacement(null);
          cancelGesture();
        }
      }}
    >
      <div className="floor-editor-toolbar-shell">
        <div className="floor-editor-toolbar" role="toolbar" aria-label="Acciones del plano">
          <label className="editor-sector">
            Sector del plano
            <select
              className="form-select"
              value={activeSector}
              onChange={(event) => {
                setActiveSector(event.target.value as 'Salón' | 'Patio');
                choosePlacement(null);
                setSelected('');
                setTableContextMenu(null);
              }}
            >
              <option value="Salón">Salón</option>
              <option value="Patio">Patio</option>
            </select>
          </label>
          <button
            className="btn btn-outline-primary"
            disabled={!undoStack.length || busy}
            onClick={() => {
              const previous = undoStack.at(-1)!;
              setUndoStack(undoStack.slice(0, -1));
              setRedoStack([...redoStack, layout]);
              setLayout(previous);
            }}
          >
            <Undo2 size={17} /> Deshacer
          </button>
          <button
            className="btn btn-outline-primary"
            disabled={!redoStack.length || busy}
            onClick={() => {
              const next = redoStack.at(-1)!;
              setRedoStack(redoStack.slice(0, -1));
              setUndoStack([...undoStack, layout]);
              setLayout(next);
            }}
          >
            <Redo2 size={17} /> Rehacer
          </button>
          <button
            className="btn btn-outline-primary"
            aria-pressed={preview}
            onClick={() => {
              choosePlacement(null);
              setPreview(!preview);
            }}
          >
            <Eye size={17} /> {preview ? 'Editar borrador' : 'Vista previa'}
          </button>
          <button
            className="btn btn-outline-primary"
            aria-pressed={showGrid}
            onClick={() => setShowGrid(!showGrid)}
          >
            <Grid2X2 size={17} /> Cuadrícula
          </button>
          <label className="editor-snap">
            <input
              type="checkbox"
              checked={snap}
              onChange={(event) => setSnap(event.target.checked)}
            />{' '}
            Ajustar a cuadrícula
          </label>
          <span className="editor-zoom">
            <button
              className="icon-button"
              aria-label="Alejar"
              disabled={zoom <= 0.5}
              onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}
            >
              <Minus />
            </button>
            {Math.round(zoom * 100)}%
            <button
              className="icon-button"
              aria-label="Acercar"
              disabled={zoom >= 1.5}
              onClick={() => setZoom(Math.min(1.5, zoom + 0.1))}
            >
              <Plus />
            </button>
          </span>
          <button className="btn btn-primary" disabled={busy} onClick={() => void publish()}>
            <Check size={17} /> Publicar plano
          </button>
          <button
            className="btn btn-outline-primary"
            disabled={busy || !isDirty}
            onClick={() => void saveDraft()}
          >
            <Save size={17} /> Guardar borrador
          </button>
        </div>
        <FloorPalette
          disabled={preview || busy}
          canvas={canvas}
          zoom={zoom}
          snap={snap}
          active={placing}
          choose={choosePlacement}
          remove={selectedTable || selectedElement ? () => requestDelete() : undefined}
          place={placeItem}
        />
      </div>
      {message && (
        <div
          className={
            message.includes('No se pudo') ||
            message.includes('cambió') ||
            message.includes('conflicto')
              ? 'alert alert-danger'
              : 'alert alert-success'
          }
          role="status"
        >
          {message}
        </div>
      )}
      <div className="floor-editor-grid">
        <div className="editor-canvas-viewport">
          <div
            ref={canvas}
            tabIndex={0}
            role="region"
            aria-label="Plano del salón"
            onKeyDown={(event) => {
              if (
                event.target !== event.currentTarget ||
                !placing ||
                preview ||
                busy ||
                !placementPoint
              )
                return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                placeItem(placing, placementPoint.x, placementPoint.y);
              } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
                event.preventDefault();
                const step = snap ? 20 : event.shiftKey ? 10 : 1;
                setPlacementPoint({
                  x: Math.min(
                    200_000,
                    Math.max(
                      0,
                      placementPoint.x +
                        (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0),
                    ),
                  ),
                  y: Math.min(
                    200_000,
                    Math.max(
                      0,
                      placementPoint.y +
                        (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0),
                    ),
                  ),
                });
              }
            }}
            className={`editor-canvas ${showGrid ? 'grid-on' : ''}`}
            style={{
              zoom,
              width: canvasWidth,
              height: canvasHeight,
              cursor: placing ? 'crosshair' : undefined,
            }}
            onPointerDownCapture={(event) => {
              ignorePlacementClick.current = false;
              if (!placing || preview || busy || event.button !== 0 || !event.isPrimary) return;
              const pos = floorDropPoint(canvas.current, zoom, snap, event.clientX, event.clientY);
              if (!pos) return;
              event.preventDefault();
              event.stopPropagation();
              ignorePlacementClick.current = true;
              placeItem(placing, pos.x, pos.y);
            }}
            onClickCapture={(event) => {
              if (ignorePlacementClick.current) {
                ignorePlacementClick.current = false;
                event.stopPropagation();
              }
            }}
            onPointerDown={onCanvasDown}
            onPointerMove={onCanvasMove}
            onPointerUp={onCanvasUp}
            onPointerCancel={cancelGesture}
            onLostPointerCapture={cancelGesture}
          >
            {placing && placementPoint && (
              <div
                aria-hidden="true"
                className={`floor-placement-shape floor-placement-preview ${placing}`}
                style={{
                  left: placementPoint.x,
                  top: placementPoint.y,
                  ...floorItemSize(placing),
                }}
              />
            )}
            {visibleElements.map((element) => (
              <div
                key={element.id}
                className={`plan-architect ${element.kind} ${selected === `element:${element.id}` ? 'selected' : ''}`}
                style={{
                  left: element.x,
                  top: element.y,
                  width: element.width,
                  height: element.height,
                  transform: `rotate(${element.rotation}deg)`,
                }}
                onPointerDown={(event) => beginDrag(event, `element:${element.id}`)}
                role="button"
                tabIndex={0}
                aria-label={element.kind === 'chair' ? 'Silla' : element.kind}
                onClick={() => setSelected(`element:${element.id}`)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelected(`element:${element.id}`);
                  }
                }}
              />
            ))}
            {visibleTables
              .filter((table) => table.active)
              .map((table) => {
                const accounts =
                  state?.accounts.filter(
                    (account) =>
                      account.table_id === table.id &&
                      ['open', 'requested'].includes(account.status),
                  ) ?? [];
                const status = accounts.some((account) => account.status === 'requested')
                  ? 'requested'
                  : accounts.length
                    ? 'occupied'
                    : 'available';
                return (
                  <div
                    key={table.id}
                    className={`plan-table ${status} ${selected === `table:${table.id}` ? 'selected' : ''} ${table.shape}`}
                    style={tableStyle(table)}
                    onPointerDown={(event) => beginDrag(event, `table:${table.id}`)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (preview) return;
                      setSelected(`table:${table.id}`);
                      setTableContextMenu({
                        tableId: table.id,
                        x: Math.max(8, Math.min(event.clientX, window.innerWidth - 190)),
                        y: Math.max(8, Math.min(event.clientY, window.innerHeight - 112)),
                      });
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`Mesa ${table.label}`}
                    onClick={() => setSelected(`table:${table.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelected(`table:${table.id}`);
                      }
                    }}
                  >
                    <TableFurniture
                      shape={table.shape}
                      width={table.width}
                      height={table.height}
                      capacity={table.capacity}
                    >
                      <strong>{table.label}</strong>
                    </TableFurniture>
                  </div>
                );
              })}
            {!preview &&
              !placing &&
              (selectedTable || selectedElement) &&
              selectedElement?.kind !== 'chair' && (
                <FloorResizeHandles
                  item={(selectedTable || selectedElement)!}
                  anchoredLeft={Boolean(selectedElement)}
                  preserveAspectRatio={Boolean(
                    selectedTable && selectedTable.shape !== 'rectangular',
                  )}
                  zoom={zoom}
                  disabled={busy}
                  begin={beginResize}
                  nudge={nudgeResize}
                  cancel={cancelGesture}
                />
              )}
          </div>
        </div>
        {tableContextMenu && (
          <div
            className="floor-context-dismiss"
            onClick={() => setTableContextMenu(null)}
            onContextMenu={(event) => {
              event.preventDefault();
              setTableContextMenu(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setTableContextMenu(null);
            }}
          >
            <div
              className="floor-context-menu"
              role="menu"
              aria-label="Acciones de la mesa"
              style={{ left: tableContextMenu.x, top: tableContextMenu.y }}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                role="menuitem"
                autoFocus
                onClick={() => duplicateTable(tableContextMenu.tableId)}
              >
                Duplicar mesa
              </button>
              <button
                type="button"
                role="menuitem"
                className="danger"
                onClick={() => requestDelete(`table:${tableContextMenu.tableId}`)}
              >
                Eliminar mesa
              </button>
            </div>
          </div>
        )}
        <aside className="editor-properties">
          <strong>Propiedades</strong>
          {selectedTable ? (
            <>
              <label>
                Identificador
                <input
                  className="form-control"
                  value={selectedTable.label}
                  onChange={(event) => setTable(selectedTable.id, { label: event.target.value })}
                />
              </label>
              <label>
                Forma
                <select
                  className="form-select"
                  value={selectedTable.shape}
                  onChange={(event) => {
                    const shape = event.target.value as Table['shape'];
                    const largestSide = Math.max(selectedTable.width, selectedTable.height);
                    setTable(selectedTable.id, {
                      shape,
                      ...(shape === 'rectangular' && selectedTable.width === selectedTable.height
                        ? { width: 96, height: 56 }
                        : {}),
                      ...(shape === 'square' || shape === 'round'
                        ? { width: largestSide, height: largestSide }
                        : {}),
                    });
                  }}
                >
                  <option value="round">Redonda</option>
                  <option value="square">Cuadrada</option>
                  <option value="rectangular">Rectangular</option>
                </select>
              </label>
              <label>
                Capacidad
                <input
                  className="form-control"
                  type="number"
                  min="1"
                  max="50"
                  value={selectedTable.capacity}
                  onChange={(event) =>
                    setTable(selectedTable.id, {
                      capacity: Math.min(50, Math.max(1, Number(event.target.value))),
                    })
                  }
                />
              </label>
              <label>
                Sector
                <select
                  className="form-select"
                  value={selectedTable.sector}
                  onChange={(event) => {
                    const sector = event.target.value as 'Salón' | 'Patio';
                    setTable(selectedTable.id, { sector });
                    setActiveSector(sector);
                  }}
                >
                  <option value="Salón">Salón</option>
                  <option value="Patio">Patio</option>
                </select>
              </label>
              <div className="editor-property-pair">
                <label>
                  X
                  <input
                    className="form-control"
                    type="number"
                    value={selectedTable.x}
                    onChange={(event) =>
                      setTable(selectedTable.id, {
                        x: Math.max(0, Number(event.target.value)),
                      })
                    }
                  />
                </label>
                <label>
                  Y
                  <input
                    className="form-control"
                    type="number"
                    value={selectedTable.y}
                    onChange={(event) =>
                      setTable(selectedTable.id, {
                        y: Math.max(0, Number(event.target.value)),
                      })
                    }
                  />
                </label>
              </div>
              <p className="editor-resize-hint">
                {selectedTable.shape === 'rectangular'
                  ? 'Arrastrá las esquinas o los bordes para cambiar el tamaño.'
                  : 'Arrastrá las esquinas para cambiar el tamaño manteniendo la proporción.'}
              </p>
              <label>
                Rotación
                <input
                  className="form-control"
                  type="number"
                  min="0"
                  max="359"
                  value={selectedTable.rotation}
                  onChange={(event) =>
                    setTable(selectedTable.id, {
                      rotation: (Number(event.target.value) + 360) % 360,
                    })
                  }
                />
              </label>
              <label className="editor-active">
                <input
                  type="checkbox"
                  checked={selectedTable.active}
                  onChange={(event) => setTable(selectedTable.id, { active: event.target.checked })}
                />{' '}
                Disponible
              </label>
              <button
                className="btn btn-outline-primary"
                onClick={() =>
                  setTable(selectedTable.id, {
                    rotation: (selectedTable.rotation + 90) % 360,
                  })
                }
              >
                <RotateCw size={16} /> Rotar 90°
              </button>
            </>
          ) : selectedElement ? (
            <>
              <p>
                {selectedElement.kind === 'chair'
                  ? 'Silla'
                  : selectedElement.kind === 'wall'
                    ? 'Pared'
                    : selectedElement.kind === 'door'
                      ? 'Puerta'
                      : 'Separador'}
              </p>
              <div className="editor-property-pair">
                <label>
                  X
                  <input
                    className="form-control"
                    type="number"
                    value={selectedElement.x}
                    onChange={(event) =>
                      setElement(selectedElement.id, {
                        x: Math.max(0, Number(event.target.value)),
                      })
                    }
                  />
                </label>
                <label>
                  Y
                  <input
                    className="form-control"
                    type="number"
                    value={selectedElement.y}
                    onChange={(event) =>
                      setElement(selectedElement.id, {
                        y: Math.max(0, Number(event.target.value)),
                      })
                    }
                  />
                </label>
              </div>
              <p className="editor-resize-hint">
                {selectedElement.kind === 'chair'
                  ? 'Arrastrá la silla para ubicarla alrededor de una mesa.'
                  : 'Arrastrá las esquinas o los bordes para cambiar el tamaño.'}
              </p>
              <label>
                Orientación
                <input
                  className="form-control"
                  type="number"
                  min="0"
                  max="359"
                  value={selectedElement.rotation}
                  onChange={(event) =>
                    setElement(selectedElement.id, {
                      rotation: (Number(event.target.value) + 360) % 360,
                    })
                  }
                />
              </label>
              {selectedElement.kind === 'chair' && (
                <button
                  className="btn btn-outline-primary"
                  onClick={() =>
                    setElement(selectedElement.id, {
                      rotation: (selectedElement.rotation + 90) % 360,
                    })
                  }
                >
                  <RotateCw size={16} /> Rotar 90°
                </button>
              )}
            </>
          ) : (
            <p className="text-secondary">Seleccioná una mesa o elemento del plano.</p>
          )}
        </aside>
      </div>
      {deleteTarget && (
        <Confirm
          title={deleteTarget.startsWith('table:') ? '¿Eliminar mesa?' : '¿Eliminar elemento?'}
          text="¿Estás seguro? Se quitará del borrador del plano y el cambio se aplicará al publicarlo."
          proceed={confirmDelete}
          close={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
