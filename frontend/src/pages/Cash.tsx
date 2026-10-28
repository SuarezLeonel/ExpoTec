import { useEffect, useState } from 'react';
import { Wallet, Download, Plus, LockKeyhole } from 'lucide-react';
import { useStore } from '../contexts/Store';
import { Badge, Dialog, Empty, FieldsForm, PageHeading } from '../components/UI';
import { cents, date, downloadFile, money, post } from '../services/api';
import type { Download as File } from '../types';
import { AccountPanel } from './accounts/AccountPanel';
export function Cash() {
  const { state, command, busy } = useStore();
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [panel, setPanel] = useState('');
  const [accountId, setAccountId] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void post<Record<string, unknown>>('cash/summary', {}, undefined, undefined, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        setSummary(value);
        setError('');
      })
      .catch((e: Error) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [state]);
  if (!state) return null;
  const current = state.cashSessions.find((s) => !s.closed_at && s.status !== 'closed');
  const selected = state.accounts.find((a) => a.id === accountId);
  const accounts = state.accounts.filter((a) =>
    showClosed ? a.status === 'closed' : ['open', 'requested'].includes(a.status),
  );
  return (
    <>
      <PageHeading eyebrow="COBROS Y MOVIMIENTOS" title="La caja">
        <button
          className="btn btn-outline-primary"
          disabled={busy}
          onClick={() => {
            void command('report.export', { kind: 'cash' })
              .then((result) =>
                post<File>('files/download', {
                  id: (result as { id: string }).id,
                }),
              )
              .then(downloadFile)
              .catch((e) => setError(e.message));
          }}
        >
          <Download size={17} /> Exportar resumen
        </button>
        {current ? (
          <button className="btn btn-primary" onClick={() => setPanel('move')}>
            <Plus size={17} /> Movimiento
          </button>
        ) : (
          <button className="btn btn-primary" onClick={() => setPanel('open')}>
            <Wallet size={17} /> Abrir caja
          </button>
        )}
      </PageHeading>
      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}
      <div className="cash-layout">
        <section>
          <div className="cash-summary panel">
            <div className="section-heading">
              <h2>{current ? 'Turno abierto' : 'Sin turno abierto'}</h2>
              <Badge value={current ? 'open' : 'closed'} />
            </div>
            <p className="small text-secondary">
              {current
                ? `Apertura ${date(current.created_at || current.opened_at, true)}`
                : 'Abrí la caja para cobrar.'}
            </p>
            {summary && (
              <div className="summary-rows">
                {Object.entries(summary)
                  .filter(([, value]) => typeof value === 'number' || typeof value === 'string')
                  .map(([key, value]) => (
                    <div key={key}>
                      <span>
                        {(
                          {
                            expected_cents: 'Efectivo esperado',
                            opening_cents: 'Fondo inicial',
                            cash_cents: 'Cobros en efectivo',
                            refunds_cents: 'Reintegros',
                            movements_cents: 'Movimientos netos',
                            total_cents: 'Total cobrado',
                            in_cents: 'Ingresos',
                            out_cents: 'Egresos',
                            debit_cents: 'Débito',
                            credit_cents: 'Crédito',
                            transfer_cents: 'Transferencia',
                            counted_cents: 'Contado',
                            difference_cents: 'Diferencia',
                            cash_payments_cents: 'Cobros en efectivo',
                            cash_refunds_cents: 'Reintegros en efectivo',
                          } as Record<string, string>
                        )[key] || key.replaceAll('_', ' ')}
                      </span>
                      <strong>{key.endsWith('cents') ? money(value) : String(value)}</strong>
                    </div>
                  ))}
              </div>
            )}
            {summary && summary.by_method && Array.isArray(summary.by_method) ? (
              <div className="summary-rows">
                {(summary.by_method as Record<string, unknown>[]).map((row) => (
                  <div key={String(row.method)}>
                    <span>
                      {(
                        {
                          cash: 'Efectivo',
                          debit: 'Débito',
                          credit: 'Crédito',
                          transfer: 'Transferencia',
                        } as Record<string, string>
                      )[String(row.method)] || String(row.method)}
                    </span>
                    <strong>{money(row.net_cents)}</strong>
                  </div>
                ))}
              </div>
            ) : null}
            {summary?.blockers &&
            typeof summary.blockers === 'object' &&
            !Array.isArray(summary.blockers) ? (
              <div className="small text-secondary mt-3">
                {Object.entries(summary.blockers).map(([key, value]) => (
                  <p className="mb-1" key={key}>
                    {(
                      {
                        open_accounts: 'Cuentas abiertas',
                        pending_prints: 'Impresiones sin resolver',
                        pending_invoices: 'Comprobantes sin resolver',
                      } as Record<string, string>
                    )[key] || key}
                    : {String(value)}
                  </p>
                ))}
              </div>
            ) : null}
            {summary && Array.isArray(summary.blockers) && summary.blockers.length > 0 && (
              <div className="alert alert-warning mt-3">
                <strong>Pendientes para el cierre</strong>
                <ul className="mb-0">
                  {summary.blockers.map((b, i) => (
                    <li key={i}>{typeof b === 'string' ? b : JSON.stringify(b)}</li>
                  ))}
                </ul>
              </div>
            )}
            {current && (
              <button className="btn btn-outline-primary mt-3" onClick={() => setPanel('close')}>
                <LockKeyhole size={17} /> Arquear y cerrar caja
              </button>
            )}
          </div>
          <div className="panel mt-4">
            <h2>Movimientos del turno</h2>
            {state.cashMovements.length ? (
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Concepto</th>
                      <th>Tipo</th>
                      <th className="text-end">Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.cashMovements.map((m) => (
                      <tr key={m.id}>
                        <td>{date(m.created_at, true)}</td>
                        <td>{String(m.concept)}</td>
                        <td>{m.kind === 'in' ? 'Ingreso' : 'Egreso'}</td>
                        <td className="text-end">{money(m.amount_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>Todavía no hay movimientos de caja.</Empty>
            )}
          </div>
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>Cuentas</h2>
            <label className="small">
              <input
                type="checkbox"
                checked={showClosed}
                onChange={(e) => setShowClosed(e.target.checked)}
              />{' '}
              Ver cerradas
            </label>
          </div>
          {accounts.length ? (
            <div className="cash-accounts">
              {accounts.map((a) => (
                <button
                  key={a.id}
                  className={accountId === a.id ? 'active' : ''}
                  onClick={() => setAccountId(a.id)}
                >
                  <strong>{state.tables.find((t) => t.id === a.table_id)?.label}</strong>
                  <Badge value={a.status} />
                  <span>{money(a.balance_cents)}</span>
                  <small>{date(a.created_at)}</small>
                </button>
              ))}
            </div>
          ) : (
            <Empty>No hay cuentas {showClosed ? 'cerradas' : 'abiertas'}.</Empty>
          )}
          {selected && <AccountPanel account={selected} />}
        </section>
      </div>
      {panel && (
        <Dialog
          title={
            panel === 'open'
              ? 'Abrir caja'
              : panel === 'move'
                ? 'Registrar movimiento'
                : 'Arqueo y cierre'
          }
          close={() => setPanel('')}
        >
          <FieldsForm
            fields={
              panel === 'open'
                ? [
                    {
                      name: 'opening_cents',
                      label: 'Fondo inicial ($)',
                      type: 'money',
                      required: true,
                      value: '0',
                    },
                  ]
                : panel === 'move'
                  ? [
                      {
                        name: 'kind',
                        label: 'Movimiento',
                        options: [
                          { value: 'in', label: 'Ingreso' },
                          { value: 'out', label: 'Egreso' },
                        ],
                        required: true,
                        value: 'out',
                      },
                      {
                        name: 'amount_cents',
                        label: 'Importe ($)',
                        type: 'money',
                        required: true,
                      },
                      {
                        name: 'concept',
                        label: 'Concepto',
                        required: true,
                        maxLength: 300,
                      },
                    ]
                  : [
                      {
                        name: 'counted_cents',
                        label: 'Efectivo contado ($)',
                        type: 'money',
                        required: true,
                      },
                    ]
            }
            label={panel === 'close' ? 'Confirmar arqueo y cierre' : 'Guardar'}
            submit={async (v) => {
              const body: Record<string, unknown> = { ...v };
              for (const key of ['opening_cents', 'amount_cents', 'counted_cents'])
                if (v[key] !== undefined) body[key] = cents(String(v[key]));
              await command(`cash.${panel}`, body);
              setPanel('');
            }}
          />
          {panel === 'close' && (
            <p className="small text-secondary">
              El servidor calcula la diferencia y bloquea el cierre con cuentas abiertas o
              resultados externos inciertos.
            </p>
          )}
        </Dialog>
      )}
    </>
  );
}
