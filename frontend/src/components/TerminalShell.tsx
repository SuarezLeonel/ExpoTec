import { useEffect, useState } from 'react';
import { BookOpen, Settings, Wifi, WifiOff, X } from 'lucide-react';
import { useStore } from '../contexts/Store';
import { Dialog, Confirm, Badge } from './UI';
import { ThemeSelector } from './ThemeSelector';
import { Salon } from '../pages/Salon';
import { date, operationLabel } from '../services/api';
import type { Pending } from '../types';
import { pendingForTable } from '../services/pending';
export function TerminalShell() {
  const store = useStore();
  const { session, state, loading, error, notice, online, pending, busy } = store;
  const [queue, setQueue] = useState(false);
  const [discard, setDiscard] = useState<Pending | null>(null);
  const [rebase, setRebase] = useState<Pending | null>(null);
  const visiblePending = store.activeTableId
    ? pendingForTable(pending, store.activeTableId)
    : pending;
  useEffect(() => {
    const show = () => setQueue(true);
    window.addEventListener('baguette:show-pending', show);
    return () => window.removeEventListener('baguette:show-pending', show);
  }, []);
  return (
    <div className="terminal-shell">
      <a className="skip-link" href="#main-content">
        Ir al salón
      </a>
      <header className="terminal-header">
        <a href="/" className="terminal-brand" aria-label="Terminal de salón">
          <img src="/brand/baguette-logo.svg" alt="Café" width="208" height="79" />
        </a>
        <span className="terminal-caption">
          Salón <small>Demo</small>
        </span>
        <nav aria-label="Accesos del terminal">
          <button
            className="terminal-connection"
            onClick={() => setQueue(true)}
            aria-label={`${online ? 'En línea' : 'Sin conexión'}, ${pending.length} pendientes`}
          >
            {online ? <Wifi size={17} /> : <WifiOff size={17} />}
            <span>{online ? 'En línea' : 'Sin conexión'}</span>
            {pending.length > 0 && <strong>{pending.length}</strong>}
          </button>
          <a
            className="terminal-header-link"
            href="/carta"
            target="_blank"
            rel="noreferrer"
            aria-label="Carta pública"
          >
            <BookOpen size={17} />
            <span>Carta</span>
          </a>
          <a
            className="terminal-header-link management-link"
            href="/gestion"
            target="_blank"
            rel="noreferrer"
          >
            <Settings size={17} />
            <span>Gestión</span>
          </a>
          <ThemeSelector compact />
        </nav>
      </header>
      <main id="main-content" className="terminal-main" tabIndex={-1}>
        {loading ? (
          <div className="terminal-unavailable" role="status">
            Preparando el salón…
          </div>
        ) : session && state ? (
          <Salon />
        ) : (
          <div className="terminal-unavailable">
            <h1>Terminal de salón</h1>
            <p>Conectate para ingresar con tu PIN.</p>
            <button className="btn btn-primary" onClick={() => location.reload()}>
              Reintentar conexión
            </button>
          </div>
        )}
      </main>
      {(error || notice) && !store.activeTableId && (
        <div
          className={`terminal-notice alert ${error ? 'alert-danger' : 'alert-success'}`}
          role={error ? 'alert' : 'status'}
        >
          <span>{error || notice}</span>
          <button className="icon-button" aria-label="Cerrar mensaje" onClick={store.clear}>
            <X size={16} />
          </button>
        </div>
      )}
      {queue && (
        <Dialog title="Pendientes" close={() => setQueue(false)} wide>
          {!store.operator && <p>Ingresá a una mesa para ver tus pendientes.</p>}
          {!visiblePending.length ? (
            <p className="alert alert-success">No tenés operaciones pendientes.</p>
          ) : (
            visiblePending.map((entry) => (
              <article className="pending-entry" key={entry.key}>
                <div>
                  <strong>{operationLabel[entry.action] || 'Operación'}</strong>
                  <Badge value={entry.state} />
                </div>
                {entry.table_id && (
                  <p>
                    Mesa{' '}
                    {state?.tables.find((table) => table.id === entry.table_id)?.label ||
                      entry.table_id}
                  </p>
                )}
                <small>{date(entry.created_at, true)}</small>
                {entry.error && <p className="invalid-message">{entry.error}</p>}
                {entry.preview && (
                  <ul>
                    {entry.preview.map((item) => (
                      <li key={item.id}>
                        {item.quantity} × {item.name}
                        {item.notes ? ` · ${item.notes}` : ''}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="row-actions">
                  <button
                    className="btn btn-sm btn-primary"
                    disabled={busy || !online || store.sendingKeys.includes(entry.key)}
                    onClick={() => {
                      void store.retry(entry);
                    }}
                  >
                    {store.sendingKeys.includes(entry.key) ? 'Enviando…' : 'Sincronizar'}
                  </button>
                  {entry.state === 'failed' && (
                    <>
                      <button
                        className="btn btn-sm btn-outline-danger"
                        disabled={busy}
                        onClick={() => setDiscard(entry)}
                      >
                        Descartar
                      </button>
                      {['item.add', 'order.submit'].includes(entry.action) && (
                        <button
                          className="btn btn-sm btn-outline-primary"
                          disabled={busy || !online}
                          onClick={() => setRebase(entry)}
                        >
                          Actualizar
                        </button>
                      )}
                    </>
                  )}
                </div>
              </article>
            ))
          )}
        </Dialog>
      )}
      {discard && (
        <Confirm
          title="Descartar solicitud rechazada"
          text="Se elimina el pendiente local rechazado. No se elimina ninguna operación del servidor."
          close={() => setDiscard(null)}
          proceed={async () => store.discard(discard)}
        />
      )}{' '}
      {rebase && (
        <Confirm
          title="Actualizar pedido pendiente"
          text="Se consultará si el pedido ya se guardó. Si fue rechazado, se reintentará con la versión actual de la cuenta y los precios y disponibilidad vigentes."
          close={() => setRebase(null)}
          proceed={() => store.rebase(rebase)}
        />
      )}
    </div>
  );
}
