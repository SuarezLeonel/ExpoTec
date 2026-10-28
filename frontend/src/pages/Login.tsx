import { useState } from 'react';
import { ArrowUpRight, Coffee } from 'lucide-react';
import { useStore } from '../contexts/Store';
import { FieldsForm } from '../components/UI';
import { ThemeSelector } from '../components/ThemeSelector';
import { post } from '../services/api';
export function Login() {
  const { login, notice: serverNotice } = useStore();
  const [mode, setMode] = useState<'login' | 'recover' | 'reset'>('login');
  const [notice, setNotice] = useState('');
  return (
    <main className="login-layout">
      <section className="login-brand">
        <img src="/brand/baguette-logo.svg" alt="Café" width="208" height="79" />
        <div>
          <p className="eyebrow">UN SOLO SISTEMA · TODO BAJO CONTROL</p>
          <h1>Cada pedido en su lugar.</h1>
          <p>Cada turno, más simple.</p>
        </div>
        <span className="demo-stamp">DEMO OPERATIVA · DATOS FICTICIOS</span>
      </section>
      <section className="login-panel">
        <div className="login-panel-topbar">
          <ThemeSelector compact />
        </div>
        <div className="login-form">
          <Coffee size={30} strokeWidth={1.4} />
          <p className="eyebrow mt-4">BIENVENIDO A TU TURNO</p>
          <h2>
            {mode === 'login'
              ? 'Acceso de gestión'
              : mode === 'recover'
                ? 'Recuperá tu acceso'
                : 'Elegí otra contraseña'}
          </h2>
          <p className="text-secondary">
            {mode === 'login'
              ? 'Ingresá como cajero o encargado. Para comandar usá el terminal de salón y tu PIN.'
              : 'Correo de prueba local: no se envía ningún email real.'}
          </p>
          {(notice || serverNotice) && (
            <div className="alert alert-success" role="status">
              {notice || serverNotice}
            </div>
          )}
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
              label="Iniciar turno"
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
          <div className="login-links">
            {mode !== 'login' && (
              <button
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
              <button className="btn btn-link" onClick={() => setMode('recover')}>
                Olvidé mi contraseña
              </button>
            )}
            {mode !== 'reset' && (
              <button className="btn btn-link" onClick={() => setMode('reset')}>
                Tengo un token
              </button>
            )}
          </div>
          <a className="menu-link" href="/carta">
            Ver la carta pública <ArrowUpRight size={17} />
          </a>
          <a className="menu-link" href="/">
            Volver al terminal de salón
          </a>
          <p className="small text-secondary mt-4">
            Los accesos de demostración se encuentran en el README del proyecto.
          </p>
        </div>
      </section>
    </main>
  );
}
