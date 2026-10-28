import { useState } from 'react';
import { OrderItemRow } from '../pages/accounts/OrderItemRow';
import { OrderNotes } from './OrderNotes';
import type { Item } from '../types';

export function LocalOrderItems({
  items,
  edit,
  remove,
  onEditingChange,
}: {
  items: Item[];
  edit: (id: string, changes: Partial<Pick<Item, 'quantity' | 'notes'>>) => void;
  remove: (id: string) => void;
  onEditingChange: (value: boolean) => void;
}) {
  const [editing, setEditing] = useState('');
  const [notes, setNotes] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [correcting, setCorrecting] = useState(false);
  const [error, setError] = useState('');
  function finish() {
    setEditing('');
    onEditingChange(false);
  }
  const safe = (action: () => void) => {
    try {
      action();
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    items.length > 0 && (
      <section className="local-order-items" aria-label="Pedido por enviar">
        <p className="catalog-hint">
          {items.reduce((n, item) => n + item.quantity, 0)} para enviar · Guardado en este
          dispositivo
        </p>
        {error && (
          <p role="alert" className="invalid-message">
            {error}
          </p>
        )}
        {[...items].reverse().map((item) => (
          <OrderItemRow
            key={item.id}
            item={item}
            selected={false}
            selecting={false}
            recent={item.id === items.at(-1)?.id}
            disabled={Boolean(editing)}
            editable
            canVoid
            canAdjust
            canIncrease={item.quantity < 100}
            showPrice={false}
            onSelect={() => undefined}
            onEdit={() => {
              setEditing(item.id);
              setNotes(item.notes);
              setQuantity(item.quantity);
              setCorrecting(true);
              onEditingChange(true);
            }}
            onNote={() => {
              setEditing(item.id);
              setNotes(item.notes);
              setCorrecting(false);
              onEditingChange(true);
            }}
            onVoid={() => safe(() => remove(item.id))}
            onIncrease={() =>
              safe(() => edit(item.id, { quantity: Math.min(100, item.quantity + 1) }))
            }
            onDecrease={() =>
              safe(() => edit(item.id, { quantity: Math.max(1, item.quantity - 1) }))
            }
          >
            {editing === item.id && (
              <form
                className="item-note-form"
                aria-label={`Nota de ${item.name}`}
                onSubmit={(e) => {
                  e.preventDefault();
                  safe(() => {
                    edit(item.id, { notes, ...(correcting ? { quantity } : {}) });
                    finish();
                  });
                }}
              >
                {correcting && (
                  <label className="form-label">
                    Cantidad
                    <input
                      className="form-control"
                      type="number"
                      min={1}
                      max={100}
                      required
                      value={quantity}
                      onChange={(e) => setQuantity(Number(e.target.value))}
                    />
                  </label>
                )}
                <OrderNotes
                  value={notes}
                  onChange={setNotes}
                  destination={item.destination}
                  autoFocus
                />
                <div className="item-note-actions">
                  <button type="button" className="btn btn-outline-primary" onClick={finish}>
                    Cancelar
                  </button>
                  <button className="btn btn-primary">Guardar nota</button>
                </div>
              </form>
            )}
          </OrderItemRow>
        ))}
      </section>
    )
  );
}
