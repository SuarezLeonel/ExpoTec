import { useEffect, useRef, useState } from 'react';
import { Delete, RotateCcw } from 'lucide-react';
import { Dialog } from './UI';
import { ApiError, post } from '../services/api';
import type { OperationalGrant } from '../types';

export function OperationalPin({
  tableId,
  label,
  done,
  cancel,
  prepare,
}: {
  tableId: string;
  label: string;
  done: (grant: OperationalGrant) => void;
  cancel: () => void;
  prepare?: () => Promise<void>;
}) {
  const [pin, setPin] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const validating = useRef(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    if (!busy) inputRef.current?.focus();
  }, [busy]);

  async function validate(value: string) {
    if (!/^\d{4}$/.test(value) || validating.current) return;
    validating.current = true;
    setBusy(true);
    setError('');
    try {
      if (prepare) {
        setWaiting(true);
        await prepare();
        setWaiting(false);
      }
      const grant = await post<OperationalGrant>('auth/operational-pin', {
        table_id: tableId,
        pin: value,
      });
      setPin('');
      done(grant);
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === 'PIN_INVALID'
          ? 'PIN incorrecto. Probá de nuevo.'
          : e instanceof Error
            ? e.message
            : 'No pudimos validar el PIN.',
      );
      setPin('');
      setBusy(false);
      inputRef.current?.focus();
    } finally {
      setWaiting(false);
      validating.current = false;
    }
  }

  const handleKeyPress = (num: string) => {
    if (busy || validating.current) return;
    if (pin.length < 4) {
      const next = (pin + num).slice(0, 4);
      setPin(next);
      setError('');
      if (next.length === 4) {
        void validate(next);
      }
    }
  };

  const handleDelete = () => {
    if (busy || validating.current) return;
    setPin((prev) => prev.slice(0, -1));
    setError('');
  };

  const handleClear = () => {
    if (busy || validating.current) return;
    setPin('');
    setError('');
  };

  return (
    <Dialog
      title="Identificación de empleado"
      className="pin-dialog"
      close={() => {
        if (!busy) cancel();
      }}
    >
      <div className="pin-dialog-content">
        <p className="pin-table">
          Atendiendo <strong>Mesa {label}</strong>
        </p>
        <p className="pin-instruction">Ingresá tu PIN de 4 dígitos</p>

        <form
          aria-busy={busy}
          onSubmit={(event) => {
            event.preventDefault();
            void validate(pin);
          }}
        >
          <label htmlFor="operational-pin" className="visually-hidden">
            PIN personal
          </label>
          <input
            id="operational-pin"
            ref={inputRef}
            className="form-control pin-input visually-hidden"
            autoFocus
            type="password"
            inputMode="numeric"
            autoComplete="off"
            required
            maxLength={4}
            placeholder="••••"
            enterKeyHint="done"
            disabled={busy}
            value={pin}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'operational-pin-help' : 'pin-status'}
            onChange={(e) => {
              if (validating.current) return;
              const value = e.target.value.replace(/\D/g, '').slice(0, 4);
              setPin(value);
              setError('');
              void validate(value);
            }}
          />

          {/* Visual 4-dot indicator */}
          <div
            className="pin-display-wrapper"
            onClick={() => inputRef.current?.focus()}
            role="presentation"
          >
            {[0, 1, 2, 3].map((idx) => (
              <span
                key={idx}
                className={`pin-dot ${pin.length > idx ? 'is-filled' : ''}`}
                aria-hidden="true"
              />
            ))}
          </div>

          {error && (
            <p id="operational-pin-help" className="invalid-message text-center" role="alert">
              {error}
            </p>
          )}

          <p id="pin-status" role="status" className="pin-status text-center">
            {waiting
              ? 'Terminando envío anterior…'
              : busy
                ? 'Validando PIN…'
                : 'Verificación automática'}
          </p>

          {/* On-screen touch keypad */}
          <div className="pin-keypad" role="group" aria-label="Teclado numérico">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <button
                key={num}
                type="button"
                className="pin-key"
                disabled={busy}
                onClick={() => handleKeyPress(String(num))}
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              className="pin-key key-action"
              title="Limpiar"
              aria-label="Limpiar todo el PIN"
              disabled={busy || !pin}
              onClick={handleClear}
            >
              <RotateCcw size={18} />
            </button>
            <button
              type="button"
              className="pin-key"
              disabled={busy}
              onClick={() => handleKeyPress('0')}
            >
              0
            </button>
            <button
              type="button"
              className="pin-key key-action"
              title="Borrar último dígito"
              aria-label="Borrar último dígito"
              disabled={busy || !pin}
              onClick={handleDelete}
            >
              <Delete size={20} />
            </button>
          </div>

          <div className="form-actions justify-content-center">
            <button
              type="button"
              className="btn btn-outline-primary"
              disabled={busy}
              onClick={cancel}
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </Dialog>
  );
}
