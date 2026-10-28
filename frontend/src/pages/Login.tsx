import { useState } from 'react';
import {
  ArrowUpRight,
  ShieldCheck,
  Utensils,
  Receipt,
  ChefHat,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Sparkles,
  KeyRound,
  User,
  Copy,
  Check,
} from 'lucide-react';
import { useStore } from '../contexts/Store';
import { FieldsForm } from '../components/UI';
import { ThemeSelector } from '../components/ThemeSelector';
import { post } from '../services/api';

export const DEMO_CREDENTIALS = [
  {
    id: 'admin',
    role: 'Administrador',
    name: 'Ana Encargada',
    username: 'admin',
    password: 'DemoBaguette2026!',
    badge: 'Supervisión Global',
    icon: ShieldCheck,
    description: 'Acceso total: Salón, Cocina, Caja, Catálogo, Usuarios y Auditoría.',
  },
  {
    id: 'mozo',
    role: 'Mozo',
    name: 'Martín Camarero',
    username: 'mozo',
    password: 'DemoBaguette2026!',
    badge: 'Salón y Comandas',
    icon: Utensils,
    description: 'Carga pedidos en mesa, envía a cocina y entrega platos listos.',
  },
  {
    id: 'caja',
    role: 'Cajera',
    name: 'Carla Cajera',
    username: 'caja',
    password: 'DemoBaguette2026!',
    badge: 'Caja y Facturación',
    icon: Receipt,
    description: 'Cobra comandas entregadas, imprime facturas y libera mesas.',
  },
  {
    id: 'cocina',
    role: 'Cocina',
    name: 'Lucía Cocina',
    username: 'cocina',
    password: 'DemoBaguette2026!',
    badge: 'Preparación y Despacho',
    icon: ChefHat,
    description: 'Recibe comandas de mozos, inicia cocción y marca listos para mesa.',
  },
];

export function Login() {
  const { login, notice: serverNotice } = useStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mode, setMode] = useState<'login' | 'recover' | 'reset'>('login');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copiedRole, setCopiedRole] = useState<string | null>(null);

  async function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Por favor completá tu usuario y contraseña.');
      return;
    }
    try {
      setError(null);
      setIsSubmitting(true);
      await login(username.trim(), password);
    } catch (err) {
      setError((err as Error).message || 'Credenciales incorrectas.');
      setIsSubmitting(false);
    }
  }

  function applyCredentials(u: string, p: string, roleId: string) {
    setUsername(u);
    setPassword(p);
    setError(null);
    setCopiedRole(roleId);
    setTimeout(() => setCopiedRole(null), 2000);
  }

  return (
    <main className="login-layout">
      {/* BRAND & FLOW SIDEBAR */}
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
                <strong>1. Mozo:</strong> toma y confirma el pedido de la mesa.
              </li>
              <li>
                <strong>2. Cocina:</strong> prepara y marca "Listo para mesa".
              </li>
              <li>
                <strong>3. Mozo:</strong> retira de cocina y entrega al comensal.
              </li>
              <li>
                <strong>4. Cajera:</strong> imprime la factura, cobra y libera la mesa.
              </li>
            </ol>
          </div>
        </div>
        <span className="demo-stamp">DEMO OPERATIVA · EXPO TEC 2026</span>
      </section>

      {/* CREDENTIALS LOGIN PANEL */}
      <section className="login-panel">
        <div className="login-panel-topbar">
          <ThemeSelector compact />
        </div>

        <div className="login-credentials-wrapper">
          <header className="login-header text-center mb-4">
            <div className="login-icon-badge mx-auto mb-3">
              <Lock size={24} strokeWidth={1.8} />
            </div>
            <p className="eyebrow">ACCESO AL SISTEMA</p>
            <h2>
              {mode === 'login'
                ? 'Iniciar sesión'
                : mode === 'recover'
                  ? 'Recuperar acceso'
                  : 'Cambiar contraseña'}
            </h2>
            <p className="text-secondary small mb-0">
              {mode === 'login'
                ? 'Ingresá tus credenciales de usuario para acceder a tu panel de trabajo.'
                : 'Correo de prueba local: no se envía ningún email real.'}
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

          {mode === 'login' ? (
            <form onSubmit={handleLoginSubmit} className="login-form-credentials" noValidate>
              <div className="form-group mb-3">
                <label htmlFor="login-username" className="form-label">
                  Usuario
                </label>
                <div className="input-group-custom">
                  <span className="input-icon" aria-hidden="true">
                    <User size={18} />
                  </span>
                  <input
                    id="login-username"
                    name="username"
                    type="text"
                    className="form-control with-icon"
                    placeholder="Ej: admin, mozo, caja, cocina"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div className="form-group mb-4">
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <label htmlFor="login-password" className="form-label mb-0">
                    Contraseña
                  </label>
                  <button
                    type="button"
                    className="btn btn-link btn-sm p-0 text-muted"
                    onClick={() => setMode('recover')}
                  >
                    ¿Olvidaste tu clave?
                  </button>
                </div>
                <div className="password-input">
                  <input
                    id="login-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    className="form-control"
                    placeholder="Ingresá tu contraseña"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isSubmitting}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                    onClick={() => setShowPassword((prev) => !prev)}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary w-100 login-submit-btn"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="btn-spinner" /> Validando credenciales…
                  </>
                ) : (
                  'Iniciar sesión'
                )}
              </button>
            </form>
          ) : mode === 'recover' ? (
            <div className="login-recover-container">
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
              <div className="text-center mt-3">
                <button
                  type="button"
                  className="btn btn-link btn-sm"
                  onClick={() => {
                    setMode('login');
                    setNotice('');
                  }}
                >
                  Volver al ingreso
                </button>
              </div>
            </div>
          ) : (
            <div className="login-reset-container">
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
              <div className="text-center mt-3">
                <button
                  type="button"
                  className="btn btn-link btn-sm"
                  onClick={() => {
                    setMode('login');
                    setNotice('');
                  }}
                >
                  Volver al ingreso
                </button>
              </div>
            </div>
          )}

          {/* CREDENTIALS REFERENCE CARD */}
          <div className="credentials-guide-box mt-4">
            <div className="credentials-guide-header">
              <div className="d-flex align-items-center gap-2">
                <KeyRound size={16} className="text-caramel" />
                <strong>Credenciales del Sistema por Rol</strong>
              </div>
              <span className="badge-hint">1 cuenta por puesto</span>
            </div>
            <p className="small text-secondary mb-3">
              Hacé click en <em>"Cargar"</em> para autocompletar usuario y contraseña en el
              formulario:
            </p>

            <div className="credentials-cards-grid">
              {DEMO_CREDENTIALS.map((cred) => {
                const Icon = cred.icon;
                const isSelected = username === cred.username;
                const isCopied = copiedRole === cred.id;
                return (
                  <article
                    key={cred.id}
                    className={`credential-role-card ${isSelected ? 'active' : ''}`}
                    onClick={() => applyCredentials(cred.username, cred.password, cred.id)}
                    role="button"
                    tabIndex={0}
                    title={`Click para cargar credenciales de ${cred.role}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        applyCredentials(cred.username, cred.password, cred.id);
                      }
                    }}
                  >
                    <div className="credential-role-header">
                      <div className={`role-avatar-badge role-avatar-${cred.id}`}>
                        <Icon size={16} strokeWidth={2} />
                      </div>
                      <div className="role-meta">
                        <strong className="role-title">{cred.role}</strong>
                        <span className="role-person">{cred.name}</span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary btn-apply-cred"
                        aria-label={`Cargar credenciales de ${cred.role}`}
                      >
                        {isCopied ? (
                          <>
                            <Check size={13} className="text-success" /> Cargado
                          </>
                        ) : (
                          <>
                            <Copy size={13} /> Cargar
                          </>
                        )}
                      </button>
                    </div>

                    <div className="credential-data-row">
                      <div className="cred-field">
                        <span className="cred-label">Usuario:</span>
                        <code className="cred-val">@{cred.username}</code>
                      </div>
                      <div className="cred-field">
                        <span className="cred-label">Clave:</span>
                        <code className="cred-val">{cred.password}</code>
                      </div>
                    </div>

                    <p className="role-desc">{cred.description}</p>
                  </article>
                );
              })}
            </div>
          </div>

          {/* FOOTER LINKS */}
          <footer className="login-panel-footer mt-4 pt-3 border-top">
            <div className="d-flex justify-content-between flex-wrap gap-2">
              <a className="menu-link" href="/carta">
                Ver carta pública <ArrowUpRight size={15} />
              </a>
              <a className="menu-link" href="/">
                Terminal de salón
              </a>
            </div>
          </footer>
        </div>
      </section>
    </main>
  );
}
