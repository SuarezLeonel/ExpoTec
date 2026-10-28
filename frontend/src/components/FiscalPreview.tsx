import { money } from '../services/api';
import type { Row } from '../types';
export function FiscalPreview({ invoice }: { invoice: Row }) {
  const snapshot =
    invoice.details && typeof invoice.details === 'object'
      ? (invoice.details as Record<string, unknown>)
      : invoice;
  const concepts = Array.isArray(snapshot.concepts)
    ? (snapshot.concepts as Record<string, unknown>[])
    : [];
  return (
    <article className="fiscal-preview">
      <p className="demo-banner">
        <strong>Demostración. Sin validez fiscal</strong>
      </p>
      <h3>Emisor ficticio · Demo</h3>
      <p className="small">
        Sucursal de demostración · Sin conexión con ARCA
        <br />
        Documento interno {String(invoice.document_number || invoice.id).slice(0, 36)}
      </p>
      <dl className="summary-rows">
        <div>
          <dt>Tipo</dt>
          <dd>{String(invoice.kind || 'Comprobante de prueba')}</dd>
        </div>
        <div>
          <dt>Receptor</dt>
          <dd>{String(invoice.recipient_name || 'Consumidor final')}</dd>
        </div>
        <div>
          <dt>Documento ficticio</dt>
          <dd>{String(invoice.recipient_document || '—')}</dd>
        </div>
      </dl>
      {concepts.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Concepto</th>
              <th>Cantidad</th>
              <th>Importe</th>
            </tr>
          </thead>
          <tbody>
            {concepts.map((item, i) => (
              <tr key={i}>
                <td>{String(item.name || item.description || '')}</td>
                <td>{Number(item.quantity || 1)}</td>
                <td>
                  {money(
                    item.line_cents ??
                      item.total_cents ??
                      Number(item.unit_cents || 0) * Number(item.quantity || 1),
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="payment-balance">
        <span>Importe de prueba</span>
        <strong>{money(invoice.amount_cents)}</strong>
      </div>
      <p className="small text-secondary">
        La confirmación del simulador no constituye una emisión fiscal, un CAE ni una homologación.
      </p>
    </article>
  );
}
