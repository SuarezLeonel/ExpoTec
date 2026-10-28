import { useEffect, useState } from 'react';
import {
  LayoutGrid,
  Wallet,
  BookOpen,
  Users,
  PenTool,
  Printer,
  History,
  Menu as MenuIcon,
  LogOut,
  Wifi,
  WifiOff,
  X,
  ArrowUpRight,
} from 'lucide-react';
import { useStore } from './contexts/Store';
import { Badge, Confirm, Dialog } from './components/UI';
import { ThemeSelector } from './components/ThemeSelector';
import { can } from './services/permissions';
import { date, statusLabel, operationLabel } from './services/api';
import { pendingForTable } from './services/pending';
import type { Pending } from './types';
import { TerminalShell } from './components/TerminalShell';
import { Login } from './pages/Login';
import { Menu } from './pages/Menu';
import { Salon } from './pages/Salon';
import { Cash } from './pages/Cash';
import { Catalog } from './pages/Catalog';
import { Services } from './pages/Services';
import { Audit } from './pages/Audit';
import { FloorPlanEditor } from './pages/FloorPlanEditor';
import './styles/floor-plan.css';
const navigation = [
  {
    id: 'salon',
    name: 'Salón',
    icon: LayoutGrid,
    roles: ['admin', 'cashier', 'waiter'],
  },
  { id: 'cash', name: 'Caja', icon: Wallet, roles: ['admin', 'cashier'] },
  { id: 'catalog', name: 'Catálogo', icon: BookOpen, roles: ['admin'] },
  { id: 'users', name: 'Usuarios', icon: Users, roles: ['admin'] },
  { id: 'design', name: 'Diseño del salón', icon: PenTool, roles: ['admin'] },
  {
    id: 'services',
    name: 'Servicios demo',
    icon: Printer,
    roles: ['admin', 'cashier', 'kitchen', 'bar'],
  },
  { id: 'audit', name: 'Auditoría', icon: History, roles: ['admin'] },
];
export function App() {
  const store = useStore();
  const { session, state, loading, online, pending, busy, error, notice } = store;
  const [page, setPage] = useState(location.hash.slice(1) || 'salon');
  const [menu, setMenu] = useState(false);
  const [logout, setLogout] = useState(false);
  const [queue, setQueue] = useState(false);
  const [discard, setDiscard] = useState<Pending | null>(null);
  const [rebase, setRebase] = useState<Pending | null>(null);
  const visiblePending = store.activeTableId
    ? pendingForTable(pending, store.activeTableId)
    : pending;
  useEffect(() => {
    const change = () => {
      const hash = location.hash.slice(1);
      if (navigation.some((item) => item.id === hash)) {
        setPage(hash);
        setMenu(false);
      }
    };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  if (location.pathname.startsWith('/carta')) return <Menu />;
  if (store.terminal) return <TerminalShell />;
  if (loading)
    return (
      <main className="app-loading" aria-busy="true">
        <div className="brand-loading">
          <img src="/brand/baguette-logo.svg" alt="Café" width="208" height="79" />
        </div>
        <p>Preparando la operación…</p>
      </main>
    );
  if (!session) return <Login />;
  const navPermissions: Record<string, string[]> = {
    salon: ['operate'],
    preparation: ['operate', 'cash', 'prepare_kitchen', 'prepare_bar'],
    cash: ['cash'],
    catalog: ['manage_catalog'],
    users: ['manage_users'],
    design: ['manage_tables'],
    services: ['operate', 'cash', 'prepare_kitchen', 'prepare_bar'],
    audit: ['audit'],
  };
  const available = navigation.filter((n) =>
    state && Array.isArray(state.permissions)
      ? navPermissions[n.id].some((p) => can(state, p))
      : n.roles.includes(session.user.role),
  );
  if (!available.length)
    return (
      <main className="main-content">
        <h1>Sin permisos de operación</h1>
        <p>Pedile al encargado que revise tu rol.</p>
        <button
          className="btn btn-primary"
          onClick={() => {
            void store.logout();
          }}
        >
          Cerrar sesión
        </button>
      </main>
    );
  const current = available.some((n) => n.id === page) ? page : available[0].id;
  function navigate(value: string) {
    setPage(value);
    location.hash = value;
    setMenu(false);
    store.clear();
    window.scrollTo(0, 0);
  }
  return (
    <div className="app-shell horizontal-shell">
      <a className="skip-link" href="#main-content">
        Ir al contenido
      </a>
      <aside className="top-navbar" role="complementary" aria-label="Navegación principal">
        <div className="top-navbar-brand">
          <button
            className="icon-button mobile-menu"
            aria-label="Abrir menú"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            <MenuIcon size={20} />
          </button>
          <a href="/gestion" className="brand-logo" aria-label="Inicio">
            <img src="/brand/baguette-logo.svg" alt="Café" width="104" height="40" />
          </a>
          <span className="branch-tag">
            <span className="branch-dot" /> Demo
          </span>
        </div>
        <nav className={`top-navbar-nav ${menu ? 'is-open' : ''}`} aria-label="Secciones">
          {available.map((n) => {
            const Icon = n.icon;
            return (
              <button
                key={n.id}
                className={`nav-tab ${current === n.id ? 'active' : ''}`}
                aria-current={current === n.id ? 'page' : undefined}
                onClick={() => navigate(n.id)}
              >
                <Icon size={17} strokeWidth={1.8} />
                <span>{n.name}</span>
                {n.id === 'preparation' &&
                  state &&
                  state.items.some((i) => ['sent', 'preparing'].includes(i.status)) && (
                    <span className="nav-counter">
                      {state.items.filter((i) => ['sent', 'preparing'].includes(i.status)).length}
                    </span>
                  )}
              </button>
            );
          })}
        </nav>
        <div className="top-navbar-actions">
          <button
            className={`connection-button ${online ? '' : 'is-offline'}`}
            aria-label={`${online ? 'En línea' : 'Sin conexión'}${pending.length ? `, ${pending.length} pendientes` : ''}`}
            onClick={() => setQueue(true)}
          >
            {online ? <Wifi size={14} /> : <WifiOff size={14} />}
            <span className="connection-text">{online ? 'En línea' : 'Sin conexión'}</span>
            {pending.length > 0 && <strong>{pending.length}</strong>}
          </button>
          <a
            className="carta-link"
            href="/carta"
            target="_blank"
            rel="noreferrer"
            title="Ver carta pública"
          >
            <span>Carta</span>
            <ArrowUpRight size={14} />
          </a>
          <ThemeSelector compact />
          <div
            className="user-chip"
            title={`${session.user.name} (${statusLabel[session.user.role]})`}
          >
            <span className="avatar">
              {session.user.name
                .split(' ')
                .slice(0, 2)
                .map((s) => s[0])
                .join('')}
            </span>
            <div className="user-info">
              <strong>{session.user.name}</strong>
              <span>{statusLabel[session.user.role]}</span>
            </div>
          </div>
          <button
            className="btn btn-outline-primary management-logout"
            onClick={() => setLogout(true)}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
          >
            <LogOut size={16} />
            <span className="logout-text">Salir</span>
          </button>
        </div>
      </aside>
      {menu && (
        <button
          className="sidebar-scrim"
          aria-label="Cerrar menú de navegación"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="workspace">
        <main id="main-content" className="main-content" tabIndex={-1}>
          {(error || notice) && (
            <div
              className={`global-message alert ${error ? 'alert-danger' : 'alert-success'}`}
              role={error ? 'alert' : 'status'}
            >
              <span>{error || notice}</span>
              <button aria-label="Cerrar mensaje" className="icon-button" onClick={store.clear}>
                <X size={16} />
              </button>
            </div>
          )}
          {!online && (
            <div className="alert alert-warning">
              Sin conexión. Podés agregar productos; cobros y envíos requieren conexión.
            </div>
          )}
          {current === 'salon' && <Salon />}
          {current === 'cash' && <Cash />}
          {current === 'catalog' && <Catalog />}
          {current === 'users' && <Catalog users />}
          {current === 'design' && <FloorPlanEditor />}
          {current === 'services' && <Services />}
          {current === 'audit' && <Audit />}
          <footer className="workspace-footer">
            <span>Café · Demo</span>
          </footer>
        </main>
      </div>
      {logout && (
        <Confirm
          title="Cerrar tu sesión"
          text="Las operaciones confirmadas quedan guardadas. Los pendientes locales se conservan solo para tu usuario."
          close={() => setLogout(false)}
          proceed={async () => {
            await store.logout();
            setLogout(false);
          }}
        />
      )}{' '}
      {queue && (
        <Dialog title="Pendientes" close={() => setQueue(false)} wide>
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
          text="El servidor rechazó esta solicitud. Se elimina solo el pendiente local; no se elimina ninguna operación del servidor. Si corregís los datos, se generará una nueva solicitud."
          close={() => setDiscard(null)}
          proceed={async () => store.discard(discard)}
        />
      )}{' '}
      {rebase && (
        <Confirm
          title="Actualizar pedido pendiente"
          text="Se consultará primero que la operación original no exista. Si no existe, el alta se volverá a enviar con la versión actual de la cuenta y una nueva clave. Revisá el consumo de la cuenta antes de continuar."
          close={() => setRebase(null)}
          proceed={() => store.rebase(rebase)}
        />
      )}
    </div>
  );
}
