import { useState } from 'react';
import { ChefHat, Coffee, RefreshCw } from 'lucide-react';
import { useStore } from '../contexts/Store';
import { Badge, Empty, PageHeading } from '../components/UI';
import { date } from '../services/api';
export function Preparation() {
  const { state, session, command, busy, refresh } = useStore();
  const [filter, setFilter] = useState('all');
  if (!state || !session) return null;
  const destination = filter;
  const items = state.items.filter(
    (i) =>
      ['sent', 'preparing', 'ready'].includes(i.status) &&
      (destination === 'all' || i.destination === destination),
  );
  const groups = [...new Set(items.map((i) => i.account_id))];
  return (
    <>
      <PageHeading eyebrow="COMANDAS DEL TURNO" title="Cocina y despacho">
        <button
          className="btn btn-outline-primary"
          disabled={busy}
          onClick={() => {
            void refresh().catch(() => undefined);
          }}
        >
          <RefreshCw size={16} /> Actualizar
        </button>
      </PageHeading>
      <div className="salon-toolbar">
        <nav className="category-tabs" aria-label="Destino de preparación">
          {['admin', 'cashier', 'waiter', 'kitchen'].includes(session.user.role) && (
            <>
              <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
                Todos los pedidos
              </button>
              <button
                className={filter === 'kitchen' ? 'active' : ''}
                onClick={() => setFilter('kitchen')}
              >
                <ChefHat size={17} /> Cocina
              </button>
              <button className={filter === 'bar' ? 'active' : ''} onClick={() => setFilter('bar')}>
                <Coffee size={17} /> Bar
              </button>
            </>
          )}
        </nav>
        <span className="small text-secondary">Actualización automática cada 7 segundos</span>
      </div>
      {!items.length ? (
        <Empty>Por acá está todo al día. Las nuevas comandas van a aparecer en este espacio.</Empty>
      ) : (
        <div className="kitchen-board">
          {groups.map((id) => {
            const account = state.accounts.find((a) => a.id === id);
            const table = state.tables.find((t) => t.id === account?.table_id);
            return (
              <section className="preparation-ticket" key={id}>
                <header>
                  <div>
                    <p className="eyebrow">{table?.sector}</p>
                    <h2>{table?.label || 'Cuenta'}</h2>
                  </div>
                  <span>
                    {state.users.find((u) => u.id === account?.waiter_id)?.name || 'Camarero'}
                  </span>
                </header>
                {items
                  .filter((i) => i.account_id === id)
                  .map((i) => (
                    <article key={i.id}>
                      <div className="d-flex justify-content-between gap-2">
                        <strong>
                          {i.quantity} × {i.name}
                        </strong>
                        <Badge value={i.destination} />
                      </div>
                      {i.addons?.length > 0 && (
                        <p className="small mb-1">+ {i.addons.map((a) => a.name).join(', ')}</p>
                      )}
                      {i.notes && <p className="preparation-note">{i.notes}</p>}
                      <small className="text-secondary">{date(i.created_at, true)}</small>
                      <div className="item-bottom">
                        <Badge value={i.status} />
                        <div className="d-flex gap-2">
                          {i.status === 'sent' && (
                            <>
                              <button
                                className="btn btn-sm btn-outline-primary"
                                disabled={busy}
                                onClick={() => {
                                  void command('item.status', {
                                    account_id: id,
                                    version: account?.version,
                                    item_id: i.id,
                                    status: 'preparing',
                                  }).catch(() => undefined);
                                }}
                              >
                                Preparar
                              </button>
                              <button
                                className="btn btn-sm btn-primary"
                                disabled={busy}
                                onClick={() => {
                                  void command('item.status', {
                                    account_id: id,
                                    version: account?.version,
                                    item_id: i.id,
                                    status: 'ready',
                                  }).catch(() => undefined);
                                }}
                              >
                                Listo para mesa
                              </button>
                            </>
                          )}
                          {i.status === 'preparing' && (
                            <button
                              className="btn btn-sm btn-primary"
                              disabled={busy}
                              onClick={() => {
                                void command('item.status', {
                                  account_id: id,
                                  version: account?.version,
                                  item_id: i.id,
                                  status: 'ready',
                                }).catch(() => undefined);
                              }}
                            >
                              ✓ Listo para entregar
                            </button>
                          )}
                          {i.status === 'ready' &&
                            (session.user.role === 'kitchen' ? (
                              <span className="badge badge-success d-inline-flex align-items-center py-1 px-2">
                                Listo en despacho · Esperando mozo
                              </span>
                            ) : (
                              <button
                                className="btn btn-sm btn-success"
                                disabled={busy}
                                onClick={() => {
                                  void command('item.status', {
                                    account_id: id,
                                    version: account?.version,
                                    item_id: i.id,
                                    status: 'delivered',
                                  }).catch(() => undefined);
                                }}
                              >
                                ✓ Entregar a la mesa
                              </button>
                            ))}
                        </div>
                      </div>
                    </article>
                  ))}
              </section>
            );
          })}
        </div>
      )}
      <p className="small text-secondary mt-4">
        Las correcciones y anulaciones posteriores al envío también generan tickets identificables.
      </p>
    </>
  );
}
