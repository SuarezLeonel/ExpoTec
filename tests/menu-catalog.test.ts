import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const catalog = JSON.parse(
  await readFile(new URL('../backend/catalog/baguette-menu.json', import.meta.url), 'utf8'),
) as {
  categories: { name: string; destination: string; items: [string, number, string][] }[];
};

test('la carta conserva categorías, variantes y precios comprobados en las ocho páginas', () => {
  assert.equal(catalog.categories.length, 27);
  const items = catalog.categories.flatMap(({ items }) => items);
  assert.equal(items.length, 153);
  assert.equal(new Set(catalog.categories.map(({ name }) => name)).size, 27);
  for (const category of catalog.categories) {
    assert.ok(['bar', 'kitchen', 'none'].includes(category.destination));
    assert.equal(new Set(category.items.map(([name]) => name)).size, category.items.length);
    for (const [name, price, description] of category.items) {
      assert.ok(name.length >= 2 && name.length <= 120);
      assert.ok(Number.isSafeInteger(price * 100) && price > 0 && price <= 1_000_000);
      assert.ok(description.length <= 1000);
    }
  }
  const prices = new Map(items.map(([name, price]) => [name, price]));
  for (const [name, price] of [
    ['Ristretto', 4300],
    ['Café con leche', 6500],
    ['Porción de budín', 5000],
    ['Keto opción 2', 19600],
    ['Omelette de hongos y tomates', 16800],
    ['Café frío', 6600],
    ['Pasticer', 7600],
    ['Hamburguesa veggie', 19400],
    ['Menú ejecutivo', 18700],
    ['Wrap César con langostinos', 15900],
    ['Lomito a la plancha', 26600],
    ['César con langostinos', 21500],
    ['Pizza Margherita chica', 14000],
    ['Pizza Margherita grande', 23100],
    ['Pizza Pedro chica', 15200],
    ['Pizza Pedro grande', 24700],
    ['Stella Artois lata 473 ml', 7000],
    ['Stella Artois botella 730 ml', 10300],
  ] as const)
    assert.equal(prices.get(name), price, name);
});
