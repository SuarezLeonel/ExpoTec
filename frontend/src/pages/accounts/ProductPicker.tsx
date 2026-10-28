import { useRef, useState } from 'react';
import { Search, Plus, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { Dialog, Empty } from '../../components/UI';
import { useStore } from '../../contexts/Store';
import {
  groupProducts,
  matchesProductGroup,
  type ProductGroup,
} from '../../services/product-variations';
import { ProductComposer } from './ProductComposer';
import { CategoryNavigation } from '../../components/CategoryNavigation';
import { categoryIsActive, categoryTree } from '../../services/categories';
import type { Account, Product } from '../../types';

export function ProductPicker({
  account,
  close,
  embedded = false,
  ensureAccount,
  draftScope,
  onAdd,
}: {
  account?: Account;
  close: () => void;
  embedded?: boolean;
  ensureAccount?: () => Promise<Account>;
  draftScope?: string;
  onAdd?: (product: Product, quantity: number, addonIds: string[], notes: string) => void;
}) {
  const { state, command, session, busy, activeTableId } = useStore();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [chosen, setChosen] = useState<ProductGroup | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const addingRef = useRef(false);
  const origin = useRef('');
  const [draftAccount, setDraftAccount] = useState('');
  if (!state) return null;
  const allGroups = groupProducts(
    state.products.filter((p) => p.active && categoryIsActive(state.categories, p.category_id)),
  );
  const branches = categoryTree(
    state.categories,
    allGroups.filter((g) => g.variants.some((p) => p.available)).map((g) => g.category_id),
  );
  const branch = branches.find((b) => b.category.id === category);
  const groups = allGroups.filter(
    (g) =>
      g.variants.some((p) => p.available) &&
      (!category ||
        (subcategory
          ? g.category_id === subcategory
          : branch?.categoryIds.includes(g.category_id))) &&
      matchesProductGroup(g, search),
  );
  const currentGroup = chosen && allGroups.find((g) => g.id === chosen.id);
  function back() {
    setChosen(null);
    requestAnimationFrame(() => document.getElementById(origin.current)?.focus());
  }
  async function add(
    p: Product,
    quantity = 1,
    addonIds: string[] = [],
    notes = '',
    keepOpen = false,
  ) {
    if (addingRef.current) throw new Error('Esperá a que termine de agregarse el producto.');
    addingRef.current = true;
    setAdding(true);
    setError('');
    try {
      if (onAdd) {
        onAdd(p, quantity, addonIds, notes);
        setFeedback(`Agregaste ${quantity} de ${p.name} al pedido.`);
        if (!keepOpen) back();
        return;
      }
      const current = account || (await ensureAccount?.());
      if (!current) throw new Error('Abrí una cuenta antes de agregar productos.');
      await command('item.add', {
        account_id: current.id,
        version: current.version,
        product_id: p.id,
        quantity,
        addon_ids: addonIds,
        notes,
      });
      setFeedback(`Agregaste ${quantity} de ${p.name} al pedido.`);
      if (!keepOpen) back();
      if (!embedded && !keepOpen) close();
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      addingRef.current = false;
      setAdding(false);
    }
  }
  const content = (
    <section className="order-catalog" aria-label="Carta para comandar" aria-busy={adding}>
      <p className="visually-hidden" role="status">
        {adding ? 'Agregando…' : feedback}
      </p>
      {error && (
        <p className="invalid-message" role="alert">
          {error}
        </p>
      )}
      {currentGroup ? (
        <ProductComposer
          key={currentGroup.id}
          group={currentGroup}
          addons={state.addons}
          draftKey={`baguette.order-draft.${session?.user.id}.${draftAccount}.${currentGroup.id}`}
          busy={adding || busy}
          back={back}
          submit={(product, quantity, addonIds, notes) =>
            add(product, quantity, addonIds, notes, true)
          }
        />
      ) : (
        <>
          {chosen && (
            <p role="alert" className="invalid-message">
              El producto ya no está disponible.
            </p>
          )}
          <div className="search-field">
            <Search size={18} />
            <label className="visually-hidden" htmlFor="product-search">
              Buscar producto
            </label>
            <input
              id="product-search"
              className="form-control"
              placeholder="Buscar producto o variante…"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <CategoryNavigation
            branches={branches}
            category={category}
            subcategory={subcategory}
            label="Filtrar productos"
            change={(parent, child) => {
              setCategory(parent);
              setSubcategory(child);
            }}
          />
          <div className="product-picker">
            {groups.map((g) => (
              <article
                key={g.id}
                className={`product-tile ${g.hasVariations ? 'product-family' : ''}`}
              >
                <button
                  id={`product-group-${encodeURIComponent(g.id)}`}
                  className="product-option"
                  aria-label={
                    g.hasVariations
                      ? `${g.name} ${g.variants.filter((p) => p.available).length} ${g.variants.filter((p) => p.available).length === 1 ? 'variante' : 'variantes'}`
                      : g.name
                  }
                  disabled={adding || busy}
                  onClick={(event) => {
                    if (!g.hasVariations) {
                      void add(g.variants[0], 1, [], '', true).catch(() => undefined);
                      return;
                    }
                    origin.current = event.currentTarget.id;
                    setDraftAccount(account?.id || draftScope || activeTableId || 'new');
                    setChosen(g);
                    setError('');
                  }}
                >
                  <strong>{g.name}</strong>
                  {g.hasVariations && <ChevronRight size={17} aria-hidden="true" />}
                </button>
                {!g.hasVariations && (
                  <>
                    {state.addons.some(
                      (a) => a.active !== false && g.variants[0].addon_ids?.includes(a.id),
                    ) && (
                      <button
                        id={`product-addons-${encodeURIComponent(g.id)}`}
                        className="quick-add"
                        aria-label={`Agregados de ${g.name}`}
                        disabled={adding || busy}
                        onClick={(event) => {
                          origin.current = event.currentTarget.id;
                          setDraftAccount(account?.id || draftScope || activeTableId || 'new');
                          setChosen(g);
                          setError('');
                        }}
                      >
                        <SlidersHorizontal size={20} />
                      </button>
                    )}
                    <button
                      className="quick-add"
                      aria-label={`Agregar 1 ${g.name}`}
                      disabled={adding || busy}
                      onClick={() => {
                        void add(g.variants[0], 1, [], '', true).catch(() => undefined);
                      }}
                    >
                      <Plus size={22} />
                    </button>
                  </>
                )}
              </article>
            ))}
          </div>
          {!groups.length && (
            <Empty>
              <strong>Sin productos.</strong>
              {search || category ? (
                <button
                  className="btn btn-outline-primary mt-3"
                  onClick={() => {
                    setSearch('');
                    setCategory('');
                    setSubcategory('');
                  }}
                >
                  Limpiar filtros
                </button>
              ) : (
                <p>Consultá al encargado.</p>
              )}
            </Empty>
          )}
        </>
      )}
    </section>
  );
  return embedded ? (
    content
  ) : (
    <Dialog title="Carta para comandar" close={close} wide>
      {content}
    </Dialog>
  );
}
