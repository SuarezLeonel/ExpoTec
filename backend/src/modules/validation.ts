import { z } from 'zod';

export const uuid = z.string().uuid();
export const cents = z.number().int().min(0).max(100_000_000);
const text = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine(
      (v) =>
        [...v].every((char) => {
          const code = char.charCodeAt(0);
          return code >= 32 || code === 9 || code === 10 || code === 13;
        }),
      'Texto contiene caracteres de control.',
    );
export const person = text(2, 100).regex(
  /^[\p{L}\p{M} '\u2019]+$/u,
  'Usá letras, espacios y apóstrofes.',
);
export const password = z
  .string()
  .min(12, 'La contraseña requiere al menos 12 caracteres.')
  .max(128);
export const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,60}$/);
export const authorization = z
  .object({ username, password: z.string().min(1).max(128) })
  .optional();
const account = { account_id: uuid, version: z.number().int().positive() };
const selection = z.object({ item_id: uuid, quantity: z.number().int().min(1).max(100) });
export const selections = z
  .array(selection)
  .min(1)
  .max(100)
  .refine(
    (v) => new Set(v.map((s) => s.item_id)).size === v.length,
    'No se admiten ítems repetidos.',
  );
const ids = z
  .array(uuid)
  .max(100)
  .refine((v) => new Set(v).size === v.length, 'No se admiten identificadores repetidos.');
const floorTable = z.object({
  id: uuid,
  label: text(1, 30),
  capacity: z.number().int().min(1).max(50),
  sector: z.enum(['Salón', 'Patio']),
  x: z.number().int().min(0).max(200000),
  y: z.number().int().min(0).max(200000),
  shape: z.enum(['round', 'square', 'rectangular']),
  width: z.number().int().min(40).max(500),
  height: z.number().int().min(40).max(500),
  rotation: z.number().int().min(0).max(359),
  active: z.boolean(),
});
const floorElement = z.object({
  id: uuid,
  kind: z.enum(['wall', 'door', 'separator', 'chair']),
  sector: z.enum(['Salón', 'Patio']).default('Salón'),
  x: z.number().int().min(0).max(200000),
  y: z.number().int().min(0).max(200000),
  width: z.number().int().min(10).max(2000),
  height: z.number().int().min(4).max(1000),
  rotation: z.number().int().min(0).max(359),
});
const floorLayout = z
  .object({
    tables: z
      .array(floorTable)
      .max(500)
      .refine((v) => new Set(v.map((t) => t.id)).size === v.length),
    elements: z
      .array(floorElement)
      .max(1000)
      .refine((v) => new Set(v.map((e) => e.id)).size === v.length),
  })
  .refine(
    (v) => new Set(v.tables.map((t) => t.label.toLocaleLowerCase())).size === v.tables.length,
    'Cada mesa necesita un identificador único.',
  );
export const schemas = {
  'floor-plan.draft.save': z.object({
    expected_revision: z.number().int().positive(),
    layout: floorLayout,
  }),
  'floor-plan.publish': z.object({
    expected_revision: z.number().int().positive(),
    expected_version: z.number().int().positive(),
  }),
  'table.save': z.object({
    id: uuid.optional(),
    label: text(1, 30),
    capacity: z.number().int().min(1).max(50),
    sector: z.enum(['Salón', 'Patio']),
    x: z.number().int().min(0).max(200000),
    y: z.number().int().min(0).max(200000),
    active: z.boolean(),
    shape: z.enum(['round', 'square', 'rectangular']).default('round'),
    width: z.number().int().min(40).max(500).default(92),
    height: z.number().int().min(40).max(500).default(92),
    rotation: z.number().int().min(0).max(359).default(0),
  }),
  'table.group': z.object({
    table_ids: ids.refine((v) => v.length > 0),
    group_id: uuid.nullable().optional(),
  }),
  'account.open': z.object({
    table_id: uuid,
    guests: z.number().int().min(1).max(100),
    waiter_id: uuid.optional(),
  }),
  'account.update': z.object({
    ...account,
    waiter_id: uuid.optional(),
    guests: z.number().int().min(1).max(100).optional(),
  }),
  'account.move': z.object({ ...account, table_id: uuid }),
  'account.request': z.object(account),
  'account.close': z.object(account),
  'account.split': z.object({ ...account, selections }),
  'item.transfer': z.object({
    ...account,
    target_account_id: uuid,
    target_version: z.number().int().positive(),
    selections,
  }),
  'account.merge': z.object({
    ...account,
    source_account_id: uuid,
    source_version: z.number().int().positive(),
  }),
  'item.add': z.object({
    ...account,
    product_id: uuid,
    quantity: z.number().int().min(1).max(100),
    notes: text(0, 500).default(''),
    addon_ids: ids.default([]),
  }),
  'item.edit': z.object({
    ...account,
    item_id: uuid,
    quantity: z.number().int().min(1).max(100),
    notes: text(0, 500),
  }),
  'order.send': z.object({ ...account, item_ids: ids.refine((v) => v.length > 0) }),
  'order.submit': z
    .object({
      table_id: uuid,
      account_id: uuid.optional(),
      version: z.number().int().positive().optional(),
      guests: z.number().int().min(1).max(50).default(1),
      items: z
        .array(
          z.object({
            client_id: uuid.optional(),
            product_id: uuid,
            quantity: z.number().int().min(1).max(100),
            notes: text(0, 500).default(''),
            addon_ids: ids.default([]),
          }),
        )
        .max(100),
      item_ids: ids.default([]),
    })
    .refine((v) => v.items.length + v.item_ids.length > 0, 'El pedido está vacío.')
    .refine(
      (v) => v.items.length + v.item_ids.length <= 100,
      'Enviá hasta 100 productos por pedido.',
    )
    .refine((v) => {
      const ids = [
        ...v.item_ids,
        ...v.items.flatMap((line) => (line.client_id ? [line.client_id] : [])),
      ];
      return new Set(ids).size === ids.length;
    }, 'No se admiten renglones repetidos.')
    .refine((v) => Boolean(v.account_id) === Boolean(v.version), 'Indicá la cuenta y su versión.'),
  'item.status': z.object({
    ...account,
    item_id: uuid,
    status: z.enum(['preparing', 'ready', 'delivered']),
  }),
  'item.void': z.object({ ...account, item_id: uuid, reason: text(3, 300), authorization }),
  'discount.apply': z.object({
    ...account,
    item_id: uuid.optional(),
    kind: z.enum(['amount', 'percent']),
    value: cents.refine((v) => v > 0),
    reason: text(3, 300),
    authorization,
  }),
  'payment.add': z.object({
    ...account,
    amount_cents: cents.refine((v) => v > 0),
    method: z.enum(['cash', 'debit', 'credit', 'transfer']),
    received_cents: cents.optional(),
    split: z
      .object({
        kind: z.enum(['equal', 'amount', 'items']),
        parts: z.number().int().min(2).max(30).optional(),
        part: z.number().int().min(1).max(30).optional(),
        selections: selections.optional(),
      })
      .optional(),
  }),
  'refund.add': z.object({
    ...account,
    payment_id: uuid,
    item_id: uuid.optional(),
    quantity: z.number().int().min(1).max(100).optional(),
    amount_cents: cents.refine((v) => v > 0),
    reason: text(3, 300),
    return_product: z.boolean(),
    authorization,
  }),
  'cash.open': z.object({ opening_cents: cents }),
  'cash.move': z.object({
    amount_cents: cents.refine((v) => v > 0),
    kind: z.enum(['in', 'out']),
    concept: text(3, 300),
  }),
  'cash.close': z.object({ counted_cents: cents }),
  'category.save': z.object({
    id: uuid.optional(),
    name: text(2, 100),
    active: z.boolean(),
    parent_id: uuid.nullable().optional(),
    sort_order: z.number().int().min(0).max(9999).optional(),
  }),
  'addon.save': z.object({
    id: uuid.optional(),
    name: text(2, 100),
    price_cents: cents,
    active: z.boolean(),
  }),
  'product.save': z
    .object({
      id: uuid.optional(),
      name: text(2, 120),
      description: text(0, 1000),
      category_id: uuid,
      price_cents: cents,
      image_url: z
        .string()
        .max(400)
        .refine(
          (v) => v === '' || /^\/uploads\/[a-f0-9-]+\.(png|jpg|webp)$/.test(v),
          'Usá una imagen subida desde la aplicación.',
        ),
      destination: z.enum(['kitchen', 'bar', 'none']),
      available: z.boolean(),
      active: z.boolean(),
      visible_en_carta: z.boolean(),
      addon_ids: ids,
      variant_group: text(0, 100).optional(),
      variant_name: text(0, 120).optional(),
    })
    .refine(
      (value) =>
        (value.variant_group === undefined && value.variant_name === undefined) ||
        (value.variant_group !== undefined &&
          value.variant_name !== undefined &&
          Boolean(value.variant_group) === Boolean(value.variant_name)),
      {
        message: 'Completá el producto base y la variante, o dejá ambos vacíos.',
        path: ['variant_name'],
      },
    ),
  'user.save': z.object({
    id: uuid.optional(),
    username,
    name: person,
    role: z.enum(['admin', 'cashier', 'waiter', 'kitchen', 'bar']),
    active: z.boolean(),
    password: password.optional(),
    pin: z
      .string()
      .regex(/^[0-9]{4}$/, 'El PIN debe tener cuatro dígitos.')
      .optional(),
  }),
  'print.process': z.object({ id: uuid, mode: z.enum(['success', 'offline', 'uncertain']) }),
  'print.retry': z.object({ id: uuid }),
  'print.copy': z.object({ id: uuid, reason: text(3, 300) }),
  'invoice.prepare': z.object({
    ...account,
    recipient_name: person,
    recipient_document: z
      .string()
      .trim()
      .regex(/^[0-9 -]{0,20}$/),
    kind: text(1, 40),
  }),
  'invoice.process': z.object({ id: uuid, mode: z.enum(['success', 'reject', 'uncertain']) }),
  'invoice.retry': z.object({ id: uuid }),
  'invoice.resolve': z.object({ id: uuid }),
  'report.export': z.object({
    kind: z.enum(['audit', 'cash', 'account']),
    account_id: uuid.optional(),
  }),
};
export type Action = keyof typeof schemas;
export type Data<A extends Action> = z.infer<(typeof schemas)[A]>;
