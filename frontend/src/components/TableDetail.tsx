import { Settings2, X } from 'lucide-react';
import { useStore } from '../contexts/Store';
import { can } from '../services/permissions';
import { FieldsForm } from './UI';
import { AccountPanel } from '../pages/accounts/AccountPanel';
import type { Table } from '../types';
export function TableDetail({
  table,
  edit,
  close,
}: {
  table: Table;
  edit: () => void;
  close: () => void;
}) {
  const { state, session, command } = useStore();
  if (!state || !session) return null;
  const accounts = state.accounts.filter(
    (a) => a.table_id === table.id && ['open', 'requested'].includes(a.status),
  );
  const waiters = state.users.filter((u) => u.active !== false && u.role === 'waiter');
  return (
    <>
      <div className="inspector-top">
        <div>
          <p className="eyebrow">{table.sector}</p>
          <h2>Mesa {table.label}</h2>
        </div>
        <div className="d-flex gap-1">
          {can(state, 'manage_tables') && (
            <button className="icon-button" aria-label={`Configurar ${table.label}`} onClick={edit}>
              <Settings2 size={19} />
            </button>
          )}
          <button className="icon-button" aria-label="Cerrar detalle de mesa" onClick={close}>
            <X size={21} />
          </button>
        </div>
      </div>
      {accounts.map((account) => (
        <AccountPanel key={account.id} account={account} />
      ))}
      {!accounts.length && (
        <>
          <p className="table-open-hint">
            Libre · {table.capacity} lugares. Abrí la cuenta para tomar el pedido.
          </p>
          <FieldsForm
            key={table.id}
            fields={[
              {
                name: 'guests',
                label: 'Comensales',
                type: 'number',
                value: 1,
                min: 1,
                max: table.capacity,
                required: true,
              },
              {
                name: 'waiter_id',
                label: 'Camarero',
                value:
                  session.user.role === 'waiter'
                    ? session.user.id
                    : waiters.length === 1
                      ? waiters[0].id
                      : '',
                options: waiters.map((u) => ({ value: u.id, label: u.name })),
                required: true,
              },
            ]}
            label="Abrir cuenta"
            submit={(v) =>
              command('account.open', {
                table_id: table.id,
                guests: Number(v.guests),
                waiter_id: v.waiter_id,
              })
            }
          />
        </>
      )}
    </>
  );
}
