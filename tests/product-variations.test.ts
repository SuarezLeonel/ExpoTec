import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { defaultVariation } from '../backend/src/modules/catalog-variations.js';
import { schemas } from '../backend/src/modules/validation.js';
import {
  groupPrice,
  groupProducts,
  matchesProductGroup,
} from '../frontend/src/services/product-variations.ts';
import type { Product } from '../frontend/src/types/index.ts';

const catalog = JSON.parse(
  await readFile(new URL('../backend/catalog/baguette-menu.json', import.meta.url), 'utf8'),
);
const products: Product[] = catalog.categories.flatMap(
  (c: { name: string; items: [string, number, string][] }, index: number) =>
    c.items.map(([name, price, description], item) => ({
      id: `${index}-${item}`,
      category_id: String(index),
      name,
      description,
      price_cents: price * 100,
      ...defaultVariation(c.name, name),
      image_url: null,
      destination: 'bar',
      available: true,
      active: true,
      visible_en_carta: true,
      created_at: '',
    })),
);

test('agrupa la carta completa sin perder variantes, categorías ni precios', () => {
  const groups = groupProducts(products);
  assert.ok(groups.length < 110, `${groups.length} productos base`);
  assert.equal(groups.flatMap((g) => g.variants).length, 153);
  assert.deepEqual(
    new Set(groups.flatMap((g) => g.variants.map((p) => `${p.id}:${p.price_cents}`))),
    new Set(products.map((p) => `${p.id}:${p.price_cents}`)),
  );
  const coffee = groups.find((g) => g.name === 'Café')!;
  assert.ok(
    coffee.variants.some((p) => p.variant_name === 'Con leche' && p.price_cents === 650000),
  );
  assert.ok(coffee.variants.some((p) => p.variant_name === 'Doble' && p.price_cents === 660000));
  const pizza = groups.find((g) => g.name === 'Pizza Margherita')!;
  assert.deepEqual(
    pizza.variants.map((p) => [p.variant_name, p.price_cents]),
    [
      ['Chica', 1400000],
      ['Grande', 2310000],
    ],
  );
});

test('familias configuradas respetan categorías y los productos individuales no se fusionan por nombre', () => {
  const base = products[0];
  const grouped = groupProducts([
    { ...base, id: 'a', variant_group: 'Café', variant_name: 'Doble' },
    { ...base, id: 'b', variant_group: 'café', variant_name: 'Con leche' },
    { ...base, id: 'c', category_id: 'other', variant_group: 'Café', variant_name: 'Frío' },
    { ...base, id: 'd', variant_group: '', variant_name: '' },
    { ...base, id: 'e', variant_group: '', variant_name: '' },
  ]);
  assert.deepEqual(
    grouped.map((g) => g.variants.length),
    [2, 1, 1, 1],
  );
});

test('el catálogo exige la pareja completa de campos de variante y admite clientes anteriores', () => {
  const product = {
    name: 'Café con leche',
    description: '',
    category_id: '10000000-0000-4000-8000-000000000001',
    price_cents: 650000,
    image_url: '',
    destination: 'bar',
    available: true,
    active: true,
    visible_en_carta: true,
    addon_ids: [],
  };
  const schema = schemas['product.save'];
  assert.ok(schema.safeParse(product).success);
  assert.ok(schema.safeParse({ ...product, variant_group: '', variant_name: '' }).success);
  assert.ok(
    schema.safeParse({ ...product, variant_group: 'Café', variant_name: 'Con leche' }).success,
  );
  for (const partial of [
    { variant_group: '' },
    { variant_name: '' },
    { variant_group: 'Café' },
    { variant_name: 'Con leche' },
    { variant_group: 'Café', variant_name: ' ' },
  ])
    assert.equal(schema.safeParse({ ...product, ...partial }).success, false);
});

test('la búsqueda encuentra variantes sin tildes y el precio desde usa opciones disponibles', () => {
  const coffee = groupProducts(products).find((g) => g.name === 'Café')!;
  assert.ok(matchesProductGroup(coffee, 'cafe leche'));
  assert.ok(matchesProductGroup(coffee, '  DESCAFEINADO  '));
  assert.equal(matchesProductGroup(coffee, 'pizza'), false);
  const available = {
    ...coffee,
    variants: coffee.variants.map((p) => ({ ...p, available: p.variant_name === 'Doble' })),
  };
  assert.equal(groupPrice(available), 660000);
});

test('la migración existente y las futuras importaciones usan las mismas variantes iniciales', async () => {
  const migration = await readFile(
    new URL('../backend/sql/010_product_variations.sql', import.meta.url),
    'utf8',
  );
  for (const category of catalog.categories)
    for (const [name] of category.items) {
      const preset = defaultVariation(category.name, name);
      if (preset.variant_group) {
        const row = [category.name, name, preset.variant_group, preset.variant_name]
          .map((v) => `'${v.replaceAll("'", "''")}'`)
          .join(',');
        assert.ok(migration.includes(`(${row})`), name);
      }
    }
});
