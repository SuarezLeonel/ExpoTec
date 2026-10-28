import { useState } from 'react';
import {
  ArrowUpRight,
  ShieldCheck,
  Utensils,
  Receipt,
  ChefHat,
  ChevronDown,
  ChevronUp,
  Loader2,
  Lock,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { useStore } from '../contexts/Store';
import { FieldsForm } from '../components/UI';
import { ThemeSelector } from '../components/ThemeSelector';
import { post } from '../services/api';

const DEMO_PASSWORD = 'DemoBaguette2026!';

interface RoleDefinition {
  id: string;
  username: string;
  name: string;
  title: string;
  tier: string;
  badge: string;
  icon: typeof ShieldCheck;
  flowDescription: string;
  duties: string[];
}

const ADMIN_ROLE: RoleDefinition = {
  id: 'admin',
  username: 'admin',
  name: 'Ana Encargada',
  title: 'ADMINISTRADOR',
  tier: 'Nivel Superior · Supervisión Global',
  badge: 'Supervisión Total',
  icon: ShieldCheck,
  flowDescription:
    'Supervisión integral de toda la operación, configuración del catálogo, diseño de mesas, auditoría y control de caja.',
  duties: [
    'Supervisión y control integral de la operación',
    'Acceso completo a Salón, Cocina, Caja y Auditoría',
    'Administración del catálogo, diseño del salón y usuarios',
  ],
};

const OPERATIONAL_ROLES: RoleDefinition[] = [
  {
    id: 'mozo',
    username: 'mozo',
    name: 'Martín Camarero',
    title: 'MOZO',
    tier: 'Nivel Operativo · Salón',
    badge: '1. Pedidos & 3. Entrega',
    icon: Utensils,
    flowDescription:
      'Apertura y comanda de mesas, envío a cocina y entrega de pedidos listos al comensal.',
    duties: [
      'Agregar y confirmar productos por mesa',
      'Aviso visual de pedidos listos en cocina',
      'Entrega a mesa para habilitar el cobro',
    ],
  },
  {
    id: 'caja',
    username: 'caja',
    name: 'Carla Cajera',
    title: 'CAJERA',
    tier: 'Nivel Operativo · Caja',
    badge: '4. Factura & Cobro',
    icon: Receipt,
    flowDescription:
      'Cobro de comandas entregadas, impresión de factura fiscal y liberación de mesas.',
    duties: [
      'Recepción de cuentas con pedidos entregados',
      'Impresión de factura de consumo detallada',
      'Cobro (efectivo/tarjeta) y liberación de mesa',
    ],
  },
  {
    id: 'cocina',
    username: 'cocina',
    name: 'Lucía Cocina',
    title: 'COCINA',
    tier: 'Nivel Operativo · Cocina',
    badge: '2. Preparación',
    icon: ChefHat,
    flowDescription:
      'Recepción en tiempo real de comandas de mozos, elaboración y aviso de platos listos.',
    duties: [
      'Visualización de comandas con adicionales y notas',
      'Inicio de preparación de platos en marcha',
      'Marcado de pedido "Listo para mesa"',
    ],
  },
];

export function Login() {
  const { login, notice: serverNotice } = useStore();
  const [loggingRole, setLoggingRole] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [mode, setMode] = useState<'login' | 'recover' | 'reset'>('login');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleFastLogin(username: string) {
    try {
      setError(null);
      setLoggingRole(username);
      await login(username, DEMO_PASSWORD);
    } catch (err) {
      setError((err as Error).message || 'Error al iniciar sesión');
      setLoggingRole(null);
    }
  }

  return (
    <main className="login-layout">
      <section className="login-brand">
        <img src="/brand/baguette-logo.svg" alt="Café" width="208" height="79" />
        <div className="login-brand-body">
          <p className="eyebrow">UN SOLO SISTEMA · TODO BAJO CONTROL</p>
          <h1>Cada pedido en su lugar.</h1>
          <p className="lead-text">Cada turno, más simple.</p>
          <div className="hierarchy-brand-flow">
            <span className="brand-flow-pill">
              <Sparkles size={13} /> Flujo Gastronómico Segmentado
            </span>
            <ol className="brand-flow-steps">
              <li>
                <strong>Mozo:</strong> carga productos en la mesa y confirma el pedido.
              </li>
              <li>
                <strong>Cocina:</strong> recibe la comanda, prepara y marca "Listo para mesa".
              </li>
              <li>
                <strong>Mozo:</strong> recibe el aviso en su panel y entrega el pedido al comensal.
              </li>
              <li>
                <strong>Cajera:</strong> imprime la factura, cobra y libera la mesa para nuevos
                clientes.
              </li>
            </ol>
          </div>
        </div>
        <span className="demo-stamp">DEMO OPERATIVA · EXPO TEC 2026</span>
      </section>

      <section className="login-panel">
        <div className="login-panel-topbar">
          <ThemeSelector compact />
        </div>

        <div className="hierarchy-login-container">
          <header className="hierarchy-login-header">
            <p className="eyebrow">INGRESO POR JERARQUÍAS</p>
            <h2>Elegí tu puesto de trabajo</h2>
            <p className="text-secondary">
              1 cuenta asignada por rol para una clara segmentación operativa. Hacé click para
              ingresar directamente:
            </p>
          </header>

          {(error || notice || serverNotice) && (
            <div
              className={`alert ${error ? 'alert-danger' : 'alert-success'} mb-4`}
              role={error ? 'alert' : 'status'}
            >
              {error || notice || serverNotice}
            </div>
          )}

          {/* HIERARCHY TREE */}
          <div className="hierarchy-tree" aria-label="Jerarquía de roles del sistema">
            {/* TIER 1: ADMIN */}
            <div className="hierarchy-tier hierarchy-tier-admin">
              <article
                className={`hierarchy-card hierarchy-card-admin ${
                  loggingRole === ADMIN_ROLE.username ? 'is-loading' : ''
                }`}
                tabIndex={0}
                role="button"
                aria-label={`Ingresar como ${ADMIN_ROLE.title} (${ADMIN_ROLE.name})`}
                onClick={() => !loggingRole && handleFastLogin(ADMIN_ROLE.username)}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && !loggingRole) {
                    e.preventDefault();
                    void handleFastLogin(ADMIN_ROLE.username);
                  }
                }}
              >
                <div className="hierarchy-card-top">
                  <div className="hierarchy-avatar hierarchy-avatar-admin">
                    <ADMIN_ROLE.icon size={22} strokeWidth={1.8} />
                  </div>
                  <div className="hierarchy-card-identity">
                    <span className="hierarchy-role-tag">{ADMIN_ROLE.title}</span>
                    <h3 className="hierarchy-person-name">{ADMIN_ROLE.name}</h3>
                    <code className="hierarchy-username">@{ADMIN_ROLE.username}</code>
                  </div>
                  <span className="hierarchy-scope-badge">{ADMIN_ROLE.badge}</span>
                </div>
                <p className="hierarchy-card-desc">{ADMIN_ROLE.flowDescription}</p>
                <button
                  type="button"
                  className="btn btn-primary hierarchy-login-btn"
                  disabled={Boolean(loggingRole)}
                >
                  {loggingRole === ADMIN_ROLE.username ? (
                    <>
                      <Loader2 size={16} className="btn-spinner" /> Ingresando…
                    </>
                  ) : (
                    <>
                      Ingresar como Admin <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </article>
            </div>

            {/* TREE CONNECTORS */}
            <div className="hierarchy-branch-connector" aria-hidden="true">
              <div className="hierarchy-stem" />
              <div className="hierarchy-branch-bar" />
              <div className="hierarchy-drop-lines">
                <span className="hierarchy-drop-line" />
                <span className="hierarchy-drop-line" />
                <span className="hierarchy-drop-line" />
              </div>
            </div>

            {/* TIER 2: OPERATIONAL (MOZO - CAJERA - COCINA) */}
            <div className="hierarchy-tier hierarchy-tier-ops">
              <div className="hierarchy-ops-grid">
                {OPERATIONAL_ROLES.map((role) => {
                  const Icon = role.icon;
                  const isLoading = loggingRole === role.username;
                  return (
                    <article
                      key={role.id}
                      className={`hierarchy-card hierarchy-card-op hierarchy-card-${role.id} ${
                        isLoading ? 'is-loading' : ''
                      }`}
                      tabIndex={0}
                      role="button"
                      aria-label={`Ingresar como ${role.title} (${role.name})`}
                      onClick={() => !loggingRole && handleFastLogin(role.username)}
                      onKeyDown={(e) => {
                        if ((e.key === 'Enter' || e.key === ' ') && !loggingRole) {
                          e.preventDefault();
                          void handleFastLogin(role.username);
                        }
                      }}
                    >
                      <div className="hierarchy-card-header">
                        <div className={`hierarchy-avatar hierarchy-avatar-${role.id}`}>
                          <Icon size={20} strokeWidth={1.8} />
                        </div>
                        <span className="hierarchy-step-badge">{role.badge}</span>
                      </div>

                      <div className="hierarchy-card-identity">
                        <span className="hierarchy-role-tag">{role.title}</span>
                        <h4 className="hierarchy-person-name">{role.name}</h4>
                        <code className="hierarchy-username">@{role.username}</code>
                      </div>

                      <p className="hierarchy-card-desc">{role.flowDescription}</p>

                      <button
                        type="button"
                        className="btn btn-outline-primary hierarchy-login-btn"
                        disabled={Boolean(loggingRole)}
                      >
                        {isLoading ? (
                          <>
                            <Loader2 size={15} className="btn-spinner" /> Ingresando…
                          </>
                        ) : (
                          <>
                            Ingresar como {role.title} <ArrowRight size={15} />
                          </>
                        )}
                      </button>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>

          {/* MANUAL CREDENTIALS TOGGLE */}
          <div className="hierarchy-manual-wrapper">
            <button
              type="button"
              className="btn btn-link hierarchy-toggle-btn"
              onClick={() => setShowManual((prev) => !prev)}
            >
              <Lock size={15} />
              <span>O ingresar con credenciales manuales</span>
              {showManual ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {showManual && (
              <div className="hierarchy-manual-form animate-fade-in">
                <p className="small text-secondary mb-3">
                  {mode === 'login'
                    ? 'Ingresá usuario y contraseña específicos de cualquier cuenta.'
                    : mode === 'recover'
                      ? 'Correo de prueba local: no se envía ningún email real.'
                      : 'Elegí una nueva contraseña para tu cuenta.'}
                </p>

                {mode === 'login' ? (
                  <FieldsForm
                    key="login"
                    fields={[
                      {
                        name: 'username',
                        label: 'Usuario',
                        autoComplete: 'username',
                        required: true,
                        minLength: 3,
                        maxLength: 60,
                        pattern: '^[a-zA-Z0-9._-]{3,60}$',
                      },
                      {
                        name: 'password',
                        label: 'Contraseña',
                        type: 'password',
                        autoComplete: 'current-password',
                        required: true,
                        maxLength: 128,
                      },
                    ]}
                    label="Iniciar sesión con credenciales"
                    submit={(v) => login(String(v.username), String(v.password))}
                  />
                ) : mode === 'recover' ? (
                  <FieldsForm
                    key="recover"
                    fields={[
                      {
                        name: 'username',
                        label: 'Usuario',
                        autoComplete: 'username',
                        required: true,
                        minLength: 3,
                        maxLength: 60,
                        pattern: '^[a-zA-Z0-9._-]{3,60}$',
                      },
                    ]}
                    label="Solicitar recuperación"
                    submit={async (v) => {
                      await post('auth/recover', v);
                      setNotice(
                        'Si el usuario existe, el token está disponible en la bandeja local del encargado.',
                      );
                    }}
                  />
                ) : (
                  <FieldsForm
                    key="reset"
                    fields={[
                      {
                        name: 'token',
                        label: 'Token de recuperación',
                        required: true,
                        maxLength: 64,
                        pattern: '^[a-f0-9]{64}$',
                      },
                      {
                        name: 'password',
                        label: 'Nueva contraseña',
                        type: 'password',
                        autoComplete: 'new-password',
                        required: true,
                        minLength: 12,
                        maxLength: 128,
                        pattern: '^.{12,128}$',
                        help: 'Entre 12 y 128 caracteres.',
                      },
                    ]}
                    label="Cambiar contraseña"
                    submit={async (v) => {
                      await post('auth/reset', v);
                      setNotice('Contraseña actualizada. Ya podés ingresar.');
                      setMode('login');
                    }}
                  />
                )}

                <div className="login-links mt-3">
                  {mode !== 'login' && (
                    <button
                      type="button"
                      className="btn btn-link"
                      onClick={() => {
                        setMode('login');
                        setNotice('');
                      }}
                    >
                      Volver al ingreso
                    </button>
                  )}
                  {mode === 'login' && (
                    <button
                      type="button"
                      className="btn btn-link"
                      onClick={() => setMode('recover')}
                    >
                      Olvidé mi contraseña
                    </button>
                  )}
                  {mode !== 'reset' && (
                    <button type="button" className="btn btn-link" onClick={() => setMode('reset')}>
                      Tengo un token
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* FOOTER LINKS */}
          <footer className="hierarchy-login-footer">
            <a className="menu-link" href="/carta">
              Ver la carta pública <ArrowUpRight size={17} />
            </a>
            <a className="menu-link" href="/">
              Volver al terminal de salón
            </a>
            <p className="small text-secondary mt-3 mb-0">
              Contraseña demo unificada: <code>DemoBaguette2026!</code>
            </p>
          </footer>
        </div>
      </section>
    </main>
  );
}
