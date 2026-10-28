import { useId } from 'react';

export function OrderNotes({
  value,
  onChange,
  disabled = false,
  destination,
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  destination?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  const suggestions =
    destination === 'bar'
      ? ['Sin azúcar', 'Sin hielo', 'Bien caliente', 'Tibio']
      : ['Sin sal', 'Sin aderezo', 'Bien cocido', 'Para compartir'];
  const parts = value
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
  return (
    <div className="order-notes-editor">
      <label className="form-label" htmlFor={id}>
        Observaciones
      </label>
      <textarea
        id={id}
        className="form-control"
        rows={3}
        maxLength={500}
        placeholder="Escribí cómo lo quiere el cliente…"
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
      />
      <div className="note-shortcuts" role="group" aria-label="Notas rápidas">
        {suggestions.map((note) => {
          const selected = parts.includes(note);
          const next = selected
            ? parts.filter((part) => part !== note).join('; ')
            : [...parts, note].join('; ');
          return (
            <button
              key={note}
              type="button"
              aria-pressed={selected}
              disabled={disabled || next.length > 500}
              onClick={() => onChange(next)}
            >
              {note}
            </button>
          );
        })}
      </div>
    </div>
  );
}
