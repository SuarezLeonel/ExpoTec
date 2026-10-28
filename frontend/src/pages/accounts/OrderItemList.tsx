import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Check, ChevronDown, ChevronRight, ClipboardList } from 'lucide-react';
import { useStore } from '../../contexts/Store';
import { Empty } from '../../components/UI';
import { OrderNotes } from '../../components/OrderNotes';
import { can } from '../../services/permissions';
import { categoryIsActive } from '../../services/categories';
import type { Account, Item } from '../../types';
import { OrderItemRow } from './OrderItemRow';

export function OrderItemList({
  account,
  items,
  selected,
  setSelected,
  onAction,
  onEditingNoteChange,
  showPrices,
  hideEmpty = false,
  priorDrafts = false,
}: {
  account: Account;
  items: Item[];
  selected: string[];
  setSelected: Dispatch<SetStateAction<string[]>>;
  onAction: (action: string, itemId: string) => void;
  onEditingNoteChange: (editing: boolean) => void;
  showPrices: boolean;
  hideEmpty?: boolean;
  priorDrafts?: boolean;
}) {
  const { state, command, busy } = useStore();
  const [selecting, setSelecting] = useState(false);
  const [showSent, setShowSent] = useState(!items.some((i) => i.status === 'draft'));
  const [showVoided, setShowVoided] = useState(false);
  const [noteItem, setNoteItem] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [recentId, setRecentId] = useState('');
  const scroll = useRef<HTMLDivElement>(null);
  const previousIds = useRef(new Set(items.map((i) => i.id)));
  const drafts = items.filter((i) => i.status === 'draft');
  const sent = items.filter((i) => !['draft', 'void'].includes(i.status));
  const voided = items.filter((i) => i.status === 'void');
  const live = items.filter((i) => i.status !== 'void');
  const hasDrafts = drafts.length > 0;
  const editingSent = sent.some((item) => item.id === noteItem);
  useEffect(() => {
    setShowSent(!hasDrafts || editingSent);
  }, [hasDrafts, editingSent]);
  useEffect(() => {
    const added = [...items]
      .reverse()
      .find((i) => i.status === 'draft' && !previousIds.current.has(i.id));
    previousIds.current = new Set(items.map((i) => i.id));
    if (added) {
      setRecentId(added.id);
      if (scroll.current) scroll.current.scrollTop = 0;
    }
  }, [items]);
  if (!state) return null;
  const closed = account.status === 'closed';
  const sensitive = can(state, 'sensitive_void');
  const body = { account_id: account.id, version: account.version };
  function finishNote() {
    setNoteItem('');
    onEditingNoteChange(false);
  }
  function renderItem(item: Item) {
    const product = state!.products.find((p) => p.id === item.product_id);
    const editable =
      !closed &&
      !['void', 'delivered'].includes(item.status) &&
      (item.status === 'draft' || sensitive);
    const canIncrease =
      !closed &&
      item.status === 'draft' &&
      item.quantity < 100 &&
      Boolean(
        product?.active &&
        product.available &&
        categoryIsActive(state!.categories, product.category_id),
      );
    return (
      <OrderItemRow
        key={item.id}
        item={item}
        selecting={selecting}
        selected={selected.includes(item.id)}
        recent={item.status === 'draft' && recentId === item.id}
        disabled={busy || Boolean(noteItem)}
        editable={editable}
        canVoid={!closed && item.status !== 'void' && sensitive}
        canIncrease={canIncrease}
        canAdjust={!closed && item.status === 'draft'}
        showPrice={showPrices}
        onSelect={(checked) =>
          setSelected((ids) => (checked ? [...ids, item.id] : ids.filter((id) => id !== item.id)))
        }
        onEdit={() => onAction('edit', item.id)}
        onVoid={() => onAction('void', item.id)}
        onNote={() => {
          setNoteItem(item.id);
          setNote(item.notes);
          setError('');
          onEditingNoteChange(true);
        }}
        onIncrease={() => {
          setError('');
          void command('item.edit', {
            ...body,
            item_id: item.id,
            quantity: item.quantity + 1,
            notes: item.notes,
          }).catch((e: Error) => setError(e.message));
        }}
        onDecrease={() => {
          if (item.quantity <= 1) return;
          setError('');
          void command('item.edit', {
            ...body,
            item_id: item.id,
            quantity: item.quantity - 1,
            notes: item.notes,
          }).catch((e: Error) => setError(e.message));
        }}
      >
        {noteItem === item.id && (
          <form
            className="item-note-form"
            aria-label={`Nota de ${item.name}`}
            onSubmit={(event) => {
              event.preventDefault();
              if (busy) return;
              setError('');
              void command('item.edit', {
                ...body,
                item_id: item.id,
                quantity: item.quantity,
                notes: note,
              })
                .then(finishNote)
                .catch((e: Error) => setError(e.message));
            }}
          >
            <OrderNotes
              value={note}
              onChange={setNote}
              disabled={busy}
              destination={item.destination}
              autoFocus
            />
            {error && (
              <p className="invalid-message" role="alert">
                {error}
              </p>
            )}
            <div className="item-note-actions">
              <button
                type="button"
                className="btn btn-outline-primary"
                disabled={busy}
                onClick={finishNote}
              >
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                <Check size={16} /> Guardar nota
              </button>
            </div>
          </form>
        )}
      </OrderItemRow>
    );
  }
  return (
    <>
      {live.length > 0 && (
        <div className="order-list-toolbar">
          <span>
            {drafts.reduce((sum, i) => sum + i.quantity, 0)}{' '}
            {priorDrafts ? 'anteriores sin enviar' : 'para enviar'}
          </span>
          <button
            type="button"
            className="text-button"
            aria-pressed={selecting}
            disabled={busy || Boolean(noteItem)}
            onClick={() => {
              setSelecting(!selecting);
              if (selecting) setSelected([]);
            }}
          >
            {selecting ? 'Terminar selección' : 'Seleccionar productos'}
          </button>
        </div>
      )}
      {selecting && (
        <div className="item-selection">
          <button
            className="btn btn-link"
            type="button"
            disabled={busy}
            onClick={() =>
              setSelected(live.every((i) => selected.includes(i.id)) ? [] : live.map((i) => i.id))
            }
          >
            {live.every((i) => selected.includes(i.id)) ? 'Quitar selección' : 'Seleccionar todo'}
          </button>
          <span>{live.filter((i) => selected.includes(i.id)).length} seleccionados</span>
        </div>
      )}
      <div
        className="account-items order-item-list"
        ref={scroll}
        role="region"
        aria-label="Productos del pedido"
        tabIndex={0}
      >
        {error && !noteItem && (
          <p className="invalid-message" role="alert">
            {error}
          </p>
        )}
        {hasDrafts && (
          <section
            className="order-item-section pending-order-items"
            aria-label={priorDrafts ? 'Cargas anteriores sin enviar' : 'Por enviar'}
          >
            <h4 className={priorDrafts ? undefined : 'visually-hidden'}>
              {priorDrafts ? 'Cargas anteriores sin enviar' : 'Por enviar'}{' '}
              <span>{drafts.reduce((sum, i) => sum + i.quantity, 0)}</span>
            </h4>
            {[...drafts].reverse().map(renderItem)}
          </section>
        )}
        {sent.length > 0 && (
          <section className="order-item-section sent-order-items" aria-label="Ya enviados">
            <h4>
              <button
                type="button"
                className="order-section-toggle"
                aria-expanded={showSent}
                disabled={editingSent}
                onClick={() => setShowSent(!showSent)}
              >
                {showSent ? <ChevronDown size={17} /> : <ChevronRight size={17} />} Enviados{' '}
                <span>{sent.reduce((sum, i) => sum + i.quantity, 0)}</span>
              </button>
            </h4>
            {showSent && sent.map(renderItem)}
          </section>
        )}
        {voided.length > 0 && (
          <section className="order-item-section" aria-label="Productos anulados">
            <h4>
              <button
                type="button"
                className="order-section-toggle"
                aria-expanded={showVoided}
                onClick={() => setShowVoided(!showVoided)}
              >
                {showVoided ? <ChevronDown size={17} /> : <ChevronRight size={17} />} Anulados{' '}
                <span>{voided.length}</span>
              </button>
            </h4>
            {showVoided && voided.map(renderItem)}
          </section>
        )}
        {!items.length && !hideEmpty && (
          <Empty>
            <ClipboardList size={30} />
            <strong>El pedido empieza acá</strong>
            <p>Los productos que agregues aparecen en esta lista.</p>
          </Empty>
        )}
      </div>
    </>
  );
}
