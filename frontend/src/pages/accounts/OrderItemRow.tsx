import { useRef, useState, type ReactNode } from 'react';
import { MessageSquare, Plus, Minus, Pencil, Trash2, MoreHorizontal } from 'lucide-react';
import { Badge } from '../../components/UI';
import { money } from '../../services/api';
import type { Item } from '../../types';

export function OrderItemRow({
  item,
  selected,
  selecting,
  recent,
  disabled,
  editable,
  canVoid,
  canIncrease,
  canAdjust,
  showPrice,
  onSelect,
  onNote,
  onEdit,
  onVoid,
  onIncrease,
  onDecrease,
  onDeliver,
  children,
}: {
  item: Item;
  selected: boolean;
  selecting: boolean;
  recent: boolean;
  disabled: boolean;
  editable: boolean;
  canVoid: boolean;
  canIncrease: boolean;
  canAdjust: boolean;
  showPrice: boolean;
  onSelect: (checked: boolean) => void;
  onNote: () => void;
  onEdit: () => void;
  onVoid: () => void;
  onIncrease: () => void;
  onDecrease: () => void;
  onDeliver?: () => void;
  children?: ReactNode;
}) {
  const [more, setMore] = useState(false);
  const actionsButton = useRef<HTMLButtonElement>(null);
  const showStatus = !['draft', 'sent'].includes(item.status);
  const total =
    (Number(item.unit_cents) +
      (item.addons || []).reduce((sum, addon) => sum + Number(addon.price_cents), 0)) *
    item.quantity;
  return (
    <article
      className={`account-item order-line ${item.status === 'void' ? 'voided' : ''} ${recent ? 'recent-order-line' : ''} ${selected && selecting ? 'selected-order-line' : ''}`}
    >
      <div className="order-line-main">
        {selecting && (
          <input
            type="checkbox"
            className="order-line-checkbox"
            aria-label={`Seleccionar ${item.name}`}
            checked={selected}
            disabled={disabled || item.status === 'void'}
            onChange={(event) => onSelect(event.target.checked)}
          />
        )}
        <strong className="order-line-title">
          {!canAdjust && <span className="order-line-quantity">{item.quantity} ×</span>}{' '}
          <span>{item.name}</span>
        </strong>
        {showPrice && <strong className="order-line-price">{money(total)}</strong>}
      </div>
      {(item.addons?.length > 0 || item.notes) && (
        <div className="order-line-details">
          {item.addons?.length > 0 && (
            <p className="order-line-addons">{item.addons.map((a) => a.name).join(' · ')}</p>
          )}
          {item.notes && (
            <p className="item-notes">
              <MessageSquare size={14} aria-hidden="true" />
              <span>{item.notes}</span>
            </p>
          )}
        </div>
      )}
      {(showStatus || editable || canVoid || canAdjust || onDeliver) && (
        <div className="order-line-actions">
          {showStatus && <Badge value={item.status} />}
          {item.status === 'ready' && onDeliver && (
            <button
              type="button"
              className="btn btn-sm btn-success py-1 px-2"
              onClick={onDeliver}
              title="Marcar pedido entregado a la mesa"
            >
              ✓ Entregar
            </button>
          )}
          {canAdjust && (
            <div
              className="order-line-stepper"
              role="group"
              aria-label={`Modificar cantidad de ${item.name}`}
            >
              <button
                type="button"
                aria-label={`Restar una unidad de ${item.name}`}
                disabled={disabled || item.quantity <= 1}
                onClick={onDecrease}
              >
                <Minus size={16} />
              </button>
              <output aria-label={`Cantidad de ${item.name}`}>{item.quantity}</output>
              <button
                type="button"
                aria-label={`Sumar una unidad de ${item.name}`}
                disabled={disabled || !canIncrease}
                onClick={onIncrease}
              >
                <Plus size={16} />
              </button>
            </div>
          )}
          {editable && (
            <button
              type="button"
              aria-label={item.notes ? 'Editar nota' : 'Nota'}
              title={item.notes ? 'Editar nota' : 'Agregar nota'}
              disabled={disabled}
              onClick={onNote}
            >
              <MessageSquare size={17} />
            </button>
          )}
          {(editable || canVoid) && (
            <div
              className="order-line-more"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setMore(false);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && more) {
                  event.preventDefault();
                  event.stopPropagation();
                  setMore(false);
                  actionsButton.current?.focus();
                }
              }}
            >
              <button
                ref={actionsButton}
                type="button"
                className="order-line-more-toggle"
                aria-label={`Acciones de ${item.name}`}
                title="Más opciones"
                aria-expanded={more}
                disabled={disabled}
                onClick={() => setMore(!more)}
              >
                <MoreHorizontal size={18} />
              </button>
              {more && (
                <div className="order-line-menu">
                  {editable && (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        setMore(false);
                        actionsButton.current?.focus();
                        onEdit();
                      }}
                    >
                      <Pencil size={15} /> Corregir
                    </button>
                  )}
                  {canVoid && (
                    <button
                      type="button"
                      className="danger"
                      disabled={disabled}
                      onClick={() => {
                        setMore(false);
                        actionsButton.current?.focus();
                        onVoid();
                      }}
                    >
                      <Trash2 size={15} /> Anular
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {children}
    </article>
  );
}
