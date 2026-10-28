import type { CSSProperties } from 'react';
import { Link2 } from 'lucide-react';
import { useStore } from '../contexts/Store';
import { money } from '../services/api';
import type { Table } from '../types';
import { floorFrame, floorTableSize } from '../services/floor-frame';
import { useFloorViewport } from '../hooks/useFloorViewport';
import { TableFurniture } from './TableFurniture';

export interface PlacementDraft {
  label: string;
  capacity: number;
  sector: string;
  shape: NonNullable<Table['shape']>;
  width: number;
  height: number;
  rotation: number;
  active: boolean;
  x: number;
  y: number;
}

export function TableMap({
  tables,
  selected,
  view,
  sector,
  select,
  highlighted,
  zoom = 1,
  placementDraft,
  movePlacement,
}: {
  tables: Table[];
  selected: string;
  view: string;
  sector?: string;
  select: (id: string) => void;
  highlighted?: Set<string>;
  zoom?: number;
  placementDraft?: PlacementDraft | null;
  movePlacement?: (x: number, y: number) => void;
}) {
  const { state, terminal, operator } = useStore();
  const viewport = useFloorViewport(view);
  if (!state) return null;
  const elements = (state.floorPlan?.published?.elements ?? []).filter(
    (element) => !sector || (element.sector ?? 'Salón') === sector,
  );
  const frame = floorFrame(tables, elements, placementDraft);
  const displayedTables = view === 'plan' ? frame.tables : tables;
  const tableSize = floorTableSize;

  // Frame specifically around the tables and architectural elements of this sector
  const hasItems = displayedTables.length > 0 || elements.length > 0 || Boolean(placementDraft);
  const PADDING = 36;
  const floorCanvas = hasItems
    ? {
        ...frame,
        left: frame.left - PADDING,
        top: frame.top - PADDING,
        width: Math.max(160, frame.width + PADDING * 2),
        height: Math.max(120, frame.height + PADDING * 2),
      }
    : {
        tables: displayedTables,
        left: 0,
        top: 0,
        width: 800,
        height: 600,
      };

  const isMeasured = viewport.size.width > 50 && viewport.size.height > 50;
  const availWidth = isMeasured ? viewport.size.width - 24 : 800;
  const availHeight = isMeasured ? viewport.size.height - 24 : 600;
  const fitX = availWidth / floorCanvas.width;
  const fitY = availHeight / floorCanvas.height;
  const autoFit = Math.min(fitX, fitY);
  // Cap at 1.35 so a small set of tables doesn't become cartoonishly huge,
  // while allowing existing tables to frame and zoom comfortably to fill the viewport
  const baseScale = Math.min(1.35, Math.max(0.2, autoFit));
  const scale = baseScale * zoom;
  const planWidth = Math.max(floorCanvas.width, Math.max(0, floorCanvas.left) + floorCanvas.width);
  const planHeight = Math.max(
    floorCanvas.height,
    Math.max(0, floorCanvas.top) + floorCanvas.height,
  );
  const content = (
    <div
      className={view === 'plan' ? 'table-plan paged-map physical-floor' : 'table-list paged-list'}
      style={
        {
          '--floor-columns': 1,
          '--floor-rows': 1,
          ...(view === 'plan'
            ? {
                width: planWidth,
                height: planHeight,
                position: 'absolute',
                left: 0,
                top: 0,
                transform: `scale(${scale}) translate(${-floorCanvas.left}px, ${-floorCanvas.top}px)`,
                transformOrigin: '0 0',
              }
            : {}),
        } as CSSProperties
      }
    >
      {view === 'plan' &&
        elements.map((element) => (
          <div
            key={element.id}
            aria-hidden="true"
            className={`floor-architecture ${element.kind}`}
            style={{
              position: 'absolute',
              left: element.x,
              top: element.y,
              width: element.width,
              height: element.height,
              transform: `rotate(${element.rotation}deg)`,
            }}
          />
        ))}
      {displayedTables.map((table) => {
        const accounts = state.accounts.filter(
          (account) =>
            account.table_id === table.id && ['open', 'requested'].includes(account.status),
        );
        const total = accounts.reduce((sum, account) => sum + account.balance_cents, 0);
        const requested = accounts.some((account) => account.status === 'requested');
        const status = requested ? 'requested' : accounts.length ? 'occupied' : 'available';
        const label = requested ? 'Cuenta solicitada' : accounts.length ? 'Ocupada' : 'Libre';
        const showMoney =
          (!terminal || Boolean(operator)) &&
          accounts.every((account) => typeof account.balance_cents === 'number');
        const physical = view === 'plan';
        const size = tableSize(table);
        const mapPosition: CSSProperties = physical
          ? {
              position: 'absolute',
              left: table.x,
              top: table.y,
              width: size.width,
              height: size.height,
              borderRadius: 0,
              transform: `rotate(${table.rotation ?? 0}deg)`,
            }
          : {};
        return (
          <button
            key={table.id}
            className={`table-tile ${status} ${physical ? `physical-table ${table.shape ?? 'round'}` : ''} ${selected === table.id ? 'selected' : ''} ${highlighted?.has(table.id) ? 'search-match' : ''}`}
            style={mapPosition}
            onClick={() => select(table.id)}
            aria-pressed={selected === table.id}
            aria-label={`${table.label}, ${accounts.length ? `${accounts.length} cuentas${showMoney ? `, saldo ${money(total)}` : ''}` : 'libre'}, ${table.capacity} lugares, ${table.sector}${requested ? ', cuenta solicitada' : ''}${table.group_id ? ', mesa unida' : ''}`}
            title={`Mesa ${table.label} · ${label} · ${table.sector} · ${table.capacity} lugares${accounts.length && showMoney ? ` · Saldo ${money(total)}` : ''}`}
          >
            {physical ? (
              <TableFurniture
                shape={table.shape}
                width={size.width}
                height={size.height}
                capacity={table.capacity}
              >
                <strong>{table.label}</strong>
                {table.group_id && (
                  <Link2 className="table-group-mark" size={13} aria-label="Mesa unida" />
                )}
              </TableFurniture>
            ) : (
              <>
                <span className="tile-top">{table.sector}</span>
                <strong>{table.label}</strong>
                <span className="tile-state">{label}</span>
                <span className="tile-bottom">
                  {table.capacity} lugares
                  {accounts.length && showMoney ? ` · ${money(total)}` : ''}
                </span>
                {table.group_id && (
                  <Link2 className="table-group-mark" size={13} aria-label="Mesa unida" />
                )}
              </>
            )}
          </button>
        );
      })}
      {view === 'plan' && placementDraft && (
        <button
          type="button"
          className={`table-tile new-table-marker ${placementDraft.shape}`}
          style={{
            position: 'absolute',
            left: placementDraft.x,
            top: placementDraft.y,
            width: placementDraft.width,
            height: placementDraft.height,
            borderRadius:
              placementDraft.shape === 'round'
                ? '50%'
                : placementDraft.shape === 'square'
                  ? 12
                  : 14,
            transform: `rotate(${placementDraft.rotation}deg)`,
          }}
          aria-label={`Ubicar mesa ${placementDraft.label}`}
          title="Arrastrá esta mesa a su posición"
          onPointerDown={(event) => {
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!event.buttons || !movePlacement) return;
            const rect = event.currentTarget.parentElement!.getBoundingClientRect();
            const x = Math.max(0, Math.round((event.clientX - rect.left) / scale / 20) * 20);
            const y = Math.max(0, Math.round((event.clientY - rect.top) / scale / 20) * 20);
            movePlacement(x, y);
          }}
          onClick={(event) => event.preventDefault()}
        >
          <TableFurniture
            shape={placementDraft.shape}
            width={placementDraft.width}
            height={placementDraft.height}
            capacity={placementDraft.capacity}
          >
            <strong>{placementDraft.label}</strong>
            <span className="tile-state">Nueva</span>
          </TableFurniture>
        </button>
      )}
    </div>
  );
  if (view !== 'plan') return content;
  return (
    <div ref={viewport.ref} className="floor-map-frame" data-fit-scale={scale}>
      <div
        className="floor-map-canvas"
        style={{ width: floorCanvas.width * scale, height: floorCanvas.height * scale }}
      >
        {content}
      </div>
    </div>
  );
}
