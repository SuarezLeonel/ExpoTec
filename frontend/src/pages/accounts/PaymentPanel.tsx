import { useState } from 'react';
import { Dialog, FieldsForm, Badge } from '../../components/UI';
import { useStore } from '../../contexts/Store';
import { cents, money, post } from '../../services/api';
import type { Account, Item } from '../../types';
export function PaymentPanel({
  account,
  selected,
  close,
}: {
  account: Account;
  selected: Item[];
  close: () => void;
}) {
  const { command, state, pending } = useStore();
  const [quote, setQuote] = useState<{
    parts: number[];
    amount_cents: number;
  } | null>(null);
  const [error, setError] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(selected.map((i) => [i.id, i.quantity])),
  );
  const [amountTouched, setAmountTouched] = useState(false);
  const [receivedTouched, setReceivedTouched] = useState(false);
  const [kind, setKind] = useState('amount');
  const [parts, setParts] = useState(2);
  const [part, setPart] = useState(1);
  const [method, setMethod] = useState('cash');
  const [amount, setAmount] = useState((account.balance_cents / 100).toFixed(2));
  const [received, setReceived] = useState('');
  const [busy, setBusy] = useState(false);
  const uncertain = pending.some(
    (p) => p.action === 'payment.add' && p.body.account_id === account.id && p.state !== 'failed',
  );
  const paid = state?.payments.filter((p) => p.account_id === account.id) || [];
  let amountError = '';
  let receivedError = '';
  try {
    const n = cents(amount);
    if (n <= 0 || n > account.balance_cents)
      amountError = 'Ingresá un importe mayor a cero que no supere el saldo.';
  } catch (e) {
    amountError = (e as Error).message;
  }
  if (method === 'cash' && received) {
    try {
      if (cents(received) < cents(amount))
        receivedError = 'El efectivo recibido no cubre el importe aplicado.';
    } catch (e) {
      receivedError = (e as Error).message;
    }
  }
  let change = 0;
  try {
    change = cents(received || amount) - cents(amount);
  } catch {
    /* Inline field reports validation on submit. */
  }
  return (
    <Dialog title="Cobrar cuenta" close={close}>
      <div className="payment-balance">
        <span>Saldo a cobrar</span>
        <strong>{money(account.balance_cents)}</strong>
      </div>
      <p className="small text-secondary">Pago simulado.</p>
      {paid.map((p) => (
        <div className="payment-history" key={p.id}>
          <Badge value={String(p.method)} />
          <strong>{money(p.amount_cents)}</strong>
          <span>Confirmado</span>
        </div>
      ))}
      <label className="form-label" htmlFor="split-kind">
        Cómo cobrar
      </label>
      <select
        id="split-kind"
        className="form-select mb-3"
        value={kind}
        onChange={(e) => {
          setKind(e.target.value);
          setQuote(null);
        }}
      >
        <option value="amount">Importe / pago parcial</option>
        <option value="equal">Partes iguales</option>
        <option value="items">Ítems seleccionados ({selected.length})</option>
      </select>
      {kind === 'equal' && (
        <div className="field-grid mb-3">
          <label>
            Partes
            <input
              className="form-control"
              type="number"
              min="2"
              max="30"
              value={parts}
              onChange={(e) => {
                setParts(Number(e.target.value));
                setQuote(null);
              }}
            />
          </label>
          <label>
            Parte a cobrar
            <input
              className="form-control"
              type="number"
              min="1"
              max={parts}
              value={part}
              onChange={(e) => {
                setPart(Number(e.target.value));
                setQuote(null);
              }}
            />
          </label>
        </div>
      )}
      {kind === 'items' && (
        <div className="selection-list">
          {selected.map((i) => (
            <label key={i.id}>
              {i.name}
              <input
                className="form-control quantity-control"
                aria-label={`Cantidad a cobrar de ${i.name}`}
                type="number"
                min="1"
                max={i.quantity}
                value={quantities[i.id]}
                onChange={(e) => {
                  setQuantities((p) => ({
                    ...p,
                    [i.id]: Number(e.target.value),
                  }));
                  setQuote(null);
                }}
              />
              <small>de {i.quantity}</small>
            </label>
          ))}
        </div>
      )}
      {kind !== 'amount' && (
        <button
          className="btn btn-outline-primary mb-3"
          disabled={busy || (kind === 'items' && !selected.length)}
          onClick={() => {
            setBusy(true);
            setError('');
            void post<{ parts: number[]; amount_cents: number }>('accounts/quote', {
              account_id: account.id,
              ...(kind === 'equal'
                ? { parts }
                : {
                    selections: selected.map((i) => ({
                      item_id: i.id,
                      quantity: quantities[i.id],
                    })),
                  }),
            })
              .then((q) => {
                setQuote(q);
                setAmount(
                  ((kind === 'equal' ? q.parts[part - 1] : q.amount_cents) / 100).toFixed(2),
                );
              })
              .catch((e) => setError(e.message))
              .finally(() => setBusy(false));
          }}
        >
          Calcular
        </button>
      )}
      {quote && (
        <p className="small">
          {kind === 'equal'
            ? `Partes: ${quote.parts.map((v) => money(v)).join(' · ')}`
            : `Selección: ${money(quote.amount_cents)}`}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError('');
          try {
            const amount_cents = cents(amount);
            if (amount_cents <= 0 || amount_cents > account.balance_cents)
              throw new Error('El importe debe ser mayor a cero y no superar el saldo.');
            if (kind !== 'amount' && !quote)
              throw new Error('Calculá la división antes de confirmar.');
            const received_cents = method === 'cash' ? cents(received || amount) : undefined;
            if (received_cents !== undefined && received_cents < amount_cents)
              throw new Error('El efectivo recibido no cubre el importe aplicado.');
            setBusy(true);
            void command('payment.add', {
              account_id: account.id,
              version: account.version,
              amount_cents,
              method,
              ...(received_cents !== undefined ? { received_cents } : {}),
              split: {
                kind,
                ...(kind === 'equal' ? { parts, part } : {}),
                ...(kind === 'items'
                  ? {
                      selections: selected.map((i) => ({
                        item_id: i.id,
                        quantity: quantities[i.id],
                      })),
                    }
                  : {}),
              },
            })
              .then(close)
              .catch((err) => setError(err.message))
              .finally(() => setBusy(false));
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Revisá el importe.');
          }
        }}
      >
        <div className="field-grid">
          <label>
            Medio de pago
            <select
              className="form-select"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option value="cash">Efectivo</option>
              <option value="debit">Débito</option>
              <option value="credit">Crédito</option>
              <option value="transfer">Transferencia</option>
            </select>
          </label>
          <label>
            Importe aplicado ($)
            <input
              className="form-control"
              inputMode="decimal"
              required
              aria-invalid={amountTouched && Boolean(amountError)}
              aria-describedby="payment-amount-error"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setAmountTouched(true);
              }}
            />
          </label>
          {method === 'cash' && (
            <label>
              Efectivo recibido ($)
              <input
                className="form-control"
                inputMode="decimal"
                aria-invalid={receivedTouched && Boolean(receivedError)}
                aria-describedby="payment-received-error"
                value={received}
                onChange={(e) => {
                  setReceived(e.target.value);
                  setReceivedTouched(true);
                }}
              />
              <small>Vacío: importe exacto.</small>
              <small id="payment-received-error" className="invalid-message">
                {receivedTouched && receivedError}
              </small>
            </label>
          )}
        </div>
        <small id="payment-amount-error" className="invalid-message">
          {amountTouched && amountError}
        </small>
        {method === 'cash' && (
          <p className="change">
            Vuelto: <strong>{money(Math.max(0, change))}</strong>
          </p>
        )}
        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}
        {uncertain && (
          <div className="alert alert-warning">
            Cobro sin confirmar. Revisá Pendientes antes de volver a cobrar.
          </div>
        )}
        <button className="btn btn-primary w-100 mt-3" disabled={busy || uncertain} type="submit">
          {busy
            ? 'Esperando confirmación…'
            : `Confirmar cobro ${money(
                (() => {
                  try {
                    return cents(amount);
                  } catch {
                    return 0;
                  }
                })(),
              )}`}
        </button>
      </form>
    </Dialog>
  );
}
export function RefundPanel({ account, close }: { account: Account; close: () => void }) {
  const { state, command } = useStore();
  if (!state) return null;
  return (
    <Dialog title="Registrar reintegro / devolución" close={close}>
      <p>Elegí el pago y el importe a reintegrar.</p>
      <FieldsForm
        fields={[
          {
            name: 'payment_id',
            label: 'Pago original',
            required: true,
            options: state.payments
              .filter((p) => p.account_id === account.id)
              .map((p) => ({
                value: p.id,
                label: `${String(p.method)} · ${money(p.amount_cents)} · ${p.id.slice(0, 6)}`,
              })),
          },
          {
            name: 'amount_cents',
            label: 'Importe del reintegro ($)',
            type: 'money',
            required: true,
          },
          {
            name: 'item_id',
            label: 'Producto devuelto (opcional)',
            options: state.items
              .filter((i) => i.account_id === account.id && i.status !== 'void')
              .map((i) => ({
                value: i.id,
                label: `${i.name} · ${i.quantity}`,
              })),
          },
          {
            name: 'quantity',
            label: 'Cantidad devuelta',
            type: 'number',
            min: 1,
            max: 100,
            value: 1,
          },
          {
            name: 'return_product',
            label: 'Se devuelve el producto',
            type: 'checkbox',
          },
          { name: 'reason', label: 'Motivo', required: true, maxLength: 300 },
        ]}
        label="Confirmar reintegro"
        submit={async (v) => {
          if (v.return_product && !v.item_id) throw new Error('Seleccioná el producto devuelto.');
          await command('refund.add', {
            account_id: account.id,
            version: account.version,
            payment_id: v.payment_id,
            amount_cents: cents(String(v.amount_cents)),
            ...(v.item_id ? { item_id: v.item_id, quantity: Number(v.quantity) } : {}),
            return_product: v.return_product,
            reason: v.reason,
          });
          close();
        }}
      />
    </Dialog>
  );
}
