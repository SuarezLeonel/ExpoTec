import { useRef, useState } from 'react';
import { Settings2, ReceiptText, Utensils, Send, LoaderCircle, LogOut } from 'lucide-react';
import { Dialog } from './UI';
import { useStore } from '../contexts/Store';
import { can } from '../services/permissions';
import { AccountPanel } from '../pages/accounts/AccountPanel';
import { ProductPicker } from '../pages/accounts/ProductPicker';
import type { Account, Table } from '../types';
import { useLocalOrder } from '../hooks/useLocalOrder';
import { LocalOrderItems } from './LocalOrderItems';
import { pendingForTable } from '../services/pending';

export function TableOrderWorkspace({
  table,
  close,
  edit,
}: {
  table: Table;
  close: () => void;
  edit: () => void;
}) {
  const {
    state,
    session,
    command,
    busy,
    pending,
    showPending,
    error: storeError,
    notice,
    clear,
    terminal,
    queueOrder,
    sendingKeys,
  } = useStore();
  const [chosen, setChosen] = useState('');
  const [tab, setTab] = useState('catalog');
  const [managementGuests, setManagementGuests] = useState(1);
  const [error, setError] = useState('');
  const [editingLocal, setEditingLocal] = useState(false);
  const submitting = useRef(false);
  const draft = useLocalOrder(terminal ? session?.user.id || '' : '', table.id);
  const guests = terminal ? draft.guests : managementGuests;
  if (!state || !session) return null;
  const accounts = state.accounts.filter(
    (a) => a.table_id === table.id && ['open', 'requested'].includes(a.status),
  );
  const current =
    accounts.find((a) => a.id === (draft.items.length ? draft.accountId : chosen)) || accounts[0];
  const tablePending = pendingForTable(pending, table.id);
  const submissions = tablePending.filter((p) => p.action === 'order.submit');
  const sending = submissions.length > 0;
  const submittedCount = submissions.reduce(
    (n, p) => n + (p.preview || []).reduce((s, i) => s + i.quantity, 0),
    0,
  );
  const submittedIds = new Set(
    submissions.flatMap((entry) => entry.preview?.map((item) => item.id) || []),
  );
  const count =
    state.items
      .filter((i) => i.account_id === current?.id && i.status !== 'void' && !submittedIds.has(i.id))
      .reduce((n, i) => n + i.quantity, 0) +
    draft.items.reduce((n, i) => n + i.quantity, 0) +
    submittedCount;
  async function send() {
    if (submitting.current) return;
    submitting.current = true;
    try {
      if (!Number.isInteger(guests) || guests < 1 || guests > table.capacity)
        throw new Error(`Indicá entre 1 y ${table.capacity} comensales.`);
      if (draft.items.length && draft.accountId && current?.id !== draft.accountId)
        throw new Error(
          'La cuenta de este borrador ya no está abierta. Revisá la mesa antes de enviarlo.',
        );
      await queueOrder(
        {
          table_id: table.id,
          ...(current ? { account_id: current.id, version: current.version } : {}),
          guests,
          items: draft.items.map((item) => ({
            client_id: item.id,
            product_id: item.product_id,
            quantity: item.quantity,
            notes: item.notes,
            addon_ids: item.addons.map((addon) => addon.id),
          })),
          item_ids:
            terminal && draft.items.length
              ? []
              : state!.items
                  .filter((i) => i.account_id === current?.id && i.status === 'draft')
                  .map((i) => i.id),
        },
        draft.items,
        terminal ? draft.clear : () => undefined,
      );
      setError('');
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      submitting.current = false;
    }
  }
  function discardAndClose() {
    if (busy || submitting.current) return;
    try {
      const scopes = [table.id, ...accounts.map((a) => a.id)];
      const prefixes = scopes.map((scope) => `baguette.order-draft.${session!.user.id}.${scope}.`);
      const keys = Object.keys(localStorage).filter((key) =>
        prefixes.some((prefix) => key.startsWith(prefix)),
      );
      for (const key of keys) localStorage.removeItem(key);
      draft.clear();
      close();
    } catch {
      setError('No se pudo descartar el borrador del dispositivo. Volvé a intentarlo.');
    }
  }
  const localItems = terminal ? (
    <LocalOrderItems {...draft} onEditingChange={setEditingLocal} />
  ) : undefined;
  async function open(): Promise<Account> {
    if (current) return current;
    const opened = (await command('account.open', {
      table_id: table.id,
      guests,
    })) as Account;
    setChosen(opened.id);
    return opened;
  }
  return (
    <Dialog title={`Mesa ${table.label}`} close={close} wide className="order-workspace">
      <div className="order-workspace-toolbar">
        <strong className="active-operator">{session.user.name}</strong>
        {terminal && (
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            disabled={busy}
            onClick={discardAndClose}
          >
            <LogOut size={16} /> Salir sin cambios
          </button>
        )}
        {tablePending.length > 0 && (
          <button className="btn btn-sm btn-outline-primary" onClick={showPending}>
            Pendientes ({tablePending.length})
          </button>
        )}
        <span>
          {table.sector} ·{' '}
          {current
            ? `${current.guests} ${current.guests === 1 ? 'comensal' : 'comensales'} · ${current.status === 'requested' ? 'Cuenta solicitada' : 'Cuenta abierta'}`
            : 'Libre'}
        </span>
        {can(state, 'manage_tables') && (
          <button className="text-button" onClick={edit}>
            <Settings2 size={16} /> Configurar mesa
          </button>
        )}
        {accounts.length > 1 && (
          <label>
            Cuenta{' '}
            <select
              className="form-select"
              value={current.id}
              disabled={draft.items.length > 0 || sending}
              onChange={(e) => setChosen(e.target.value)}
            >
              {accounts.map((a, index) => (
                <option key={a.id} value={a.id}>
                  Cuenta {index + 1} · {a.guests} comensales
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {error && (
        <p role="alert" className="invalid-message">
          {error}
        </p>
      )}
      {submissions.map((entry) => (
        <div
          className={`order-sync-status ${entry.error ? 'sync-error' : ''}`}
          key={entry.key}
          role="status"
        >
          {sendingKeys.includes(entry.key) && (
            <LoaderCircle size={16} className="order-sync-spinner" aria-hidden="true" />
          )}
          <span>
            {sendingKeys.includes(entry.key)
              ? 'Enviando pedido…'
              : entry.error || entry.state === 'uncertain'
                ? 'Pedido sin confirmar. Revisá Pendientes.'
                : 'Pedido guardado. Falta sincronizar.'}{' '}
            · {submittedCount} productos
          </span>
          <button type="button" className="text-button" onClick={showPending}>
            Ver pedido
          </button>
        </div>
      ))}
      {storeError && (
        <div className="alert alert-danger order-error" role="alert">
          {storeError}
          <button className="btn btn-link" onClick={clear}>
            Cerrar mensaje
          </button>
        </div>
      )}
      {notice && notice !== 'Guardado.' && !storeError && (
        <div className="alert alert-success order-error" role="status">
          {notice}
          <button className="btn btn-link" onClick={clear}>
            Cerrar mensaje
          </button>
        </div>
      )}
      <nav className="order-mobile-tabs" aria-label="Comanda de mesa">
        <button
          className={tab === 'catalog' ? 'active' : ''}
          aria-pressed={tab === 'catalog'}
          onClick={() => setTab('catalog')}
        >
          <Utensils size={17} /> Carta
        </button>
        <button
          className={tab === 'order' ? 'active' : ''}
          aria-pressed={tab === 'order'}
          onClick={() => setTab('order')}
        >
          <ReceiptText size={17} /> Pedido ({count})
        </button>
      </nav>
      <div className={`order-workspace-body mobile-${tab}`}>
        <div className="catalog-pane">
          <ProductPicker
            account={current}
            ensureAccount={open}
            draftScope={table.id}
            embedded
            onAdd={
              terminal
                ? (product, quantity, addonIds, notes) => {
                    draft.add(
                      product,
                      quantity,
                      state.addons.filter((a) => addonIds.includes(a.id)),
                      notes,
                      current?.id,
                    );
                  }
                : undefined
            }
            close={() => undefined}
          />
        </div>
        <aside className="order-pane" aria-label="Pedido de la mesa">
          <h3>
            Pedido <span className="text-secondary">({count})</span>
          </h3>
          {current ? (
            <AccountPanel
              key={current.id}
              account={current}
              embedded
              localItems={localItems}
              localCount={draft.items.length}
              sendLocal={() => void send()}
              sending={sending}
              localEditing={editingLocal}
            />
          ) : (
            <>
              {!draft.items.length && <p>Agregá productos para empezar.</p>}
              {localItems}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!terminal) void open().catch((e: Error) => setError(e.message));
                }}
              >
                <label className="form-label" htmlFor="open-guests">
                  Comensales
                </label>
                <input
                  id="open-guests"
                  className="form-control"
                  type="number"
                  min={1}
                  max={table.capacity}
                  required
                  value={guests}
                  onChange={(e) => {
                    try {
                      if (terminal) draft.changeGuests(Number(e.target.value));
                      else setManagementGuests(Number(e.target.value));
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                />
                {!terminal && (
                  <button className="btn btn-outline-primary mt-3" disabled={busy}>
                    Abrir cuenta
                  </button>
                )}
              </form>
              {terminal && draft.items.length > 0 && (
                <div className="order-send-bar">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={sending || busy || editingLocal}
                    onClick={() => void send()}
                  >
                    <Send size={18} /> Enviar pedido ({draft.items.length})
                  </button>
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </Dialog>
  );
}
