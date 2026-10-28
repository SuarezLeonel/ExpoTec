import { useEffect, useState } from 'react';
import { money, post } from '../services/api';
import type { Category, Product } from '../types';
import { groupProducts } from '../services/product-variations';
import { categoryTree } from '../services/categories';
import { CategoryNavigation } from '../components/CategoryNavigation';
import { ThemeSelector } from '../components/ThemeSelector';
export function Menu() {
  const [data, setData] = useState<{
    categories: Category[];
    products: Product[];
  } | null>(null);
  const [filter, setFilter] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    void post<{ categories: Category[]; products: Product[] }>('public/menu')
      .then((value) => {
        setData(value);
        localStorage.setItem('baguette.menu.v1', JSON.stringify(value));
      })
      .catch(() => {
        const saved = localStorage.getItem('baguette.menu.v1');
        if (saved) {
          setData(JSON.parse(saved));
          setError('Carta guardada sin conexión: los precios pueden haber cambiado.');
        } else setError('No pudimos cargar la carta. Volvé a intentar con conexión.');
      });
  }, []);
  const branches = data
    ? categoryTree(
        data.categories,
        data.products.map((p) => p.category_id),
      )
    : [];
  return (
    <main className="public-menu">
      <header className="menu-masthead">
        <img src="/brand/baguette-logo.svg" alt="Café" width="208" height="79" />
        <ThemeSelector compact className="menu-theme-selector" />
      </header>
      <div className="menu-content">
        <div className="page-heading">
          <h1>Nuestra carta</h1>
        </div>
        <p className="menu-disclaimer">Precios en ARS.</p>
        {error && (
          <div className="alert alert-warning" role="status">
            {error}
          </div>
        )}
        <CategoryNavigation
          branches={branches}
          category={filter}
          subcategory={subcategory}
          label="Categorías de la carta"
          change={(parent, child) => {
            setFilter(parent);
            setSubcategory(child);
          }}
        />
        {!data ? (
          <p role="status">Cargando la carta…</p>
        ) : (
          branches
            .filter((b) => !filter || b.category.id === filter)
            .map((branch) => (
              <section key={branch.category.id} className="menu-category">
                <h2>{branch.category.name}</h2>
                {[branch.category, ...branch.children]
                  .filter(
                    (c) =>
                      (!subcategory || c.id === subcategory) &&
                      data.products.some((p) => p.category_id === c.id),
                  )
                  .map((c) => (
                    <section key={c.id} className="menu-subcategory">
                      <h3>
                        {c.parent_id ? c.name : branch.children.length ? 'General' : 'Productos'}
                      </h3>
                      <div className="menu-products">
                        {groupProducts(data.products.filter((p) => p.category_id === c.id)).map(
                          (group) => {
                            const p = group.variants[0];
                            return (
                              <article
                                key={group.id}
                                className={`menu-product ${group.hasVariations ? 'menu-product-family' : ''}`}
                              >
                                {p.image_url && <img src={p.image_url} alt={group.name} />}
                                <div>
                                  <h4>{group.name}</h4>
                                  {group.hasVariations ? (
                                    <ul
                                      className="menu-variations"
                                      aria-label={`Variantes de ${group.name}`}
                                    >
                                      {group.variants.map((variant) => (
                                        <li key={variant.id}>
                                          <div>
                                            <span>{variant.variant_name || variant.name}</span>
                                            {variant.description && <p>{variant.description}</p>}
                                            {variant.available === false && (
                                              <small className="invalid-message">
                                                Sin disponibilidad
                                              </small>
                                            )}
                                          </div>
                                          <strong>{money(variant.price_cents)}</strong>
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p>{p.description}</p>
                                  )}
                                  {!group.hasVariations && p.available === false && (
                                    <small className="invalid-message">Sin disponibilidad</small>
                                  )}
                                </div>
                                {!group.hasVariations && <strong>{money(p.price_cents)}</strong>}
                              </article>
                            );
                          },
                        )}
                      </div>
                    </section>
                  ))}
              </section>
            ))
        )}
      </div>
    </main>
  );
}
