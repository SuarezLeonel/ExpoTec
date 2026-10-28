import { useState } from 'react';
import { Dialog, FieldsForm, type FieldSpec } from '../../components/UI';
import { useStore } from '../../contexts/Store';
import { cents } from '../../services/api';
import { can } from '../../services/permissions';
import type { Account, Item } from '../../types';
export function AccountActions({
  action,
  account,
  selected,
  close,
}: {
  action: string;
  account: Account;
  selected: Item[];
  close: () => void;
}) {
  const { state, command, session, terminal } = useStore();
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(selected.map((i) => [i.id, i.quantity])),
  );
  if (!state || !session) return null;
  const base = { account_id: account.id, version: account.version };
  const fields: FieldSpec[] = [];
  let title = '';
  const opts = state.accounts
    .filter((a) => a.id !== account.id && ['open', 'requested'].includes(a.status))
    .map((a) => ({
      value: a.id,
      label: `${state.tables.find((t) => t.id === a.table_id)?.label || 'Mesa'} · ${a.id.slice(0, 6)}`,
    }));
  if (action === 'move') {
    title = 'Trasladar cuenta';
    fields.push({
      name: 'table_id',
      label: 'Mesa de destino',
      options: state.tables
        .filter((t) => t.active && t.id !== account.table_id)
        .map((t) => ({ value: t.id, label: t.label })),
      required: true,
    });
  }
  if (action === 'update') {
    title = terminal ? 'Comensales' : 'Responsable y comensales';
    fields.push(
      {
        name: 'waiter_id',
        label: 'Camarero',
        value: account.waiter_id,
        options: state.users
          .filter((u) => u.active !== false && u.role === 'waiter')
          .map((u) => ({ value: u.id, label: u.name })),
        required: true,
      },
      {
        name: 'guests',
        label: 'Comensales',
        type: 'number',
        value: account.guests,
        min: 1,
        max: 50,
        required: true,
      },
    );
  }
  if (action === 'transfer') {
    title = 'Trasladar ítems a otra cuenta';
    fields.push({
      name: 'target_account_id',
      label: 'Cuenta de destino',
      options: opts,
      required: true,
    });
  }
  if (action === 'merge') {
    title = 'Agrupar cuentas';
    fields.push({
      name: 'source_account_id',
      label: 'Sumar consumos de esta cuenta',
      options: opts,
      required: true,
    });
  }
  if (action === 'split') title = 'Dividir consumos en otra cuenta';
  if (action === 'discount') {
    title = 'Aplicar descuento';
    fields.push(
      {
        name: 'kind',
        label: 'Tipo',
        value: 'percent',
        options: [
          { value: 'percent', label: 'Porcentaje' },
          { value: 'amount', label: 'Importe en pesos' },
        ],
        required: true,
      },
      {
        name: 'value',
        label: 'Valor (porcentaje o pesos)',
        type: 'money',
        required: true,
      },
      { name: 'reason', label: 'Motivo', required: true, maxLength: 300 },
    );
  }
  if (action === 'void') {
    title = 'Anular ítem';
    fields.push({
      name: 'reason',
      label: 'Motivo de anulación',
      required: true,
      maxLength: 300,
    });
  }
  if (
    (action === 'discount' || action === 'void') &&
    !can(state, action === 'discount' ? 'discount' : 'sensitive_void')
  )
    fields.push(
      { name: 'authorizer', label: 'Usuario que autoriza', required: true },
      {
        name: 'authorization_password',
        label: 'Contraseña del autorizante',
        type: 'password',
        required: true,
      },
    );
  if (action === 'edit') {
    title = 'Corregir ítem';
    fields.push(
      {
        name: 'quantity',
        label: 'Cantidad',
        type: 'number',
        value: selected[0]?.quantity,
        min:
          selected[0]?.status === 'draft' || can(state, 'sensitive_void')
            ? 1
            : selected[0]?.quantity,
        max: 100,
        required: true,
      },
      {
        name: 'notes',
        label: 'Observaciones',
        type: 'textarea',
        value: selected[0]?.notes,
        maxLength: 500,
      },
    );
  }
  return (
    <Dialog title={title} close={close}>
      <p className="small text-secondary">
        Cuenta {account.id.slice(0, 8)} · Los cambios quedan guardados en su historial.
      </p>
      {['split', 'transfer'].includes(action) && (
        <div className="selection-list">
          {selected.map((i) => (
            <label key={i.id}>
              {i.name}
              <input
                className="form-control quantity-control"
                aria-label={`Cantidad a trasladar de ${i.name}`}
                type="number"
                min="1"
                max={i.quantity}
                value={quantities[i.id]}
                onChange={(e) =>
                  setQuantities((p) => ({
                    ...p,
                    [i.id]: Number(e.target.value),
                  }))
                }
              />
              <small>de {i.quantity}</small>
            </label>
          ))}
        </div>
      )}
      {action === 'discount' && (
        <p>
          Alcance: {selected.length === 1 ? `ítem ${selected[0].name}` : 'cuenta completa'}. Un
          porcentaje debe ser un entero de 1 a 100.
        </p>
      )}
      {action === 'void' && (
        <p>
          Se anulará {selected[0]?.name}. Si ya se envió, se genera una corrección para preparación.
        </p>
      )}
      {action === 'merge' && (
        <p>
          La cuenta origen quedará agrupada en esta cuenta. No se permite si existen pagos o
          descuentos.
        </p>
      )}
      <FieldsForm
        fields={
          terminal && action === 'update'
            ? fields.filter((field) => field.name !== 'waiter_id')
            : fields
        }
        label="Confirmar operación"
        submit={async (v) => {
          const selections = selected.map((i) => ({
            item_id: i.id,
            quantity: quantities[i.id],
          }));
          if (
            ['split', 'transfer'].includes(action) &&
            selections.some(
              (s) =>
                !Number.isInteger(s.quantity) ||
                s.quantity < 1 ||
                s.quantity > selected.find((i) => i.id === s.item_id)!.quantity,
            )
          )
            throw new Error('Revisá las cantidades seleccionadas.');
          const authorization = v.authorizer
            ? { username: v.authorizer, password: v.authorization_password }
            : undefined;
          let endpoint = `account.${action}`;
          let body: Record<string, unknown> = { ...base, ...v };
          if (action === 'update') {
            body.guests = Number(v.guests);
            if (terminal) body.waiter_id = account.waiter_id;
          }
          if (action === 'split') body = { ...base, selections };
          if (action === 'transfer') {
            endpoint = 'item.transfer';
            body = {
              ...base,
              target_account_id: v.target_account_id,
              target_version: state.accounts.find((a) => a.id === v.target_account_id)?.version,
              selections,
            };
          }
          if (action === 'merge')
            body.source_version = state.accounts.find((a) => a.id === v.source_account_id)?.version;
          if (action === 'discount') {
            endpoint = 'discount.apply';
            const value = v.kind === 'amount' ? cents(String(v.value)) : Number(v.value);
            if (v.kind === 'percent' && (!Number.isInteger(value) || value < 1 || value > 100))
              throw new Error('El porcentaje debe ser un entero de 1 a 100.');
            body = {
              ...base,
              kind: v.kind,
              value,
              reason: v.reason,
              ...(selected.length === 1 ? { item_id: selected[0].id } : {}),
              ...(authorization ? { authorization } : {}),
            };
          }
          if (action === 'void') {
            endpoint = 'item.void';
            body = {
              ...base,
              item_id: selected[0].id,
              reason: v.reason,
              ...(authorization ? { authorization } : {}),
            };
          }
          if (action === 'edit') {
            endpoint = 'item.edit';
            body = {
              ...base,
              item_id: selected[0].id,
              quantity: Number(v.quantity),
              notes: v.notes,
            };
          }
          await command(endpoint, body);
          close();
        }}
      />
    </Dialog>
  );
}
