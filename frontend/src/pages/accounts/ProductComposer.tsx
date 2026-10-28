import { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { ProductGroup } from '../../services/product-variations';
import type { Addon, Product } from '../../types';

export function ProductComposer({
  group,
  addons,
  draftKey,
  back,
  submit,
  busy,
}: {
  group: ProductGroup;
  addons: Addon[];
  draftKey: string;
  back: () => void;
  submit: (product: Product, quantity: number, addonIds: string[], notes: string) => Promise<void>;
  busy: boolean;
}) {
  const [addonIds, setAddonIds] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey) || 'null');
      return Array.isArray(saved?.addonIds)
        ? saved.addonIds.filter((id: unknown) => typeof id === 'string')
        : [];
    } catch {
      return [];
    }
  });
  const heading = useRef<HTMLHeadingElement>(null);
  const options = addons.filter(
    (a) =>
      a.active !== false && group.variants.some((p) => p.available && p.addon_ids?.includes(a.id)),
  );
  const selected = options.filter((a) => addonIds.includes(a.id)).map((a) => a.id);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    try {
      if (addonIds.length) localStorage.setItem(draftKey, JSON.stringify({ addonIds }));
      else localStorage.removeItem(draftKey);
    } catch {
      /* Ordering remains available without browser storage. */
    }
  }, [draftKey, addonIds]);
  return (
    <section className="product-composer" aria-label="Opciones de producto">
      <div className="composer-heading">
        <button
          className="btn btn-outline-primary composer-back"
          type="button"
          aria-label="Volver a productos"
          title="Volver a productos"
          disabled={busy}
          onClick={back}
        >
          <ArrowLeft size={18} />
        </button>
        <h3 ref={heading} tabIndex={-1}>
          {group.name}
        </h3>
      </div>
      <div className="composer-fields">
        <div
          className="variant-fieldset"
          role="group"
          aria-label={group.hasVariations ? 'Variantes' : 'Producto'}
        >
          <div className="variant-options">
            {group.variants.map((product) => {
              const incompatible = selected.some((id) => !product.addon_ids?.includes(id));
              return (
                <button
                  key={product.id}
                  type="button"
                  className={`variant-option ${!product.available || incompatible ? 'unavailable' : ''}`}
                  disabled={busy || !product.available || incompatible}
                  onClick={() => {
                    void submit(product, 1, selected, '').catch(() => undefined);
                  }}
                >
                  <span>
                    {product.variant_name || product.name}
                    {!product.available && <small>Sin disponibilidad</small>}
                    {product.available && incompatible && <small>No admite estos agregados</small>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        {options.length > 0 && (
          <fieldset className="addon-fieldset" disabled={busy}>
            <legend>Agregados</legend>
            <div className="addon-options">
              {options.map((addon) => (
                <label key={addon.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(addon.id)}
                    onChange={(event) =>
                      setAddonIds(
                        event.target.checked
                          ? [...selected, addon.id]
                          : selected.filter((id) => id !== addon.id),
                      )
                    }
                  />
                  <span>{addon.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </div>
    </section>
  );
}
