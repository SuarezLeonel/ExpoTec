import { useState } from 'react';
import { Printer, FileText, Download, Mail, RotateCcw } from 'lucide-react';
import { useStore } from '../contexts/Store';
import { Badge, Dialog, Empty, FieldsForm, PageHeading } from '../components/UI';
import { FiscalPreview } from '../components/FiscalPreview';
import { can } from '../services/permissions';
import { date, downloadFile, money, post, statusLabel } from '../services/api';
import type { Download as File, Row } from '../types';
export function Services() {
  const { state, command, busy } = useStore();
  const [tab, setTab] = useState('print');
  const [detail, setDetail] = useState<Row | null>(null);
  const [modal, setModal] = useState('');
  const [mail, setMail] = useState<Row[]>([]);
  const [error, setError] = useState('');
  if (!state) return null;
  const rows = tab === 'print' ? state.printJobs : tab === 'invoice' ? state.invoices : state.files;
  const action = (name: string, body: Record<string, unknown>) => {
    void command(name, body).catch((e) => setError(e.message));
  };
  return (
    <>
      <PageHeading eyebrow="ENTORNO LOCAL DE PRUEBAS" title="Servicios de la demo">
        {tab === 'invoice' && can(state, 'cash') && (
          <button className="btn btn-primary" onClick={() => setModal('invoice')}>
            <FileText size={17} /> Preparar comprobante
          </button>
        )}
        {can(state, 'settings') && (
          <button
            className="btn btn-outline-primary"
            onClick={() => {
              void post<{ messages: Row[] }>('demo/mailbox')
                .then((r) => {
                  setMail(r.messages);
                  setModal('mail');
                })
                .catch((e) => setError(e.message));
            }}
          >
            <Mail size={17} /> Bandeja local
          </button>
        )}
      </PageHeading>
      <div className="demo-banner">Impresión, correo y facturación simulados.</div>
      <nav className="category-tabs" aria-label="Servicios">
        <button className={tab === 'print' ? 'active' : ''} onClick={() => setTab('print')}>
          <Printer size={17} /> Impresión
        </button>
        {can(state, 'cash') && (
          <button className={tab === 'invoice' ? 'active' : ''} onClick={() => setTab('invoice')}>
            <FileText size={17} /> Comprobantes
          </button>
        )}
        <button className={tab === 'files' ? 'active' : ''} onClick={() => setTab('files')}>
          <Download size={17} /> Archivos
        </button>
      </nav>
      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}
      <div className="panel">
        {!rows.length ? (
          <Empty>
            {tab === 'print'
              ? 'Todavía no se generaron tickets. Enviá un pedido desde una cuenta.'
              : tab === 'invoice'
                ? 'Todavía no se prepararon comprobantes.'
                : 'Las descargas generadas aparecerán acá.'}
          </Empty>
        ) : (
          <div className="table-responsive">
            <table className="table services-table">
              <thead>
                <tr>
                  <th>Registro</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const status = String(row.status || 'pending');
                  const account = state.accounts.find((account) => account.id === row.account_id);
                  const table = state.tables.find((table) => table.id === account?.table_id);
                  const name =
                    row.name ||
                    statusLabel[String(row.destination)] ||
                    (tab === 'invoice' ? 'Comprobante' : tab === 'print' ? 'Ticket' : 'Archivo');
                  return (
                    <tr key={row.id}>
                      <td>
                        <strong>{String(name)}</strong>
                        {table && <small>Mesa {table.label}</small>}
                        {row.error ? (
                          <small className="invalid-message">{String(row.error)}</small>
                        ) : null}
                      </td>
                      <td>{date(row.created_at, true)}</td>
                      <td>
                        <Badge value={status} />
                      </td>
                      <td>
                        <div className="row-actions">
                          {tab === 'files' ? (
                            <button
                              className="btn btn-sm btn-outline-primary"
                              onClick={() => {
                                void post<File>('files/download', {
                                  id: row.id,
                                })
                                  .then(downloadFile)
                                  .catch((e) => setError(e.message));
                              }}
                            >
                              Descargar copia
                            </button>
                          ) : (
                            <>
                              <button
                                className="btn btn-sm btn-outline-primary"
                                onClick={() => setDetail(row)}
                              >
                                Ver {tab === 'print' ? 'ticket' : 'comprobante'}
                              </button>
                              {['generated', 'prepared'].includes(status) && (
                                <>
                                  <button
                                    disabled={busy}
                                    className="btn btn-sm btn-outline-primary"
                                    onClick={() =>
                                      action(
                                        tab === 'print' ? 'print.process' : 'invoice.process',
                                        { id: row.id, mode: 'success' },
                                      )
                                    }
                                  >
                                    Simular éxito
                                  </button>
                                  <button
                                    disabled={busy}
                                    className="btn btn-sm btn-outline-primary"
                                    onClick={() =>
                                      action(
                                        tab === 'print' ? 'print.process' : 'invoice.process',
                                        {
                                          id: row.id,
                                          mode: tab === 'print' ? 'offline' : 'reject',
                                        },
                                      )
                                    }
                                  >
                                    {tab === 'print' ? 'Simular desconexión' : 'Simular rechazo'}
                                  </button>
                                  <button
                                    disabled={busy}
                                    className="btn btn-sm btn-outline-primary"
                                    onClick={() =>
                                      action(
                                        tab === 'print' ? 'print.process' : 'invoice.process',
                                        { id: row.id, mode: 'uncertain' },
                                      )
                                    }
                                  >
                                    Simular incertidumbre
                                  </button>
                                </>
                              )}
                              {['failed', 'offline', 'rejected', 'reject'].includes(status) && (
                                <button
                                  className="btn btn-sm btn-primary"
                                  disabled={busy}
                                  onClick={() =>
                                    action(tab === 'print' ? 'print.retry' : 'invoice.retry', {
                                      id: row.id,
                                    })
                                  }
                                >
                                  <RotateCcw size={14} /> Reintentar seguro
                                </button>
                              )}
                              {status === 'uncertain' && tab === 'print' && (
                                <button
                                  className="btn btn-sm btn-primary"
                                  disabled={busy}
                                  onClick={() =>
                                    action('print.process', {
                                      id: row.id,
                                      mode: 'success',
                                    })
                                  }
                                >
                                  Consultar resultado simulado
                                </button>
                              )}
                              {status === 'uncertain' && tab === 'invoice' && (
                                <button
                                  className="btn btn-sm btn-primary"
                                  disabled={busy}
                                  onClick={() => action('invoice.resolve', { id: row.id })}
                                >
                                  Consultar resultado
                                </button>
                              )}
                              {tab === 'print' && (
                                <button
                                  className="btn btn-sm btn-outline-primary"
                                  onClick={() => {
                                    setDetail(row);
                                    setModal('copy');
                                  }}
                                >
                                  Crear copia con motivo
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {can(state, 'settings') && (
          <button className="btn btn-outline-danger mt-4" onClick={() => setModal('reset')}>
            Restaurar datos de demostración
          </button>
        )}
      </div>
      {detail && modal !== 'copy' && (
        <Dialog
          title={tab === 'print' ? 'Ticket de preparación' : 'Demostración. Sin validez fiscal'}
          close={() => setDetail(null)}
        >
          {tab === 'invoice' ? (
            <FiscalPreview invoice={detail} />
          ) : (
            <pre className="ticket-preview">
              {typeof detail.content === 'string'
                ? detail.content
                : typeof detail.ticket === 'string'
                  ? detail.ticket
                  : JSON.stringify(detail, null, 2)}
            </pre>
          )}
        </Dialog>
      )}
      {modal === 'copy' && detail && (
        <Dialog
          title="Reimpresión identificada como copia"
          close={() => {
            setModal('');
            setDetail(null);
          }}
        >
          <FieldsForm
            fields={[
              {
                name: 'reason',
                label: 'Motivo de la copia',
                required: true,
                maxLength: 300,
              },
            ]}
            label="Generar copia auditada"
            submit={async (v) => {
              await command('print.copy', { id: detail.id, reason: v.reason });
              setModal('');
              setDetail(null);
            }}
          />
        </Dialog>
      )}
      {modal === 'invoice' && (
        <Dialog title="Preparar comprobante de prueba" close={() => setModal('')}>
          <div className="alert alert-warning">Demostración. Sin validez fiscal.</div>
          <FieldsForm
            fields={[
              {
                name: 'account_id',
                label: 'Cuenta',
                required: true,
                options: state.accounts.map((a) => ({
                  value: a.id,
                  label: `${state.tables.find((t) => t.id === a.table_id)?.label} · ${money(a.total_cents)} · ${a.id.slice(0, 6)}`,
                })),
              },
              {
                name: 'recipient_name',
                label: 'Receptor',
                value: 'Consumidor final',
                required: true,
                minLength: 2,
                maxLength: 100,
                pattern: "^[\\p{L}\\p{M} '\u2019]{2,100}$",
                help: 'Entre 2 y 100 caracteres: letras, espacios o apóstrofes.',
              },
              {
                name: 'recipient_document',
                label: 'Documento ficticio del receptor',
                value: '00000000',
                maxLength: 20,
                pattern: '^[0-9 -]{0,20}$',
              },
              {
                name: 'kind',
                label: 'Comprobante de prueba',
                value: 'B',
                required: true,
                options: [
                  { value: 'B', label: 'Factura B — demostración' },
                  { value: 'A', label: 'Factura A — demostración' },
                  { value: 'C', label: 'Factura C — demostración' },
                ],
              },
            ]}
            label="Preparar sin emitir"
            submit={async (v) => {
              await command('invoice.prepare', {
                ...v,
                version: state.accounts.find((a) => a.id === v.account_id)?.version,
              });
              setModal('');
            }}
          />
        </Dialog>
      )}
      {modal === 'reset' && (
        <Dialog title="Restaurar la demostración" close={() => setModal('')}>
          <p>Se borrarán las operaciones de la demo y se cerrarán todas las sesiones.</p>
          <FieldsForm
            fields={[
              {
                name: 'confirmation',
                label: 'Escribí RESTAURAR DEMO',
                required: true,
                pattern: '^RESTAURAR DEMO$',
              },
            ]}
            label="Confirmar restauración"
            submit={async (v) => {
              await post('demo/reset', v);
              location.assign('/');
            }}
          />
        </Dialog>
      )}
      {modal === 'mail' && (
        <Dialog title="Bandeja de correo local" close={() => setModal('')}>
          <p>Correo simulado. Acceso del encargado.</p>
          {!mail.length ? (
            <Empty>No hay solicitudes de recuperación.</Empty>
          ) : (
            mail.map((m) => (
              <article className="mail-entry" key={m.id}>
                <strong>{String(m.username)}</strong>
                <label>
                  Token de un solo uso
                  <input readOnly className="form-control" value={String(m.token)} />
                </label>
                <small>Vence {date(m.expires_at, true)}</small>
              </article>
            ))
          )}
        </Dialog>
      )}
    </>
  );
}
