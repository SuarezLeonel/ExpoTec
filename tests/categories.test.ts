import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { defaultCategory } from '../backend/src/modules/catalog-categories.ts';
import {
  categoryIsActive,
  categoryPath,
  categoryTree,
} from '../frontend/src/services/categories.ts';

test('las 27 secciones de la carta quedan bajo cinco categorías sin perder ninguna', async () => {
  const catalog = JSON.parse(
    await readFile(new URL('../backend/catalog/baguette-menu.json', import.meta.url), 'utf8'),
  );
  const sections = catalog.categories.map((c: { name: string }) => defaultCategory(c.name));
  assert.equal(sections.length, 27);
  assert.deepEqual(
    new Set(sections.map((c: { parent: string }) => c.parent)),
    new Set(['Cafetería', 'Desayunos', 'Cocina', 'Dulces', 'Bebidas']),
  );
  assert.equal(new Set(sections.map((c: { name: string }) => c.name)).size, 27);
});

test('navegación agrupa hijos, admite productos directos y excluye ramas inactivas o vacías', () => {
  const categories = [
    { id: 'coffee', name: 'Cafetería' },
    { id: 'classic', name: 'Cafés clásicos', parent_id: 'coffee' },
    { id: 'tea', name: 'Tés', parent_id: 'coffee', active: false },
    { id: 'food', name: 'Cocina', active: false },
    { id: 'pizza', name: 'Pizzas', parent_id: 'food' },
    { id: 'empty', name: 'Dulces' },
    { id: 'orphan', name: 'Sin superior', parent_id: 'missing' },
  ];
  const branches = categoryTree(categories, ['coffee', 'classic', 'tea', 'pizza']);
  assert.equal(branches.length, 1);
  assert.deepEqual(branches[0].categoryIds, ['coffee', 'classic']);
  assert.equal(categoryPath(categories, 'classic'), 'Cafetería › Cafés clásicos');
  assert.equal(categoryIsActive(categories, 'classic'), true);
  for (const id of ['pizza', 'food', 'tea', 'orphan', 'missing'])
    assert.equal(categoryIsActive(categories, id), false);
});
