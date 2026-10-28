import { Sun, Moon, Laptop } from 'lucide-react';
import { useTheme, type ThemePreference } from '../contexts/Theme';

export function ThemeSelector({
  compact = false,
  className = '',
}: {
  compact?: boolean;
  className?: string;
}) {
  const { preference, resolvedTheme, setPreference } = useTheme();

  const options: {
    id: ThemePreference;
    label: string;
    icon: typeof Sun;
    title: string;
  }[] = [
    {
      id: 'light',
      label: 'Claro',
      icon: Sun,
      title: 'Tema claro (luminoso y cálido)',
    },
    {
      id: 'system',
      label: 'Sistema',
      icon: Laptop,
      title: `Tema automático (según tu dispositivo: ${resolvedTheme === 'dark' ? 'oscuro' : 'claro'})`,
    },
    {
      id: 'dark',
      label: 'Oscuro',
      icon: Moon,
      title: 'Tema oscuro (descanso visual)',
    },
  ];

  return (
    <div
      className={`theme-selector-group ${compact ? 'is-compact' : ''} ${className}`}
      role="radiogroup"
      aria-label="Preferencia de tema de apariencia"
    >
      {options.map((opt) => {
        const Icon = opt.icon;
        const isSelected = preference === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            className={`theme-selector-btn ${isSelected ? 'is-active' : ''}`}
            onClick={() => setPreference(opt.id)}
            title={opt.title}
            aria-label={opt.title}
          >
            <Icon size={compact ? 15 : 16} strokeWidth={1.8} aria-hidden="true" />
            {!compact && <span className="theme-selector-label">{opt.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
