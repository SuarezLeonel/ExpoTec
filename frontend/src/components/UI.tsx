import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { X, ArrowLeft, Check, Eye, EyeOff } from 'lucide-react';
import { ApiError, statusLabel } from '../services/api';
export function Badge({ value }: { value: string }) {
  return <span className={`status status-${value}`}>{statusLabel[value] || value}</span>;
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty-state">{children}</div>;
}
export function Dialog({
  title,
  children,
  close,
  wide = false,
  className = '',
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`${wide ? 'sheet wide' : 'sheet'} ${className}`}
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="sheet-heading">
        <h2 id={id}>{title}</h2>
        <button className="icon-button" aria-label="Cerrar panel" onClick={close}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Confirm({
  title,
  text,
  proceed,
  close,
}: {
  title: string;
  text: string;
  proceed: () => Promise<unknown>;
  close: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Dialog title={title} close={close}>
      <p>{text}</p>
      {error && (
        <div role="alert" className="alert alert-danger">
          {error}
        </div>
      )}
      <div className="form-actions">
        <button className="btn btn-outline-primary" onClick={close}>
          Cancelar
        </button>
        <button
          className="btn btn-danger"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void proceed()
              .then(close)
              .catch((e) => {
                setError(String(e.message));
                setBusy(false);
              });
          }}
        >
          {busy ? 'Procesando…' : 'Confirmar'}
        </button>
      </div>
    </Dialog>
  );
}
export interface FieldSpec {
  name: string;
  label: string;
  type?: string;
  value?: string | number | boolean | string[];
  required?: boolean;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  options?: { value: string; label: string }[];
  help?: string;
  pattern?: string;
  autoComplete?: string;
}
export function InlineConfirm({
  title,
  text,
  proceed,
  close,
}: {
  title: string;
  text: string;
  proceed: () => Promise<unknown>;
  close: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <section className="alert alert-warning mt-3" aria-labelledby={titleId}>
      <h3 id={titleId} ref={heading} tabIndex={-1}>
        {title}
      </h3>
      <p>{text}</p>
      {error && (
        <p className="invalid-message" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button className="btn btn-outline-primary" type="button" disabled={busy} onClick={close}>
          Cancelar baja
        </button>
        <button
          className="btn btn-danger"
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void proceed()
              .then(close)
              .catch((e) => {
                setError(e instanceof Error ? e.message : 'No pudimos dar de baja el registro.');
                setBusy(false);
              });
          }}
        >
          {busy ? 'Procesando…' : 'Confirmar baja'}
        </button>
      </div>
    </section>
  );
}
function fieldMessage(message: string, field: FieldSpec): string {
  if (/^Too big:/i.test(message)) {
    const limit = message.match(/<=\s*(\d+)/)?.[1];
    return message.includes('characters') && limit
      ? `Usá como máximo ${limit} caracteres.`
      : 'El valor supera el máximo permitido.';
  }
  if (/^Too small:/i.test(message)) {
    const limit = message.match(/>=\s*(\d+)/)?.[1];
    return message.includes('characters') && limit
      ? `Ingresá al menos ${limit} caracteres.`
      : 'El valor es menor que el mínimo permitido.';
  }
  if (/^Invalid option/i.test(message)) return 'Seleccioná una opción válida.';
  if (/^Invalid UUID/i.test(message)) return 'Seleccioná un registro válido.';
  if (/^Invalid (?:input|format|string|URL|type)/i.test(message))
    return field.name === 'image_url'
      ? 'Ingresá una ruta de imagen válida.'
      : 'Revisá el formato del campo.';
  return message;
}
function validationDetails(error: unknown, fields: FieldSpec[]): Record<string, string> {
  if (!(error instanceof ApiError) || !Array.isArray(error.details)) return {};
  const messages: Record<string, string> = {};
  for (const issue of error.details) {
    if (
      !issue ||
      typeof issue !== 'object' ||
      typeof issue.field !== 'string' ||
      typeof issue.message !== 'string'
    )
      continue;
    const name = issue.field.split('.')[0];
    const field = fields.find((f) => f.name === name);
    if (field && !messages[name]) messages[name] = fieldMessage(issue.message, field);
  }
  return messages;
}
export function FieldsForm({
  fields,
  submit,
  label = 'Guardar',
  footer,
  draftKey,
}: {
  fields: FieldSpec[];
  submit: (values: Record<string, string | boolean | string[]>) => Promise<unknown>;
  label?: string;
  footer?: ReactNode;
  draftKey?: string;
}) {
  const [values, setValues] = useState<Record<string, string | boolean | string[]>>(() => {
    let draft: Record<string, unknown> = {};
    if (draftKey) {
      try {
        const saved = localStorage.getItem(draftKey);
        const parsed: unknown = saved ? JSON.parse(saved) : null;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          draft = parsed as Record<string, unknown>;
        }
      } catch {
        /* Invalid drafts are ignored. */
      }
    }
    return Object.fromEntries(
      fields.map((field) => {
        const saved = draft[field.name];
        const value =
          field.type === 'checkbox'
            ? typeof saved === 'boolean'
              ? saved
              : Boolean(field.value)
            : field.type === 'multiselect'
              ? Array.isArray(saved) && saved.every((entry) => typeof entry === 'string')
                ? saved
                : Array.isArray(field.value)
                  ? field.value
                  : []
              : typeof saved === 'string'
                ? saved
                : String(field.value ?? '');
        return [field.name, value];
      }),
    );
  });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const id = useId();
  useEffect(() => {
    if (!draftKey) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify(values));
    } catch {
      /* A local draft must not prevent submitting the form. */
    }
  }, [draftKey, values]);
  function validation(field: FieldSpec): string {
    const value = values[field.name];
    if (field.type === 'checkbox' || field.type === 'multiselect') return '';
    const text = String(value || '');
    if (field.required && !text.trim()) return 'Completá este campo.';
    if (!text) return '';
    if (field.minLength && text.trim().length < field.minLength)
      return `Ingresá al menos ${field.minLength} caracteres.`;
    if (
      field.type === 'number' &&
      (!Number.isFinite(Number(text)) ||
        (field.min !== undefined && Number(text) < field.min) ||
        (field.max !== undefined && Number(text) > field.max))
    )
      return `Ingresá un valor entre ${field.min ?? 0} y ${field.max ?? 'el máximo permitido'}.`;
    if (field.type === 'number' && !Number.isInteger(Number(text)))
      return 'Ingresá un número entero.';
    if (
      field.type === 'money' &&
      (!/^\d+(?:[.,]\d{1,2})?$/.test(text) || Number(text.replace(',', '.')) > 1000000)
    )
      return 'Usá hasta dos decimales, sin separadores de miles.';
    if (field.pattern && !new RegExp(field.pattern, 'u').test(text))
      return 'Revisá el formato del campo.';
    if (field.maxLength && text.length > field.maxLength)
      return `Máximo ${field.maxLength} caracteres.`;
    return '';
  }
  return (
    <form
      noValidate
      aria-busy={busy}
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        setTouched(Object.fromEntries(fields.map((f) => [f.name, true])));
        const invalidField = fields.find((f) => validation(f));
        if (invalidField) {
          document.getElementById(`${id}-${invalidField.name}`)?.focus();
          return;
        }
        setBusy(true);
        setError('');
        setServerErrors({});
        void submit(values)
          .then(() => {
            if (draftKey) {
              try {
                localStorage.removeItem(draftKey);
              } catch {
                /* The operation already succeeded on the server. */
              }
            }
          })
          .catch((e) => {
            const details = validationDetails(e, fields);
            setError(e instanceof Error ? e.message : 'No pudimos guardar.');
            setServerErrors(details);
            const first = Object.keys(details)[0];
            if (first)
              requestAnimationFrame(() => document.getElementById(`${id}-${first}`)?.focus());
          })
          .finally(() => setBusy(false));
      }}
    >
      <div className="field-grid">
        {fields.map((field) => {
          const fieldId = `${id}-${field.name}`;
          const invalid =
            (touched[field.name] ? validation(field) : '') || serverErrors[field.name] || '';
          const common = {
            id: fieldId,
            name: field.name,
            required: field.required,
            disabled: busy,
            'aria-invalid': Boolean(invalid),
            'aria-describedby': `${fieldId}-help`,
            onBlur: () => setTouched((p) => ({ ...p, [field.name]: true })),
          };
          const change = (value: string | boolean | string[]) => {
            setValues((p) => ({ ...p, [field.name]: value }));
            setTouched((p) => ({ ...p, [field.name]: true }));
            setServerErrors((p) =>
              Object.fromEntries(Object.entries(p).filter(([key]) => key !== field.name)),
            );
          };
          return (
            <div
              key={field.name}
              className={`field ${field.type === 'textarea' || field.type === 'multiselect' ? 'field-full' : ''}`}
            >
              {field.type === 'multiselect' ? (
                <span className="form-label" id={`${fieldId}-label`}>
                  {field.label}
                </span>
              ) : (
                <label className="form-label" htmlFor={fieldId}>
                  {field.label}
                  {field.required && <span aria-hidden="true"> *</span>}
                </label>
              )}
              {field.type === 'checkbox' ? (
                <input
                  {...common}
                  className="form-check-input"
                  type="checkbox"
                  checked={Boolean(values[field.name])}
                  onChange={(e) => change(e.target.checked)}
                />
              ) : field.type === 'multiselect' ? (
                <div
                  id={fieldId}
                  role="group"
                  className="multiselect-options"
                  aria-labelledby={`${fieldId}-label`}
                  aria-describedby={`${fieldId}-help`}
                >
                  {field.options?.length ? (
                    field.options.map((option) => {
                      const checked = (values[field.name] as string[]).includes(option.value);
                      return (
                        <label className="multiselect-option" key={option.value}>
                          <input
                            type="checkbox"
                            name={field.name}
                            value={option.value}
                            checked={checked}
                            disabled={busy}
                            className="form-check-input"
                            onChange={() =>
                              change(
                                checked
                                  ? (values[field.name] as string[]).filter(
                                      (value) => value !== option.value,
                                    )
                                  : [...(values[field.name] as string[]), option.value],
                              )
                            }
                          />
                          <span>{option.label}</span>
                        </label>
                      );
                    })
                  ) : (
                    <p className="small text-secondary mb-0">No hay agregados disponibles.</p>
                  )}
                </div>
              ) : field.options ? (
                <select
                  {...common}
                  className={`form-select ${invalid ? 'is-invalid' : ''}`}
                  value={String(values[field.name])}
                  onChange={(e) => change(e.target.value)}
                >
                  {!field.options.some((o) => o.value === '') && (
                    <option value="">Seleccioná…</option>
                  )}
                  {field.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : field.type === 'textarea' ? (
                <textarea
                  {...common}
                  className={`form-control ${invalid ? 'is-invalid' : ''}`}
                  value={String(values[field.name])}
                  maxLength={field.maxLength || 500}
                  onChange={(e) => change(e.target.value)}
                />
              ) : field.type === 'password' ? (
                <div className="password-input">
                  <input
                    {...common}
                    className={`form-control ${invalid ? 'is-invalid' : ''}`}
                    type={visiblePasswords[field.name] ? 'text' : 'password'}
                    value={String(values[field.name])}
                    maxLength={field.maxLength}
                    autoComplete={field.autoComplete || 'current-password'}
                    onChange={(e) => change(e.target.value)}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    aria-label={
                      visiblePasswords[field.name] ? 'Ocultar contraseña' : 'Mostrar contraseña'
                    }
                    aria-pressed={Boolean(visiblePasswords[field.name])}
                    onClick={() =>
                      setVisiblePasswords((value) => ({
                        ...value,
                        [field.name]: !value[field.name],
                      }))
                    }
                  >
                    {visiblePasswords[field.name] ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              ) : (
                <input
                  {...common}
                  className={`form-control ${invalid ? 'is-invalid' : ''}`}
                  type={field.type === 'money' ? 'text' : field.type || 'text'}
                  inputMode={
                    field.type === 'money'
                      ? 'decimal'
                      : field.type === 'number' || field.name === 'pin'
                        ? 'numeric'
                        : undefined
                  }
                  value={String(values[field.name])}
                  min={field.min}
                  max={field.max}
                  minLength={field.minLength}
                  maxLength={field.maxLength}
                  autoComplete={
                    field.autoComplete ||
                    (field.name === 'pin'
                      ? 'off'
                      : field.type === 'password'
                        ? 'new-password'
                        : undefined)
                  }
                  onChange={(e) => change(e.target.value)}
                />
              )}
              <small id={`${fieldId}-help`} className={invalid ? 'invalid-message' : 'field-help'}>
                {invalid || field.help}
              </small>
            </div>
          );
        })}
      </div>
      {error && (
        <div className="alert alert-danger mt-3" role="alert">
          {error}
          {Object.keys(serverErrors).length > 0 && (
            <ul className="mb-0 mt-2">
              {fields
                .filter((field) => serverErrors[field.name])
                .map((field) => (
                  <li key={field.name}>
                    <a
                      href={`#${id}-${field.name}`}
                      onClick={(event) => {
                        event.preventDefault();
                        document.getElementById(`${id}-${field.name}`)?.focus();
                      }}
                    >
                      {field.label}: {serverErrors[field.name]}
                    </a>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
      <div className="form-actions">
        {footer}
        <button className="btn btn-primary" disabled={busy} type="submit">
          <Check size={16} />
          {busy ? 'Guardando…' : label}
        </button>
      </div>
    </form>
  );
}
export function PageHeading({
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <h1>{title}</h1>
      </div>
      <div className="heading-actions">{children}</div>
    </header>
  );
}
export function Back({ onClick }: { onClick: () => void }) {
  return (
    <button className="btn btn-link" onClick={onClick}>
      <ArrowLeft size={18} /> Volver
    </button>
  );
}
