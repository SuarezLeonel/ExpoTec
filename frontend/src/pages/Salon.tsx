import { useEffect, useState } from 'react';
import {
  Plus,
  Grid2X2,
  List,
  Link2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  BellRing,
  Check,
} from 'lucide-react';
import { InlineConfirm, Dialog, Empty, FieldsForm } from '../components/UI';
import { useFloorPages } from '../hooks/useFloorPages';
import { TableMap, type PlacementDraft } from '../components/TableMap';
import { TableOrderWorkspace } from '../components/TableOrderWorkspace';
import { useStore } from '../contexts/Store';
import { can } from '../services/permissions';
import type { Table } from '../types';

const salonZoomKey = 'baguette.salon.zoom.v1';

function savedSalonZoom() {
  try {
    const saved = Number(localStorage.getItem(salonZoomKey));
    return Number.isFinite(saved) && saved >= 0.65 && saved <= 1.5 ? saved : 1;
  } catch {
    return 1;
  }
}

export function Salon() {
  const { state, session, command, activeTableId, enterTable, leaveTable, terminal, clear } =
    useStore();
  const [sector, setSector] = useState('Salón');
  const [view, setView] = useState('plan');
  const [query, setQuery] = useState('');
  const [zoom, setZoom] = useState(savedSalonZoom);
  const [entryError, setEntryError] = useState('');
  const [edit, setEdit] = useState<Table | 'new' | null>(null);
  const [placementDraft, setPlacementDraft] = useState<PlacementDraft | null>(null);
  const [deactivate, setDeactivate] = useState<Record<string, unknown> | null>(null);
  const [group, setGroup] = useState(false);
  const [selection, setSelection] = useState<string[]>([]);
  useEffect(() => {
    try {
      localStorage.setItem(salonZoomKey, String(zoom));
    } catch {
      // Keep the current zoom for this visit when storage is unavailable.
    }
  }, [zoom]);
  const publishedTables = state?.floorPlan?.published.tables ?? [];
  const tables = (state?.tables ?? []).map((table) => ({
    ...table,
    ...publishedTables.find((published) => published.id === table.id),
  }));
  const sectors = [
    ...new Set(['Salón', 'Patio', ...tables.filter((t) => t.active).map((t) => t.sector)]),
  ];
  const sectorTables = tables
    .filter((t) => t.active && (!sector || t.sector === sector))
    .sort(
      (a, b) => a.y - b.y || a.x - b.x || a.label.localeCompare(b.label, 'es', { numeric: true }),
    );
  const searchTerm = query.trim().toLowerCase();
  const filtered = sectorTables.filter((t) =>
    `${t.label} ${t.sector}`.toLowerCase().includes(searchTerm),
  );
  const matchingIds = new Set(searchTerm ? filtered.map((t) => t.id) : []);
  const visibleTables = view === 'plan' ? sectorTables : filtered;
  const floor = useFloorPages(visibleTables);
  const pageTables = floor.pages[0];
  if (!state || !session) return null;
  const canEdit = can(state, 'manage_tables');
  const table = tables.find((t) => t.id === activeTableId);
  const readyItems = state.items.filter((i) => i.status === 'ready');
  return (
    <div className={`salon-page ${terminal ? 'shared-salon' : ''}`}>
      <h1 className="visually-hidden">El salón</h1>
      {readyItems.length > 0 && (
        <section className="ready-orders-banner" aria-label="Platos listos para entregar">
          <div className="ready-orders-header">
            <div className="ready-orders-title">
              <span className="ready-orders-pulse" aria-hidden="true" />
              <BellRing size={18} className="ready-icon" />
              <strong>
                {readyItems.length === 1
                  ? '1 pedido listo en cocina para entregar a la mesa'
                  : `${readyItems.length} pedidos listos en cocina para entregar a las mesas`}
              </strong>
            </div>
            <span className="small text-secondary">Retirar de cocina y servir al comensal</span>
          </div>
          <div className="ready-orders-grid">
            {readyItems.map((item) => {
              const account = state.accounts.find((a) => a.id === item.account_id);
              const tableObj = state.tables.find((t) => t.id === account?.table_id);
              return (
                <article key={item.id} className="ready-order-card">
                  <div className="ready-order-info">
                    <span className="ready-table-badge">
                      {tableObj?.label || 'Mesa'} · {tableObj?.sector || 'Salón'}
                    </span>
                    <strong className="ready-item-name">
                      {item.quantity} × {item.name}
                    </strong>
                    {item.addons?.length > 0 && (
                      <span className="ready-addons">
                        + {item.addons.map((a) => a.name).join(', ')}
                      </span>
                    )}
                    {item.notes && <span className="ready-notes">Nota: {item.notes}</span>}
                  </div>
                  <div className="ready-order-actions">
                    <button
                      type="button"
                      className="btn btn-sm btn-success"
                      onClick={() => {
                        void command('item.status', {
                          account_id: item.account_id,
                          version: account?.version,
                          item_id: item.id,
                          status: 'delivered',
                        }).catch(() => undefined);
                      }}
                      title="Marcar como entregado a la mesa"
                    >
                      <Check size={15} /> Entregar a mesa
                    </button>
                    {tableObj && (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        onClick={() => enterTable(tableObj.id)}
                      >
                        Abrir mesa
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
      <div className="salon-toolbar">
        <label className="salon-search">
          Buscar mesa
          <input
            className="form-control"
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
          />
        </label>
        <div className="salon-toolbar-right">
          <label className="salon-sector">
            Sector
            <select
              className="form-select"
              value={sector}
              onChange={(e) => {
                setSector(e.target.value);
              }}
            >
              <option value="">Todo el salón</option>
              {sectors.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <div className="salon-toolbar-actions">
            <div className="segmented" aria-label="Vista del salón">
              <button
                aria-pressed={view === 'plan'}
                onClick={() => {
                  setView('plan');
                }}
              >
                <Grid2X2 size={16} /> Plano
              </button>
              <button
                aria-pressed={view === 'list'}
                onClick={() => {
                  setView('list');
                }}
              >
                <List size={16} /> Lista
              </button>
            </div>
            {canEdit && (
              <button className="btn btn-primary" onClick={() => setEdit('new')}>
                <Plus size={17} /> <span>Nueva mesa</span>
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="salon-workspace">
        <section className="floor-panel" aria-label="Mesas">
          <div className="floor-caption">
            <span>
              {sector || 'Salón completo'} · {visibleTables.length} mesas
            </span>
            {view === 'plan' ? (
              <div className="floor-zoom" aria-label="Controles del plano">
                <button
                  className="icon-button"
                  aria-label="Alejar plano"
                  disabled={zoom <= 0.65}
                  onClick={() =>
                    setZoom((value) => Math.max(0.65, Number((value - 0.1).toFixed(2))))
                  }
                >
                  <ZoomOut size={17} />
                </button>
                <span>{Math.round(zoom * 100)}%</span>
                <button
                  className="icon-button"
                  aria-label="Acercar plano"
                  disabled={zoom >= 1.5}
                  onClick={() =>
                    setZoom((value) => Math.min(1.5, Number((value + 0.1).toFixed(2))))
                  }
                >
                  <ZoomIn size={17} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Restablecer zoom"
                  onClick={() => setZoom(1)}
                >
                  <Maximize2 size={16} />
                </button>
              </div>
            ) : (
              <span className="small text-secondary">Tocá una mesa para comandar</span>
            )}
          </div>
          <div ref={floor.ref} className="floor-map-viewport">
            {visibleTables.length ? (
              sector ? (
                <TableMap
                  tables={pageTables}
                  selected={activeTableId}
                  view={view}
                  sector={sector}
                  highlighted={matchingIds}
                  zoom={zoom}
                  placementDraft={placementDraft}
                  movePlacement={(x, y) =>
                    setPlacementDraft((draft) => (draft ? { ...draft, x, y } : draft))
                  }
                  select={(id) => {
                    setEntryError('');
                    clear();
                    void enterTable(id).catch((e) => {
                      if (e.code !== 'PIN_CANCELLED') setEntryError(e.message);
                    });
                  }}
                />
              ) : (
                <div className="salon-sector-maps">
                  {sectors
                    .filter((mapSector) => visibleTables.some((item) => item.sector === mapSector))
                    .map((mapSector) => {
                      const sectorTables = pageTables.filter((item) => item.sector === mapSector);
                      const sectorMatches = new Set(
                        sectorTables
                          .filter((item) => matchingIds.has(item.id))
                          .map((item) => item.id),
                      );
                      return (
                        <section
                          className="salon-sector-map"
                          key={mapSector}
                          aria-label={`Mapa de ${mapSector}`}
                        >
                          <h2>{mapSector}</h2>
                          <TableMap
                            tables={sectorTables}
                            selected={activeTableId}
                            view={view}
                            sector={mapSector}
                            highlighted={sectorMatches}
                            zoom={zoom}
                            placementDraft={
                              placementDraft?.sector === mapSector ? placementDraft : null
                            }
                            movePlacement={(x, y) =>
                              setPlacementDraft((draft) => (draft ? { ...draft, x, y } : draft))
                            }
                            select={(id) => {
                              setEntryError('');
                              clear();
                              void enterTable(id).catch((e) => {
                                if (e.code !== 'PIN_CANCELLED') setEntryError(e.message);
                              });
                            }}
                          />
                        </section>
                      );
                    })}
                </div>
              )
            ) : (
              <Empty>
                <strong>No hay mesas con ese filtro.</strong>
                {query || sector ? (
                  <>
                    <p>Revisá el nombre o volvé a ver todo el salón.</p>
                    <button
                      className="btn btn-outline-primary mt-3"
                      onClick={() => {
                        setQuery('');
                        setSector('');
                      }}
                    >
                      Limpiar filtros
                    </button>
                  </>
                ) : (
                  <p>Pedile al encargado que agregue una mesa para comenzar.</p>
                )}
              </Empty>
            )}
          </div>
          {placementDraft && (
            <div
              className="table-placement-confirm"
              role="group"
              aria-label="Confirmar ubicación de mesa"
            >
              <span>
                Arrastrá la mesa nueva hasta su lugar. Las demás mesas permanecen bloqueadas.
              </span>
              <span>
                Posición {placementDraft.x}, {placementDraft.y}
              </span>
              <button className="btn btn-outline-primary" onClick={() => setPlacementDraft(null)}>
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                onClick={() =>
                  void command('table.save', { ...placementDraft })
                    .then(() => setPlacementDraft(null))
                    .catch(() => undefined)
                }
              >
                Confirmar ubicación
              </button>
            </div>
          )}
          <div className="floor-legend">
            <span>
              <i className="legend-free" />
              Libre
            </span>
            <span>
              <i className="legend-open" />
              Abierta
            </span>
            <span>
              <i className="legend-requested" />
              Cuenta solicitada
            </span>
            {!terminal && can(state, 'operate') && (
              <button className="btn btn-link" onClick={() => setGroup(true)}>
                <Link2 size={15} /> Unir o separar mesas
              </button>
            )}
          </div>
        </section>
      </div>
      {entryError && (
        <div className="salon-entry-error alert alert-danger" role="alert">
          <span>{entryError}</span>
          <button className="btn btn-link" onClick={() => setEntryError('')}>
            Cerrar mensaje
          </button>
        </div>
      )}
      {table && (
        <TableOrderWorkspace
          key={table.id}
          table={table}
          close={leaveTable}
          edit={() => setEdit(table)}
        />
      )}
      {edit && (
        <Dialog
          title={edit === 'new' ? 'Agregar mesa' : `Configurar ${edit.label}`}
          close={() => {
            setEdit(null);
            setDeactivate(null);
          }}
        >
          <div hidden={Boolean(deactivate)}>
            {' '}
            <FieldsForm
              fields={[
                {
                  name: 'label',
                  label: 'Identificación',
                  value: edit === 'new' ? '' : edit.label,
                  required: true,
                  maxLength: 30,
                },
                ...(edit === 'new'
                  ? [
                      {
                        name: 'shape',
                        label: 'Forma',
                        value: 'round',
                        options: [
                          { value: 'round', label: 'Redonda' },
                          { value: 'square', label: 'Cuadrada' },
                          { value: 'rectangular', label: 'Rectangular' },
                        ],
                      },
                    ]
                  : []),
                {
                  name: 'capacity',
                  label: 'Capacidad',
                  type: 'number',
                  value: edit === 'new' ? 4 : edit.capacity,
                  min: 1,
                  max: 50,
                  required: true,
                },
                {
                  name: 'sector',
                  label: 'Sector',
                  value: edit === 'new' ? 'Salón' : edit.sector,
                  required: true,
                  options: [
                    { value: 'Salón', label: 'Salón' },
                    { value: 'Patio', label: 'Patio' },
                  ],
                },
                {
                  name: 'active',
                  label: 'Mesa activa',
                  type: 'checkbox',
                  value: edit === 'new' ? true : edit.active,
                },
              ]}
              submit={async (v) => {
                if (edit === 'new') {
                  setPlacementDraft({
                    label: String(v.label),
                    capacity: Number(v.capacity),
                    sector: String(v.sector),
                    shape: String(v.shape) as PlacementDraft['shape'],
                    width: v.shape === 'rectangular' ? 140 : 92,
                    height: v.shape === 'rectangular' ? 80 : 92,
                    rotation: 0,
                    active: Boolean(v.active),
                    x: 120,
                    y: 120,
                  });
                  setEdit(null);
                  return;
                }
                const body = {
                  id: edit.id,
                  ...v,
                  capacity: Number(v.capacity),
                  x: edit.x,
                  y: edit.y,
                  shape: edit.shape ?? 'round',
                  width: edit.width ?? 92,
                  height: edit.height ?? 92,
                  rotation: edit.rotation ?? 0,
                };
                if (edit.active && !v.active) {
                  setDeactivate(body);
                  return;
                }
                await command('table.save', body);
                setEdit(null);
              }}
            />
          </div>
          {deactivate && (
            <InlineConfirm
              title={`Desactivar ${String(deactivate.label)}`}
              text="Se conservará el historial de esta mesa. El servidor impedirá la baja si tiene cuentas abiertas."
              close={() => setDeactivate(null)}
              proceed={async () => {
                await command('table.save', deactivate);
                setEdit(null);
              }}
            />
          )}
          <p className="small text-secondary">
            La ubicación física se edita en Diseño del salón. El servidor impide dar de baja mesas
            con cuentas abiertas.
          </p>
        </Dialog>
      )}
      {group && (
        <Dialog title="Unión física de mesas" close={() => setGroup(false)}>
          <p>Esta acción agrupa mesas en el salón. Los consumos conservan sus cuentas.</p>
          <button
            className="btn btn-link"
            onClick={() =>
              setSelection(selection.length === filtered.length ? [] : filtered.map((t) => t.id))
            }
          >
            Marcar todas las mesas del sector visible
          </button>
          <div className="selection-list">
            {filtered.map((t) => (
              <label key={t.id}>
                <input
                  type="checkbox"
                  checked={selection.includes(t.id)}
                  onChange={(e) =>
                    setSelection((p) =>
                      e.target.checked ? [...p, t.id] : p.filter((id) => id !== t.id),
                    )
                  }
                />
                {t.label}
                {t.group_id ? ' · Unida' : ''}
              </label>
            ))}
          </div>
          <p>{selection.length} mesas seleccionadas</p>
          <div className="form-actions">
            <button
              className="btn btn-outline-primary"
              disabled={!selection.length}
              onClick={() => {
                void command('table.group', {
                  table_ids: selection,
                  group_id: null,
                })
                  .then(() => setGroup(false))
                  .catch(() => undefined);
              }}
            >
              Separar seleccionadas
            </button>
            <button
              className="btn btn-primary"
              disabled={selection.length < 2}
              onClick={() => {
                void command('table.group', { table_ids: selection })
                  .then(() => setGroup(false))
                  .catch(() => undefined);
              }}
            >
              Confirmar unión de {selection.length} mesas
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
