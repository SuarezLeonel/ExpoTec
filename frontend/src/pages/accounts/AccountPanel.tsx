import { useState, type ReactNode } from 'react';
import { Plus, Send, MoreHorizontal, CreditCard, CheckCheck, Printer } from 'lucide-react';
import { Badge, Confirm, Dialog } from '../../components/UI';
import { useStore } from '../../contexts/Store';
import { can } from '../../services/permissions';
import { date, money } from '../../services/api';
import type { Account } from '../../types';
import { ProductPicker } from './ProductPicker';
import { AccountActions } from './AccountActions';
import { PaymentPanel, RefundPanel } from './PaymentPanel';
import { OrderItemList } from './OrderItemList';
export function AccountPanel({
  account,
  embedded = false,
  localItems,
  localCount = 0,
  sendLocal,
  sending = false,
  localEditing = false,
}: {
  account: Account;
  embedded?: boolean;
  localItems?: ReactNode;
  localCount?: number;
  sendLocal?: () => void;
  sending?: boolean;
  localEditing?: boolean;
}) {
  const { state, session, command, busy, terminal } = useStore();
  const [selected, setSelected] = useState<string[]>([]);
  const [panel, setPanel] = useState('');
  const [more, setMore] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [totalDetails, setTotalDetails] = useState(false);
  if (!state || !session) return null;
  const items = state.items.filter((i) => i.account_id === account.id);
  const chosen = items.filter((i) => selected.includes(i.id) && i.status !== 'void');
  const drafts = items.filter((i) => i.status === 'draft');
  const accountBody = { account_id: account.id, version: account.version };
  const canCash = can(state, 'cash');
  const closed = account.status === 'closed';
  const sendCount =
    embedded && terminal && localCount > 0 ? localCount : drafts.length + localCount;
  const sendingPrevious = embedded && terminal && localCount === 0 && drafts.length > 0;
  const safe = (action: string, extra = {}) => {
    void command(action, { ...accountBody, ...extra }).catch(() => undefined);
  };
  return (
    <section className="account-detail">
      {!embedded && (
        <>
          <div className="account-meta">
            <Badge value={account.status} />
            <span>{date(account.created_at, true)}</span>
          </div>
          <div className="waiter-meta">
            {account.guests} comensales ·{' '}
            {state.users.find((u) => u.id === account.waiter_id)?.name || 'Camarero asignado'}
            {!closed && (
              <span>
                {' '}
                · Hace{' '}
                {Math.max(0, Math.floor((Date.now() - Date.parse(account.created_at)) / 60000))} min
              </span>
            )}
          </div>
        </>
      )}
      {!closed && !embedded && (
        <div className="order-actions">
          {!embedded && (
            <button className="btn btn-outline-primary" onClick={() => setPanel('products')}>
              <Plus size={17} /> Agregar productos
            </button>
          )}
          {!embedded && drafts.length > 0 && (
            <button
              className="btn btn-primary"
              disabled={busy || editingNote}
              onClick={() => safe('order.send', { item_ids: drafts.map((i) => i.id) })}
            >
              <Send size={16} /> Enviar pedido ({drafts.length})
            </button>
          )}
        </div>
      )}
      <div className={embedded ? 'combined-order-items' : undefined}>
        {localItems}
        <OrderItemList
          account={account}
          items={items}
          selected={selected}
          setSelected={setSelected}
          onEditingNoteChange={setEditingNote}
          showPrices={!embedded}
          hideEmpty={localCount > 0}
          priorDrafts={embedded && terminal}
          onAction={(action, itemId) => {
            setSelected([itemId]);
            setPanel(action);
          }}
        />
      </div>
      {(!embedded || totalDetails) && (
        <dl className="account-totals">
          {(!embedded || totalDetails) && (
            <div>
              <dt>Consumo</dt>
              <dd>{money(account.subtotal_cents)}</dd>
            </div>
          )}
          {Number(account.discount_cents) > 0 && (
            <div>
              <dt>Descuentos</dt>
              <dd>−{money(account.discount_cents)}</dd>
            </div>
          )}
          {(!embedded || totalDetails || Number(account.paid_cents) > 0) && (
            <div>
              <dt>Ya cobrado</dt>
              <dd>{money(account.paid_cents)}</dd>
            </div>
          )}
          <div className="balance-line">
            <dt>
              Saldo{' '}
              {embedded && (
                <button
                  type="button"
                  className="order-total-toggle"
                  aria-expanded={totalDetails}
                  onClick={() => setTotalDetails(!totalDetails)}
                >
                  {totalDetails ? 'Ocultar detalle' : 'Ver detalle'}
                </button>
              )}
            </dt>
            <dd>{money(account.balance_cents)}</dd>
          </div>
        </dl>
      )}
      <div className="account-primary-actions">
        {embedded && !closed && sendCount > 0 && (
          <div className="order-send-bar">
            <button
              className="btn btn-primary"
              disabled={busy || editingNote || localEditing || sending}
              onClick={() =>
                sendLocal ? sendLocal() : safe('order.send', { item_ids: drafts.map((i) => i.id) })
              }
            >
              <Send size={18} /> {sendingPrevious ? 'Enviar cargas anteriores' : 'Enviar pedido'} (
              {sendCount})
            </button>
            {editingNote && (
              <p className="catalog-hint">Guardá o cancelá la nota para enviar el pedido.</p>
            )}
          </div>
        )}
        {more && (
          <div className="account-more">
            {embedded && (
              <button
                onClick={() => {
                  setTotalDetails(!totalDetails);
                  setMore(false);
                }}
              >
                {totalDetails ? 'Ocultar importes' : 'Ver importes'}
              </button>
            )}
            {!closed && (
              <>
                <button onClick={() => setPanel('update')}>
                  {terminal ? 'Cambiar comensales' : 'Cambiar camarero / comensales'}
                </button>
                <button onClick={() => setPanel('move')}>Cambiar de mesa</button>
                <button disabled={!chosen.length} onClick={() => setPanel('split')}>
                  Separar seleccionados
                </button>
                <button disabled={!chosen.length} onClick={() => setPanel('transfer')}>
                  Mover seleccionados
                </button>
                <button onClick={() => setPanel('merge')}>Agrupar otra cuenta</button>
                {can(state, 'discount') && (
                  <button onClick={() => setPanel('discount')}>
                    Descuento {chosen.length === 1 ? 'al ítem seleccionado' : 'a la cuenta'}
                  </button>
                )}
              </>
            )}
            {canCash && <button onClick={() => setPanel('refund')}>Reintegro / devolución</button>}
          </div>
        )}
        <div className="account-secondary-actions">
          <div className="account-options-toggle">
            <button
              className="btn btn-outline-primary"
              aria-label="Opciones de cuenta"
              aria-expanded={more}
              onClick={() => setMore(!more)}
            >
              <MoreHorizontal size={18} /> Opciones
            </button>
          </div>
          {!closed && (
            <div className="account-footer">
              <button
                type="button"
                className="btn btn-outline-primary"
                onClick={() => setPanel('invoice')}
                title="Imprimir comanda o factura de la mesa"
              >
                <Printer size={16} /> Imprimir factura
              </button>
              {account.status === 'open' && (
                <button
                  className="btn btn-outline-primary"
                  disabled={busy || sending || localCount > 0 || !items.length}
                  onClick={() => safe('account.request')}
                >
                  Solicitar cuenta
                </button>
              )}
              {canCash && account.balance_cents > 0 && (
                <button
                  className="btn btn-primary"
                  disabled={sending || localCount > 0}
                  onClick={() => setPanel('payment')}
                >
                  <CreditCard size={17} /> Cobrar
                </button>
              )}
              {canCash && Number(account.balance_cents) === 0 && (
                <button
                  className="btn btn-success"
                  disabled={sending || localCount > 0}
                  onClick={() => setPanel('close')}
                  title="Liberar mesa para nuevos comensales"
                >
                  <CheckCheck size={17} /> Dejar libre la mesa
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {panel === 'products' && <ProductPicker account={account} close={() => setPanel('')} />}{' '}
      {['move', 'update', 'split', 'transfer', 'merge', 'discount', 'void', 'edit'].includes(
        panel,
      ) && (
        <AccountActions
          action={panel}
          account={account}
          selected={chosen}
          close={() => setPanel('')}
        />
      )}{' '}
      {panel === 'payment' && (
        <PaymentPanel account={account} selected={chosen} close={() => setPanel('')} />
      )}{' '}
      {panel === 'refund' && <RefundPanel account={account} close={() => setPanel('')} />}{' '}
      {panel === 'close' && (
        <Confirm
          title="Dejar libre la mesa"
          text="El consumo está totalmente pagado. Al confirmar, la mesa queda libre en el salón para nuevos clientes."
          close={() => setPanel('')}
          proceed={() => command('account.close', accountBody)}
        />
      )}
      {panel === 'invoice' && (
        <Dialog title="Comprobante de consumo / Factura" close={() => setPanel('')} wide>
          <div className="printable-invoice">
            <header className="invoice-header text-center pb-3 border-bottom mb-3">
              <h2 className="mb-1">CAFÉ</h2>
              <p className="small text-secondary mb-1">ESPRESSO & COCINA · Sucursal Central</p>
              <p className="small mb-0">
                Comprobante de mesa: {state.tables.find((t) => t.id === account.table_id)?.label}
              </p>
            </header>
            <div className="invoice-meta d-flex justify-content-between small text-secondary mb-3">
              <div>
                <div>
                  <strong>Fecha:</strong> {date(new Date().toISOString(), true)}
                </div>
                <div>
                  <strong>Mesa:</strong>{' '}
                  {state.tables.find((t) => t.id === account.table_id)?.label} (
                  {state.tables.find((t) => t.id === account.table_id)?.sector})
                </div>
              </div>
              <div className="text-end">
                <div>
                  <strong>Atendió:</strong>{' '}
                  {state.users.find((u) => u.id === account.waiter_id)?.name || 'Mozo'}
                </div>
                <div>
                  <strong>Comensales:</strong> {account.guests}
                </div>
              </div>
            </div>
            <table className="table table-sm invoice-table mb-3">
              <thead>
                <tr>
                  <th>Cant.</th>
                  <th>Descripción</th>
                  <th className="text-end">Unitario</th>
                  <th className="text-end">Importe</th>
                </tr>
              </thead>
              <tbody>
                {items
                  .filter((i) => i.status !== 'void')
                  .map((item) => {
                    const lineTotal =
                      (Number(item.unit_cents) +
                        (item.addons || []).reduce((s, a) => s + Number(a.price_cents), 0)) *
                      item.quantity;
                    return (
                      <tr key={item.id}>
                        <td>{item.quantity}</td>
                        <td>
                          <strong>{item.name}</strong>
                          {item.addons?.length > 0 && (
                            <div className="small text-secondary">
                              + {item.addons.map((a) => a.name).join(', ')}
                            </div>
                          )}
                          {item.notes && <div className="small text-muted">Nota: {item.notes}</div>}
                        </td>
                        <td className="text-end">{money(item.unit_cents)}</td>
                        <td className="text-end">{money(lineTotal)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            <div className="invoice-totals border-top pt-2 mb-4">
              <div className="d-flex justify-content-between mb-1">
                <span>Subtotal consumos:</span>
                <strong>{money(account.subtotal_cents)}</strong>
              </div>
              {account.discount_cents > 0 && (
                <div className="d-flex justify-content-between text-success mb-1">
                  <span>Descuento aplicado:</span>
                  <strong>- {money(account.discount_cents)}</strong>
                </div>
              )}
              <div className="d-flex justify-content-between fs-5 mb-1">
                <strong>Total a pagar:</strong>
                <strong>{money(account.total_cents)}</strong>
              </div>
              <div className="d-flex justify-content-between text-secondary mb-1">
                <span>Total pagado:</span>
                <span>{money(account.paid_cents)}</span>
              </div>
              <div className="d-flex justify-content-between fs-6 border-top pt-1">
                <strong>Saldo pendiente:</strong>
                <strong
                  className={Number(account.balance_cents) === 0 ? 'text-success' : 'text-danger'}
                >
                  {Number(account.balance_cents) === 0
                    ? 'PAGADO COMPLETO'
                    : money(account.balance_cents)}
                </strong>
              </div>
            </div>
            <div className="d-flex justify-content-between align-items-center pt-2 border-top">
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setPanel('')}
              >
                Cerrar
              </button>
              <button type="button" className="btn btn-primary" onClick={() => window.print()}>
                <Printer size={16} /> Imprimir comanda
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </section>
  );
}
