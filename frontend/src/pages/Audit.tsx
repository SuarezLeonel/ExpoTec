import { useState } from 'react';
import { Download } from 'lucide-react';
import { useStore } from '../contexts/Store';
import { Empty, FieldsForm, PageHeading } from '../components/UI';
import { date, downloadFile, post, operationLabel } from '../services/api';
import type { Download as File, Row } from '../types';
export function Audit() {
  const { state, command } = useStore();
  const [events, setEvents] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  return (
    <>
      <PageHeading eyebrow="HISTORIAL INMUTABLE" title="Auditoría">
        <button
          className="btn btn-outline-primary"
          onClick={() => {
            void command('report.export', { kind: 'audit' })
              .then((r) => post<File>('files/download', { id: (r as { id: string }).id }))
              .then(downloadFile)
              .catch((e) => setError(e.message));
          }}
        >
          <Download size={17} /> Exportar copia
        </button>
      </PageHeading>
      <div className="panel">
        <FieldsForm
          fields={[
            {
              name: 'user_id',
              label: 'Usuario',
              options: state?.users.map((u) => ({
                value: u.id,
                label: u.name,
              })),
            },
            { name: 'from', label: 'Desde', type: 'date' },
            { name: 'to', label: 'Hasta', type: 'date' },
            {
              name: 'entity',
              label: 'Entidad',
              help: 'Ej.: account, item, payment.',
            },
            {
              name: 'operation',
              label: 'Operación',
              help: 'Ej.: payment.add, item.void.',
            },
          ]}
          label="Consultar historial"
          submit={async (values) => {
            const body = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== ''));
            const data = await post<{ events: Row[] }>('audit/query', body);
            setEvents(data.events);
          }}
        />
      </div>
      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}
      <div className="panel mt-4">
        {events === null ? (
          <Empty>Elegí los filtros y consultá las acciones del turno.</Empty>
        ) : !events.length ? (
          <Empty>No hay eventos con esos filtros.</Empty>
        ) : (
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha y hora</th>
                  <th>Operación</th>
                  <th>Responsable</th>
                  <th>Entidad</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td>{date(e.created_at, true)}</td>
                    <td>
                      {operationLabel[String(e.operation || e.action)] ||
                        String(e.operation || e.action || '')}
                    </td>
                    <td>
                      {state?.users.find((u) => u.id === e.user_id)?.name ||
                        String(e.user_id || '')}
                      {e.authorized_by ? (
                        <small>
                          Autoriza{' '}
                          {state?.users.find((u) => u.id === e.authorized_by)?.name ||
                            String(e.authorized_by)}
                        </small>
                      ) : null}
                    </td>
                    <td>{String(e.entity || '')}</td>
                    <td>
                      <details>
                        <summary>Ver valores</summary>
                        <pre className="audit-detail">{JSON.stringify(e, null, 2)}</pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
