import { one, rows } from '../database/db.js';
import { randomUUID } from 'node:crypto';
import { authorize, has } from '../middleware/auth.js';
import { account, bump, editable, item, orderTicket } from './account-data.js';
import { audit } from './audit.js';
import { define, type Handler } from './command-types.js';
import { ensure } from './errors.js';
import { schemas } from './validation.js';
import { accountCommands } from './account-commands.js';
import type { Account } from './types.js';

export const orderCommands: Record<string, Handler> = {
  'order.submit': define(schemas['order.submit'], async (ctx, input) => {
    has(ctx, 'operate');
    let current = input.account_id
      ? await account(ctx, input.account_id, input.version)
      : ((await accountCommands['account.open']!(ctx, {
          table_id: input.table_id,
          guests: input.guests,
        })) as Account);
    ensure(
      current.table_id === input.table_id,
      422,
      'ACCOUNT_TABLE_MISMATCH',
      'La cuenta no pertenece a esta mesa.',
    );
    if (!input.account_id) current = await account(ctx, current.id, current.version);
    if (input.items.length) await editable(ctx, current);
    const itemIds = [...input.item_ids];
    const products = await rows(
      ctx.db,
      'SELECT p.* FROM products p JOIN categories c ON c.id=p.category_id LEFT JOIN categories parent ON parent.id=c.parent_id WHERE p.id=ANY($1::uuid[]) AND p.active AND p.available AND c.active AND (c.parent_id IS NULL OR parent.active)',
      [input.items.map((line) => line.product_id)],
    );
    const addons = await rows(
      ctx.db,
      'SELECT pa.product_id,a.* FROM product_addons pa JOIN addons a ON a.id=pa.addon_id WHERE pa.product_id=ANY($1::uuid[]) AND a.id=ANY($2::uuid[]) AND a.active',
      [input.items.map((line) => line.product_id), input.items.flatMap((line) => line.addon_ids)],
    );
    let subtotal = current.subtotal_cents;
    const itemAddons: { item_id: string; addon_id: string; name: string; price_cents: number }[] =
      [];
    const lines = input.items.map((line) => {
      const product = products.find((p) => p.id === line.product_id);
      ensure(
        product,
        422,
        'PRODUCT_UNAVAILABLE',
        'Un producto dejó de estar disponible. No se envió el pedido.',
      );
      const selected = addons.filter(
        (a) => a.product_id === product.id && line.addon_ids.includes(a.id as string),
      );
      ensure(
        selected.length === line.addon_ids.length,
        422,
        'ADDON_UNAVAILABLE',
        'Un agregado dejó de estar disponible. No se envió el pedido.',
      );
      const id = line.client_id || randomUUID();
      itemIds.push(id);
      subtotal +=
        ((product.price_cents as number) +
          selected.reduce((sum, a) => sum + (a.price_cents as number), 0)) *
        line.quantity;
      for (const addon of selected)
        itemAddons.push({
          item_id: id,
          addon_id: addon.id as string,
          name: addon.name as string,
          price_cents: addon.price_cents as number,
        });
      return {
        id,
        product_id: product.id,
        name: product.name,
        description: product.description,
        unit_cents: product.price_cents,
        quantity: line.quantity,
        notes: line.notes,
        destination: product.destination,
      };
    });
    ensure(
      Number.isSafeInteger(subtotal),
      422,
      'ACCOUNT_AMOUNT_LIMIT',
      'El total excede el rango exacto admitido.',
    );
    if (lines.length) {
      for (const line of lines) {
        await ctx.db.query(
          'INSERT INTO items(id,account_id,product_id,name,description,unit_cents,quantity,notes,destination) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [
            line.id,
            current.id,
            line.product_id,
            line.name,
            line.description,
            line.unit_cents,
            line.quantity,
            line.notes ?? null,
            line.destination,
          ],
        );
      }
      for (const addon of itemAddons) {
        await ctx.db.query(
          'INSERT INTO item_addons(item_id,addon_id,name,price_cents) VALUES($1,$2,$3,$4)',
          [addon.item_id, addon.addon_id, addon.name, addon.price_cents],
        );
      }
    }
    const result = (await orderCommands['order.send']!(ctx, {
      account_id: current.id,
      version: current.version,
      item_ids: itemIds,
    })) as { account: Account; sent_item_ids: string[] };
    const items = await rows(
      ctx.db,
      `SELECT i.*,coalesce((SELECT json_agg(json_build_object('id',a.addon_id,'name',a.name,'price_cents',a.price_cents)) FROM item_addons a WHERE a.item_id=i.id),'[]'::json) addons FROM items i WHERE i.id=ANY($1::uuid[])`,
      [itemIds],
    );
    await audit(ctx, 'order.submit', 'account', current.id, undefined, {
      items,
      account: result.account,
    });
    return { ...result, items };
  }),
  'item.add': define(schemas['item.add'], async (ctx, input) => {
    has(ctx, 'operate');
    const before = await account(ctx, input.account_id, input.version);
    await editable(ctx, before);
    const product = await one(
      ctx.db,
      'SELECT p.* FROM products p JOIN categories c ON c.id=p.category_id LEFT JOIN categories parent ON parent.id=c.parent_id WHERE p.id=$1 AND p.active AND p.available AND c.active AND (c.parent_id IS NULL OR parent.active)',
      [input.product_id],
    );
    ensure(
      product,
      422,
      'PRODUCT_UNAVAILABLE',
      'El producto dejó de estar disponible. Actualizá el catálogo.',
    );
    const addons = await rows(
      ctx.db,
      'SELECT a.* FROM addons a JOIN product_addons pa ON pa.addon_id=a.id WHERE pa.product_id=$1 AND a.id=ANY($2::uuid[]) AND a.active',
      [product.id, input.addon_ids],
    );
    ensure(
      addons.length === input.addon_ids.length,
      422,
      'ADDON_UNAVAILABLE',
      'Uno o más agregados ya no están disponibles para este producto.',
    );
    const line =
      ((product.price_cents as number) +
        addons.reduce((sum, addon) => sum + (addon.price_cents as number), 0)) *
      input.quantity;
    ensure(
      Number.isSafeInteger(before.subtotal_cents + line),
      422,
      'ACCOUNT_AMOUNT_LIMIT',
      'El total excede el rango exacto admitido. Dividí el consumo en otra cuenta.',
    );
    const result = await one(
      ctx.db,
      'INSERT INTO items(account_id,product_id,name,description,unit_cents,quantity,notes,destination) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [
        before.id,
        product.id,
        product.name,
        product.description,
        product.price_cents,
        input.quantity,
        input.notes,
        product.destination,
      ],
    );
    for (const addon of addons)
      await ctx.db.query(
        'INSERT INTO item_addons(item_id,addon_id,name,price_cents) VALUES($1,$2,$3,$4)',
        [result!.id, addon.id, addon.name, addon.price_cents],
      );
    const after = await bump(ctx, before.id);
    await audit(ctx, 'item.add', 'item', result!.id as string, undefined, {
      ...result,
      addons,
      account: after,
    });
    return { item: result, account: after };
  }),
  'item.edit': define(schemas['item.edit'], async (ctx, input) => {
    has(ctx, 'operate');
    const current = await account(ctx, input.account_id, input.version);
    await editable(ctx, current);
    const before = await item(ctx, current.id, input.item_id);
    if (before.status !== 'draft') has(ctx, 'sensitive_void');
    ensure(
      !['void', 'delivered'].includes(before.status),
      409,
      'ITEM_FINAL',
      'El ítem ya fue entregado o anulado. Registrá una devolución si corresponde.',
    );
    if (input.quantity > before.quantity) {
      ensure(
        await one(
          ctx.db,
          'SELECT 1 FROM products p JOIN categories c ON c.id=p.category_id LEFT JOIN categories parent ON parent.id=c.parent_id WHERE p.id=$1 AND p.active AND p.available AND c.active AND (c.parent_id IS NULL OR parent.active)',
          [before.product_id],
        ),
        422,
        'PRODUCT_UNAVAILABLE',
        'El producto ya no está disponible para aumentar la cantidad.',
      );
    }
    const result = await one(
      ctx.db,
      'UPDATE items SET quantity=$1,notes=$2,updated_at=now() WHERE id=$3 RETURNING *',
      [input.quantity, input.notes, before.id],
    );
    if (before.status !== 'draft')
      await orderTicket(
        ctx,
        current.id,
        [before.id],
        'correction',
        'Modificación después del envío',
        { quantity: before.quantity, notes: before.notes },
      );
    const after = await bump(ctx, current.id);
    await audit(
      ctx,
      'item.edit',
      'item',
      before.id,
      before,
      result,
      before.status !== 'draft' ? 'Corrección identificable enviada al sector.' : undefined,
    );
    return { item: result, account: after };
  }),
  'order.send': define(schemas['order.send'], async (ctx, input) => {
    has(ctx, 'operate');
    const current = await account(ctx, input.account_id, input.version);
    const values = await rows(
      ctx.db,
      'SELECT i.* FROM items i WHERE i.account_id=$1 AND i.id=ANY($2::uuid[])',
      [current.id, input.item_ids],
    );
    ensure(
      values.length === input.item_ids.length && values.every((v) => v.status === 'draft'),
      409,
      'ITEM_NOT_DRAFT',
      'Solo se pueden enviar ítems en borrador de esta cuenta.',
    );
    const availableItems = await rows(
      ctx.db,
      `SELECT i.id FROM items i JOIN products p ON p.id=i.product_id JOIN categories c ON c.id=p.category_id LEFT JOIN categories parent ON parent.id=c.parent_id WHERE i.id=ANY($1::uuid[]) AND p.active AND p.available AND c.active AND (c.parent_id IS NULL OR parent.active) AND NOT EXISTS(SELECT 1 FROM item_addons ia JOIN addons a ON a.id=ia.addon_id LEFT JOIN product_addons pa ON pa.addon_id=a.id AND pa.product_id=i.product_id WHERE ia.item_id=i.id AND (NOT a.active OR pa.product_id IS NULL))`,
      [input.item_ids],
    );
    for (const value of values) {
      ensure(
        availableItems.some((i) => i.id === value.id),
        422,
        'PRODUCT_UNAVAILABLE',
        `Revisá la disponibilidad de ${value.name}. No se envió ningún ítem.`,
      );
    }
    await ctx.db.query("UPDATE items SET status='sent',updated_at=now() WHERE id=ANY($1::uuid[])", [
      input.item_ids,
    ]);
    await orderTicket(ctx, current.id, input.item_ids, 'new');
    const after = await bump(ctx, current.id);
    await audit(ctx, 'order.send', 'account', current.id, { item_ids: input.item_ids }, after);
    return { account: after, sent_item_ids: input.item_ids };
  }),
  'item.status': define(schemas['item.status'], async (ctx, input) => {
    const current = await account(ctx, input.account_id, input.version);
    const before = await item(ctx, current.id, input.item_id);
    ensure(before.status !== 'void', 409, 'ALREADY_VOID', 'El ítem ya fue anulado.');

    if (input.status === 'preparing') {
      ensure(
        ['sent', 'draft'].includes(before.status),
        409,
        'INVALID_STATUS',
        'Solo se pueden preparar ítems enviados.',
      );
    } else if (input.status === 'ready') {
      ensure(
        ['sent', 'preparing'].includes(before.status),
        409,
        'INVALID_STATUS',
        'Solo se pueden marcar listos ítems enviados o en preparación.',
      );
    } else if (input.status === 'delivered') {
      ensure(
        ['ready', 'preparing', 'sent'].includes(before.status),
        409,
        'INVALID_STATUS',
        'Solo se pueden entregar ítems listos o en curso.',
      );
    }

    const updated = await one(
      ctx.db,
      'UPDATE items SET status=$1, updated_at=now() WHERE id=$2 RETURNING *',
      [input.status, before.id],
    );
    const after = await bump(ctx, current.id);
    await audit(ctx, 'item.status', 'item', before.id, before, updated);
    return { item: updated, account: after };
  }),
  'item.void': define(schemas['item.void'], async (ctx, input) => {
    has(ctx, 'sensitive_void');
    const current = await account(ctx, input.account_id, input.version);
    await editable(ctx, current);
    const before = await item(ctx, current.id, input.item_id);
    ensure(before.status !== 'void', 409, 'ALREADY_VOID', 'El ítem ya fue anulado.');
    const authorizer =
      before.status !== 'draft'
        ? await authorize(ctx, 'sensitive_void', input.authorization)
        : ctx.user.id;
    await ctx.db.query("UPDATE items SET status='void',updated_at=now() WHERE id=$1", [before.id]);
    if (before.status !== 'draft')
      await orderTicket(ctx, current.id, [before.id], 'void', input.reason, {
        status: before.status,
        quantity: before.quantity,
      });
    const after = await bump(ctx, current.id);
    await audit(
      ctx,
      'item.void',
      'item',
      before.id,
      before,
      { status: 'void', account: after },
      input.reason,
      authorizer,
    );
    return { item_id: before.id, account: after };
  }),
};
