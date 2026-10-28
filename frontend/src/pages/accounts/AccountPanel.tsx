import { useState, type ReactNode } from 'react';
import { Plus, Send, MoreHorizontal, CreditCard, CheckCheck } from 'lucide-react';
import { Badge, Confirm } from '../../components/UI';
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
                  className="btn btn-primary"
                  disabled={sending || localCount > 0}
                  onClick={() => setPanel('close')}
                >
                  <CheckCheck size={17} /> Cerrar cuenta
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
          title="Cerrar cuenta"
          text="La cuenta está pagada. ¿Cerrar y liberar la mesa?"
          close={() => setPanel('')}
          proceed={() => command('account.close', accountBody)}
        />
      )}
    </section>
  );
}
