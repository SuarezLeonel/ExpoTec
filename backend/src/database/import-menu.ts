import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { config } from '../config/env.js';
import { auditEvent } from '../modules/audit.js';
import { one, pool, rows, transaction } from './db.js';
import { defaultVariation } from '../modules/catalog-variations.js';
import { defaultCategory } from '../modules/catalog-categories.js';

const catalog = z
  .object({
    source: z.url(),
    document: z.url(),
    checked_at: z.iso.date(),
    currency: z.literal('ARS'),
    categories: z
      .array(
        z.object({
          name: z.string().min(2).max(100),
          destination: z.enum(['bar', 'kitchen', 'none']),
          // Prices in the source PDF are whole pesos; the database stores centavos.
          items: z
            .array(
              z.tuple([
                z.string().min(2).max(120),
                z.number().int().positive().max(1_000_000),
                z.string().max(1000),
              ]),
            )
            .nonempty(),
        }),
      )
      .nonempty(),
  })
  .parse(
    JSON.parse(
      await readFile(new URL('../../catalog/baguette-menu.json', import.meta.url), 'utf8'),
    ),
  );

assert.ok(config.demo, 'La importación está limitada a la demo.');
assert.equal(new Set(catalog.categories.map(({ name }) => name)).size, catalog.categories.length);
for (const category of catalog.categories)
  assert.equal(new Set(category.items.map(([name]) => name)).size, category.items.length);

const operation = `catalog.import.baguette.${catalog.checked_at}`;
const legacyIds = Array.from(
  { length: 6 },
  (_, index) => `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
);

try {
  const result = await transaction(async (db) => {
    if (await one(db, 'SELECT 1 FROM audit_events WHERE operation=$1', [operation]))
      return {
        imported: false,
        reason: 'Esta carta ya fue importada; se conservan las ediciones posteriores.',
      };

    const before = await rows(
      db,
      'SELECT id,name,active,visible_en_carta FROM products WHERE id=ANY($1::uuid[])',
      [legacyIds],
    );
    const imported: string[] = [];
    for (const category of catalog.categories) {
      const section = defaultCategory(category.name);
      const parent = section.parent
        ? await one(
            db,
            'INSERT INTO categories(name) VALUES($1) ON CONFLICT(name) DO UPDATE SET active=true RETURNING id',
            [section.parent],
          )
        : undefined;
      const saved = await one(
        db,
        'INSERT INTO categories(name,parent_id,created_at) VALUES($1,$2,clock_timestamp()) ON CONFLICT(name) DO UPDATE SET active=true,parent_id=excluded.parent_id,updated_at=now() RETURNING id',
        [section.name, parent?.id ?? null],
      );
      for (const [name, price, description] of category.items) {
        const id = randomUUID();
        const variation = defaultVariation(category.name, name);
        await db.query(
          'INSERT INTO products(id,category_id,name,description,price_cents,destination,variant_group,variant_name,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,clock_timestamp())',
          [
            id,
            saved!.id,
            name,
            description,
            price * 100,
            category.destination,
            variation.variant_group,
            variation.variant_name,
          ],
        );
        imported.push(id);
      }
    }
    await db.query(
      'UPDATE products SET active=false,visible_en_carta=false,updated_at=now() WHERE id=ANY($1::uuid[])',
      [legacyIds],
    );
    const retiredCategories = await rows(
      db,
      "UPDATE categories c SET active=false,updated_at=now() WHERE id IN ('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003') AND NOT EXISTS(SELECT 1 FROM products p JOIN categories leaf ON leaf.id=p.category_id WHERE (leaf.id=c.id OR leaf.parent_id=c.id) AND p.active) RETURNING id,name",
    );
    const checked = await one(
      db,
      'SELECT count(*)::int count,sum(price_cents)::bigint total FROM products WHERE id=ANY($1::uuid[])',
      [imported],
    );
    const items = catalog.categories.flatMap(({ items }) => items);
    assert.equal(checked!.count, items.length);
    assert.equal(
      Number(checked!.total),
      items.reduce((sum, [, price]) => sum + price * 100, 0),
    );
    await auditEvent(
      db,
      undefined,
      operation,
      'catalog',
      undefined,
      { legacy_products: before },
      {
        source: catalog.source,
        document: catalog.document,
        categories: catalog.categories.length,
        product_ids: imported,
        retired_categories: retiredCategories,
      },
      'Carga solicitada de la carta pública. Se conservan el historial y los productos personalizados.',
    );
    return { imported: true, categories: catalog.categories.length, products: imported.length };
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await pool.end();
}
