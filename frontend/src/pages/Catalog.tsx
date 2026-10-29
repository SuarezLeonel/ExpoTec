import { useState } from 'react';
import { Plus, Pencil, ExternalLink, ImagePlus } from 'lucide-react';
import {
  InlineConfirm,
  Dialog,
  Empty,
  FieldsForm,
  PageHeading,
  type FieldSpec,
} from '../components/UI';
import { useStore } from '../contexts/Store';
import { can } from '../services/permissions';
import { cents, date, money, post, statusLabel } from '../services/api';
import type { Addon, Category, Product, User } from '../types';
import { categoryIsActive, categoryPath } from '../services/categories';
type Entity = Product | Addon | Category | User;
export function Catalog({ users = false }: { users?: boolean }) {
  const { state, command } = useStore();
  const [requestedTab, setTab] = useState('product');
  const [edit, setEdit] = useState<Entity | 'new' | null>(null);
  const [remove, setRemove] = useState<{
    body: Record<string, unknown>;
    name: string;
  } | null>(null);
  const [search, setSearch] = useState('');
  const [image, setImage] = useState('');
  const [error, setError] = useState('');
  if (!state || !can(state, users ? 'manage_users' : 'manage_catalog')) return null;
  const tab = users ? 'user' : requestedTab;
  const plural: Record<string, string> = users
    ? { user: 'Usuarios' }
    : { product: 'Productos', category: 'Categorías', addon: 'Agregados' };
  const categoryRows = state.categories
    .filter((c) => !c.parent_id)
    .flatMap((parent) => [
      parent,
      ...state.categories.filter((child) => child.parent_id === parent.id),
    ]);
  const rows: Entity[] =
    tab === 'product'
      ? state.products
      : tab === 'category'
        ? categoryRows
        : tab === 'addon'
          ? state.addons
          : state.users;
  const visibleRows = rows.filter((row) =>
    `${row.name} ${'username' in row ? row.username : ''} ${'category_id' in row ? categoryPath(state.categories, row.category_id) : ''} ${'parent_id' in row ? categoryPath(state.categories, row.id) : ''}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  const obj = edit && edit !== 'new' ? (edit as unknown as Record<string, unknown>) : {};
  const fields: FieldSpec[] = [];
  if (tab === 'user')
    fields.push(
      {
        name: 'username',
        label: 'Usuario de acceso',
        value: String(obj.username || ''),
        required: true,
        minLength: 3,
        maxLength: 60,
        pattern: '^[a-zA-Z0-9._-]{3,60}$',
      },
      {
        name: 'name',
        label: 'Nombre y apellido',
        value: String(obj.name || ''),
        required: true,
        minLength: 2,
        maxLength: 100,
        pattern: "^[\\p{L}\\p{M} '\u2019]{2,100}$",
        help: 'Entre 2 y 100 caracteres: letras, espacios o apóstrofes.',
      },
      {
        name: 'role',
        label: 'Rol',
        value: String(obj.role || 'waiter'),
        required: true,
        options: [
          { value: 'waiter', label: 'Camarero' },
          { value: 'cashier', label: 'Cajero' },
          { value: 'kitchen', label: 'Cocina' },
          { value: 'admin', label: 'Encargado' },
        ],
      },
      {
        name: 'password',
        label: edit === 'new' ? 'Contraseña inicial' : 'Nueva contraseña (opcional)',
        type: 'password',
        required: edit === 'new',
        minLength: 12,
        maxLength: 128,
        pattern: '^.{12,128}$',
        help: 'Entre 12 y 128 caracteres.',
      },
    );
  if (tab === 'user')
    fields.push({
      name: 'pin',
      label: 'PIN de comanda (últimos 4 del DNI)',
      type: 'password',
      maxLength: 4,
      pattern: '[0-9]{4}',
      help: '4 dígitos. Vacío conserva el actual.',
    });
  else
    fields.push({
      name: 'name',
      label: 'Nombre',
      value: String(obj.name || ''),
      required: true,
      minLength: 2,
      maxLength: tab === 'product' ? 120 : 100,
    });
  if (tab === 'product' || tab === 'addon')
    fields.push({
      name: 'price_cents',
      label: 'Precio ($)',
      type: 'money',
      value: obj.price_cents !== undefined ? (Number(obj.price_cents) / 100).toFixed(2) : '',
      required: true,
    });
  if (tab === 'product')
    fields.push(
      {
        name: 'variant_group',
        label: 'Producto base (opcional)',
        value: String(obj.variant_group || ''),
        maxLength: 100,
        help: 'Usá el mismo nombre y subcategoría para agrupar opciones. Ejemplo: Café.',
      },
      {
        name: 'variant_name',
        label: 'Nombre de la variante',
        value: String(obj.variant_name || ''),
        maxLength: 120,
        help: 'Ejemplo: Con leche o Doble. Dejá ambos campos vacíos para un producto individual.',
      },
      {
        name: 'description',
        label: 'Descripción',
        type: 'textarea',
        value: String(obj.description || ''),
        maxLength: 1000,
      },
      {
        name: 'category_id',
        label: 'Categoría / subcategoría',
        value: String(obj.category_id || ''),
        required: true,
        options: state.categories
          .filter((c) => categoryIsActive(state.categories, c.id) || c.id === obj.category_id)
          .map((c) => ({ value: c.id, label: categoryPath(state.categories, c.id) }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      },
      {
        name: 'destination',
        label: 'Destino de preparación',
        required: true,
        value: String(obj.destination || 'kitchen'),
        options: [
          { value: 'kitchen', label: 'Cocina' },
          { value: 'bar', label: 'Bar' },
          { value: 'none', label: 'Sin preparación' },
        ],
      },
      {
        name: 'image_url',
        label: 'Ruta de imagen cargada',
        value: image || String(obj.image_url || ''),
        maxLength: 400,
        pattern: '^/uploads/[a-f0-9-]+\\.(png|jpg|webp)$',
        help: 'Primero cargá el archivo y luego guardá el producto.',
      },
      {
        name: 'addon_ids',
        label: 'Agregados permitidos',
        type: 'multiselect',
        value: (obj.addon_ids as string[]) || [],
        options: state.addons
          .filter((a) => a.active !== false)
          .map((a) => ({
            value: a.id,
            label: `${a.name} · ${money(a.price_cents)}`,
          })),
      },
      {
        name: 'available',
        label: 'Disponible para pedir',
        type: 'checkbox',
        value: Boolean(obj.available ?? true),
      },
      {
        name: 'visible_en_carta',
        label: 'Visible en la carta pública',
        type: 'checkbox',
        value: Boolean(obj.visible_en_carta ?? true),
      },
    );
  if (tab === 'category')
    fields.push({
      name: 'parent_id',
      label: 'Categoría principal',
      value: String(obj.parent_id || ''),
      options: [
        { value: '', label: 'Sin superior: es una categoría principal' },
        ...state.categories
          .filter(
            (c) =>
              !c.parent_id && c.id !== obj.id && (c.active !== false || c.id === obj.parent_id),
          )
          .map((c) => ({ value: c.id, label: c.name })),
      ],
      help: 'Elegí una principal para crear una subcategoría. Se admiten dos niveles.',
    });
  if (tab === 'category')
    fields.push({
      name: 'sort_order',
      label: 'Orden en la carta',
      type: 'number',
      value: Number(obj.sort_order ?? 0),
      min: 0,
      max: 9999,
      help: 'Los números menores aparecen primero.',
    });
  fields.push({
    name: 'active',
    label: 'Registro activo',
    type: 'checkbox',
    value: Boolean(obj.active ?? true),
  });
  return (
    <>
      <PageHeading eyebrow="ADMINISTRACIÓN" title={users ? 'Usuarios' : 'Catálogo'}>
        {!users && (
          <a className="btn btn-outline-primary" href="/carta" target="_blank" rel="noreferrer">
            <ExternalLink size={17} /> Carta pública
          </a>
        )}
        {!users && tab !== 'category' && (
          <button
            className="btn btn-outline-primary"
            onClick={() => {
              setTab('category');
              setSearch('');
              setEdit('new');
              setImage('');
            }}
          >
            <Plus size={17} /> Crear categoría
          </button>
        )}
        <button
          className="btn btn-primary"
          onClick={() => {
            setEdit('new');
            setImage('');
          }}
        >
          <Plus size={17} />{' '}
          {tab === 'category'
            ? 'Crear categoría'
            : `Agregar ${tab === 'product' ? 'producto' : tab === 'addon' ? 'agregado' : 'usuario'}`}
        </button>
      </PageHeading>
      {!users && (
        <nav className="category-tabs" aria-label="Administrar catálogo">
          {Object.entries(plural).map(([key, label]) => (
            <button
              key={key}
              className={tab === key ? 'active' : ''}
              aria-pressed={tab === key}
              onClick={() => {
                setTab(key);
                setSearch('');
              }}
            >
              {label}
            </button>
          ))}
        </nav>
      )}
      <div className="panel">
        <label className="form-label" htmlFor="catalog-search">
          Buscar en {plural[tab].toLowerCase()}
        </label>
        <input
          id="catalog-search"
          className="form-control catalog-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <p className="search-result-count" role="status">
          {visibleRows.length} de {rows.length} {plural[tab].toLowerCase()}
          {tab === 'category' &&
            ` · ${state.categories.filter((c) => !c.parent_id).length} principales y ${state.categories.filter((c) => c.parent_id).length} subcategorías`}
        </p>
        {visibleRows.length ? (
          <div className="table-responsive">
            <table className="table catalog-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  {['product', 'category'].includes(tab) && <th>Ubicación</th>}
                  {['product', 'addon'].includes(tab) && <th>Precio</th>}
                  <th>Estado</th>
                  {tab === 'product' && (
                    <>
                      <th>Carta</th>
                      <th>Destino</th>
                      <th>Creado</th>
                    </>
                  )}
                  {tab === 'user' && <th>Rol</th>}
                  <th>
                    <span className="visually-hidden">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.name}</strong>
                      {tab === 'category' && 'parent_id' in r && r.parent_id && (
                        <small>Subcategoría</small>
                      )}
                      {'variant_group' in r && r.variant_group && (
                        <small>
                          {r.variant_group} · {r.variant_name}
                        </small>
                      )}
                      {'description' in r && <small>{r.description}</small>}
                      {'username' in r && <small>{r.username}</small>}
                    </td>
                    {tab === 'product' && 'category_id' in r && (
                      <td>{categoryPath(state.categories, r.category_id)}</td>
                    )}
                    {tab === 'category' && (
                      <td>
                        {'parent_id' in r && r.parent_id
                          ? state.categories.find((c) => c.id === r.parent_id)?.name
                          : 'Principal'}
                      </td>
                    )}
                    {'price_cents' in r && <td>{money(r.price_cents)}</td>}
                    <td>
                      {r.active === false ? 'Inactivo' : 'Activo'}
                      {'available' in r && (
                        <small>{r.available ? 'Disponible' : 'No disponible'}</small>
                      )}
                    </td>
                    {'visible_en_carta' in r && (
                      <>
                        <td>{r.visible_en_carta ? 'Visible' : 'Oculto'}</td>
                        <td>
                          {r.destination === 'kitchen'
                            ? 'Cocina'
                            : r.destination === 'bar'
                              ? 'Bar'
                              : 'Sin preparación'}
                        </td>
                        <td>{date(r.created_at)}</td>
                      </>
                    )}
                    {'role' in r && <td>{statusLabel[r.role] || r.role}</td>}
                    <td>
                      <button
                        className="btn btn-sm btn-outline-primary"
                        aria-label={`Editar ${r.name}`}
                        onClick={() => {
                          setEdit(r);
                          setImage('');
                        }}
                      >
                        <Pencil size={15} /> Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>
            <strong>{rows.length ? 'No hay coincidencias.' : 'Todavía no hay registros.'}</strong>
            {search ? (
              <>
                <button className="btn btn-outline-primary mt-3" onClick={() => setSearch('')}>
                  Limpiar búsqueda
                </button>
              </>
            ) : (
              <p>Agregá el primer registro.</p>
            )}
          </Empty>
        )}
      </div>
      {edit && (
        <Dialog
          title={`${edit === 'new' ? 'Agregar' : 'Editar'} ${tab === 'product' ? 'producto' : tab === 'category' ? 'categoría' : tab === 'addon' ? 'agregado' : 'usuario'}`}
          close={() => {
            setEdit(null);
            setRemove(null);
          }}
          wide
        >
          {tab === 'product' && (
            <div className="image-upload">
              <label className="form-label" htmlFor="product-image">
                <ImagePlus size={16} /> Cargar imagen (PNG, JPEG o WebP; hasta 2 MB)
              </label>
              <input
                id="product-image"
                className="form-control"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (
                    file.size > 2 * 1024 * 1024 ||
                    !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
                  ) {
                    setError('Usá PNG, JPEG o WebP de hasta 2 MB.');
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => {
                    void post<{ image_url: string }>('products/image', {
                      name: file.name,
                      content_base64: String(reader.result).split(',')[1],
                    })
                      .then((r) => {
                        setImage(r.image_url);
                        setError('');
                      })
                      .catch((err) => setError(err.message));
                  };
                  reader.readAsDataURL(file);
                }}
              />
              {image && <p className="small">Imagen validada: {image}</p>}
              {error && (
                <p className="invalid-message" role="alert">
                  {error}
                </p>
              )}
            </div>
          )}
          <div hidden={Boolean(remove)}>
            <FieldsForm
              key={`${tab}-${edit === 'new' ? 'new' : edit.id}`}
              fields={fields}
              submit={async (v) => {
                const body: Record<string, unknown> = {
                  ...v,
                  ...(edit !== 'new' ? { id: edit.id } : {}),
                };
                if ('price_cents' in v) body.price_cents = cents(String(v.price_cents));
                if (tab === 'category') body.parent_id = v.parent_id || null;
                if (tab === 'category') body.sort_order = Number(v.sort_order);
                if (v.password === '') delete body.password;
                if (v.pin === '') delete body.pin;
                if (v.image_url === '') body.image_url = '';
                if (image) body.image_url = image;
                if (v.active === false && edit !== 'new' && edit.active !== false) {
                  setRemove({ body, name: edit.name });
                  return;
                }
                await command(`${tab}.save`, body);
                setEdit(null);
              }}
            />
          </div>
          {remove && (
            <InlineConfirm
              title={`Desactivar ${remove.name}`}
              text="El registro conservará su historial y dejará de estar habilitado para nuevas operaciones. Confirmá la baja lógica."
              close={() => setRemove(null)}
              proceed={async () => {
                await command(`${tab}.save`, remove.body);
                setEdit(null);
              }}
            />
          )}
        </Dialog>
      )}
    </>
  );
}
