import { one } from '../database/db.js';
import { authorize, has } from '../middleware/auth.js';
import { account, bump, item } from './account-data.js';
import { audit } from './audit.js';
import { cashSummary, openCash } from './cash-data.js';
import { define, type Handler } from './command-types.js';
import { ensure } from './errors.js';
import { percentCents, proportionalCents, splitCents } from './money.js';
import { schemas, type Data } from './validation.js';
import type { Account, CommandContext } from './types.js';
import { netLineCents } from './allocations.js';

export async function selectedQuote(
  ctx: CommandContext,
  current: Account,
  selections: Data<'account.split'>['selections'],
) {
  const allocations: { item_id: string; quantity: number; amount_cents: number }[] = [];
  const netLines = await netLineCents(ctx, current);
  for (const selection of selections) {
    const value = await item(ctx, current.id, selection.item_id);
    ensure(value.status !== 'void', 422, 'ITEM_VOID', 'No se puede cobrar un ítem anulado.');
    const paid = await one(
      ctx.db,
      'SELECT coalesce(sum(quantity),0)::integer quantity FROM payment_allocations WHERE item_id=$1',
      [value.id],
    );
    ensure(
      selection.quantity + (paid!.quantity as number) <= value.quantity,
      409,
      'ITEM_ALREADY_PAID',
      'La cantidad elegida ya fue cobrada o supera el consumo.',
    );
    const unitTotal = netLines.get(value.id)!;
    // Integer cumulative differences allocate line rounding across individual units once.
    const start = paid!.quantity as number;
    const amount =
      proportionalCents(unitTotal, start + selection.quantity, value.quantity) -
      proportionalCents(unitTotal, start, value.quantity);
    ensure(amount > 0, 422, 'ZERO_ALLOCATION', 'Este ítem no tiene importe pendiente para cobrar.');
    allocations.push({ ...selection, amount_cents: amount });
  }
  const amount = allocations.reduce((sum, v) => sum + v.amount_cents, 0);
  ensure(
    amount <= current.balance_cents,
    409,
    'ALLOCATION_BALANCE',
    'La selección supera el saldo. Hay pagos por importe o un ajuste de redondeo: cobrá el saldo por importe.',
  );
  return { amount_cents: amount, allocations };
}
export const financialCommands: Record<string, Handler> = {
  'discount.apply': define(schemas['discount.apply'], async (ctx, input) => {
    has(ctx, 'discount');
    const before = await account(ctx, input.account_id, input.version);
    ensure(
      !(await one(ctx.db, 'SELECT 1 FROM payments WHERE account_id=$1', [before.id])),
      409,
      'PAYMENTS_EXIST',
      'No se puede descontar una cuenta con pagos. Usá el reintegro compensatorio autorizado.',
    );
    const authorizer = await authorize(ctx, 'discount', input.authorization);
    let base = before.total_cents;
    if (input.item_id) {
      ensure(
        !(await one(ctx.db, 'SELECT 1 FROM discounts WHERE account_id=$1 AND item_id IS NULL', [
          before.id,
        ])),
        409,
        'DISCOUNT_ORDER',
        'Ya existe un descuento de cuenta. No se pueden agregar descuentos de ítem después.',
      );
      const value = await item(ctx, before.id, input.item_id);
      ensure(value.status !== 'void', 422, 'ITEM_VOID', 'No se puede descontar un ítem anulado.');
      base = value.line_cents;
    }
    ensure(
      !(await one(
        ctx.db,
        'SELECT 1 FROM discounts WHERE account_id=$1 AND item_id IS NOT DISTINCT FROM $2::uuid',
        [before.id, input.item_id ?? null],
      )),
      409,
      'DISCOUNT_EXISTS',
      'Este alcance ya tiene un descuento.',
    );
    const amount = input.kind === 'percent' ? percentCents(base, input.value) : input.value;
    ensure(
      amount > 0 && amount <= base && amount <= before.balance_cents,
      422,
      'INVALID_DISCOUNT',
      'El descuento debe ser positivo y no puede superar su base o saldo.',
    );
    const result = await one(
      ctx.db,
      'INSERT INTO discounts(account_id,item_id,kind,value,amount_cents,base_cents,user_id,authorized_by,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [
        before.id,
        input.item_id ?? null,
        input.kind,
        input.value,
        amount,
        base,
        ctx.user.id,
        authorizer,
        input.reason,
      ],
    );
    const after = await bump(ctx, before.id);
    await audit(
      ctx,
      'discount.apply',
      'discount',
      result!.id as string,
      before,
      { discount: result, account: after },
      input.reason,
      authorizer,
    );
    return { discount: result, account: after };
  }),
  'payment.add': define(schemas['payment.add'], async (ctx, input) => {
    has(ctx, 'cash');
    const before = await account(ctx, input.account_id, input.version);
    const cash = await openCash(ctx.db);
    ensure(
      input.amount_cents <= before.balance_cents,
      422,
      'PAYMENT_EXCEEDS_BALANCE',
      'El importe aplicado supera el saldo pendiente.',
    );
    ensure(
      !(await one(ctx.db, "SELECT 1 FROM items WHERE account_id=$1 AND status='draft'", [
        before.id,
      ])),
      409,
      'DRAFT_ITEMS',
      'Enviá o anulá todos los borradores antes de cobrar.',
    );
    const received = input.received_cents ?? input.amount_cents;
    ensure(
      received >= input.amount_cents &&
        (input.method === 'cash' || received === input.amount_cents),
      422,
      'INVALID_RECEIVED',
      'El dinero recibido no cubre el cobro o el vuelto no corresponde al medio.',
    );
    let planId: string | undefined;
    let part: number | undefined;
    let allocations: Awaited<ReturnType<typeof selectedQuote>>['allocations'] = [];
    if (input.split?.kind === 'equal') {
      ensure(
        input.split.parts && input.split.part && input.split.part <= input.split.parts,
        422,
        'INVALID_SPLIT',
        'Indicá cantidad de partes y número de parte.',
      );
      let plan = await one(ctx.db, 'SELECT * FROM payment_plans WHERE account_id=$1', [before.id]);
      if (!plan)
        plan = await one(
          ctx.db,
          'INSERT INTO payment_plans(account_id,parts,base_cents) VALUES($1,$2,$3) RETURNING *',
          [before.id, input.split.parts, before.balance_cents],
        );
      ensure(
        plan!.parts === input.split.parts,
        409,
        'SPLIT_PLAN_EXISTS',
        'La cantidad de partes ya fue fijada por el primer cobro.',
      );
      const parts = splitCents(plan!.base_cents as number, input.split.parts);
      ensure(
        input.amount_cents === parts[input.split.part - 1],
        422,
        'SPLIT_AMOUNT',
        'El importe no coincide con esta parte, incluido el ajuste de centavos.',
      );
      ensure(
        !(await one(ctx.db, 'SELECT 1 FROM payments WHERE plan_id=$1 AND part=$2', [
          plan!.id,
          input.split.part,
        ])),
        409,
        'PART_ALREADY_PAID',
        'Esta parte ya fue cobrada.',
      );
      planId = plan!.id as string;
      part = input.split.part;
    } else if (input.split?.kind === 'items') {
      ensure(
        input.split.selections,
        422,
        'ITEMS_REQUIRED',
        'Elegí los ítems y cantidades a cobrar.',
      );
      const quote = await selectedQuote(ctx, before, input.split.selections);
      ensure(
        quote.amount_cents === input.amount_cents,
        422,
        'SPLIT_AMOUNT',
        'El importe no coincide con los ítems elegidos.',
      );
      allocations = quote.allocations;
    }
    const result = await one(
      ctx.db,
      'INSERT INTO payments(account_id,cash_session_id,user_id,amount_cents,method,received_cents,change_cents,plan_id,part) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [
        before.id,
        cash.id,
        ctx.user.id,
        input.amount_cents,
        input.method,
        received,
        received - input.amount_cents,
        planId,
        part,
      ],
    );
    for (const allocation of allocations)
      await ctx.db.query(
        'INSERT INTO payment_allocations(payment_id,item_id,quantity,amount_cents) VALUES($1,$2,$3,$4)',
        [result!.id, allocation.item_id, allocation.quantity, allocation.amount_cents],
      );
    const after = await bump(ctx, before.id);
    await audit(
      ctx,
      'payment.add',
      'payment',
      result!.id as string,
      before,
      { payment: result, account: after },
      'Registro interno de demostración; sin transacción bancaria.',
    );
    return { payment: result, account: after };
  }),
  'refund.add': define(schemas['refund.add'], async (ctx, input) => {
    has(ctx, 'cash');
    const before = await account(ctx, input.account_id, input.version, true);
    const authorizer = await authorize(ctx, 'refund', input.authorization);
    const cash = await openCash(ctx.db);
    const payment = await one(ctx.db, 'SELECT * FROM payments WHERE id=$1 AND account_id=$2', [
      input.payment_id,
      before.id,
    ]);
    ensure(payment, 422, 'PAYMENT_NOT_FOUND', 'El pago no pertenece a esta cuenta.');
    const already = await one(
      ctx.db,
      'SELECT coalesce(sum(amount_cents),0)::bigint amount FROM refunds WHERE payment_id=$1',
      [payment.id],
    );
    ensure(
      input.amount_cents <= (payment.amount_cents as number) - (already!.amount as number),
      422,
      'REFUND_EXCEEDS_PAYMENT',
      'El reintegro supera el importe disponible del pago original.',
    );
    ensure(
      input.amount_cents <= before.total_cents && input.amount_cents <= before.paid_cents,
      422,
      'REFUND_EXCEEDS_SALE',
      'El reintegro supera el neto cobrado de esta cuenta.',
    );
    if (input.return_product) {
      ensure(
        input.item_id && input.quantity,
        422,
        'RETURN_REQUIRED',
        'Elegí el producto original y la cantidad devuelta.',
      );
      const original = await item(ctx, before.id, input.item_id);
      ensure(
        ['sent', 'preparing', 'ready', 'delivered'].includes(original.status),
        409,
        'RETURN_NOT_SENT',
        'La devolución de producto requiere un ítem previamente enviado.',
      );
      const returned = await one(
        ctx.db,
        'SELECT coalesce(sum(quantity),0)::integer quantity FROM product_returns WHERE item_id=$1',
        [original.id],
      );
      ensure(
        (returned!.quantity as number) + input.quantity <= original.quantity,
        422,
        'RETURN_EXCEEDS_QUANTITY',
        'La cantidad ya fue devuelta o supera la venta original.',
      );
      const net = (await netLineCents(ctx, before)).get(original.id)!;
      const start = returned!.quantity as number;
      const availableValue =
        proportionalCents(net, start + input.quantity, original.quantity) -
        proportionalCents(net, start, original.quantity);
      ensure(
        input.amount_cents <= availableValue,
        422,
        'RETURN_VALUE',
        'El reintegro supera el valor original de la cantidad devuelta.',
      );
    } else
      ensure(
        !input.item_id && !input.quantity,
        422,
        'RETURN_FIELDS',
        'Los campos de producto corresponden únicamente a una devolución de producto.',
      );
    if (payment.method === 'cash') {
      const summary = await cashSummary(ctx.db);
      ensure(
        input.amount_cents <= summary.expected_cents,
        409,
        'CASH_INSUFFICIENT',
        'El efectivo esperado no alcanza para este reintegro.',
      );
    }
    const result = await one(
      ctx.db,
      'INSERT INTO refunds(account_id,payment_id,cash_session_id,user_id,authorized_by,amount_cents,reason) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [before.id, payment.id, cash.id, ctx.user.id, authorizer, input.amount_cents, input.reason],
    );
    if (input.return_product)
      await ctx.db.query(
        'INSERT INTO product_returns(refund_id,item_id,quantity) VALUES($1,$2,$3)',
        [result!.id, input.item_id, input.quantity],
      );
    const after = await bump(ctx, before.id);
    await audit(
      ctx,
      'refund.add',
      'refund',
      result!.id as string,
      before,
      {
        refund: result,
        return_product: input.return_product,
        item_id: input.item_id,
        quantity: input.quantity,
        account: after,
      },
      input.reason,
      authorizer,
    );
    return { refund: result, account: after };
  }),
  'cash.open': define(schemas['cash.open'], async (ctx, input) => {
    has(ctx, 'cash');
    ensure(
      !(await one(ctx.db, "SELECT 1 FROM cash_sessions WHERE status='open'")),
      409,
      'CASH_ALREADY_OPEN',
      'Ya existe una caja abierta.',
    );
    const result = await one(
      ctx.db,
      'INSERT INTO cash_sessions(user_id,opening_cents) VALUES($1,$2) RETURNING *',
      [ctx.user.id, input.opening_cents],
    );
    await audit(ctx, 'cash.open', 'cash_session', result!.id as string, undefined, result);
    return result;
  }),
  'cash.move': define(schemas['cash.move'], async (ctx, input) => {
    has(ctx, 'cash');
    const cash = await openCash(ctx.db);
    const before = await cashSummary(ctx.db);
    ensure(
      input.kind !== 'out' || input.amount_cents <= before.expected_cents,
      422,
      'CASH_INSUFFICIENT',
      'El egreso supera el efectivo esperado.',
    );
    const result = await one(
      ctx.db,
      'INSERT INTO cash_movements(cash_session_id,user_id,kind,amount_cents,concept) VALUES($1,$2,$3,$4,$5) RETURNING *',
      [cash.id, ctx.user.id, input.kind, input.amount_cents, input.concept],
    );
    await audit(
      ctx,
      'cash.move',
      'cash_movement',
      result!.id as string,
      before,
      { movement: result, summary: await cashSummary(ctx.db) },
      input.concept,
    );
    return result;
  }),
  'cash.close': define(schemas['cash.close'], async (ctx, input) => {
    has(ctx, 'cash');
    const cash = await openCash(ctx.db);
    const summary = await cashSummary(ctx.db);
    ensure(
      Object.values(summary.blockers).every((v) => v === 0),
      409,
      'CASH_PENDING',
      'No se puede cerrar: hay cuentas abiertas, trabajos de impresión pendientes o comprobantes pendientes/inciertos.',
      summary.blockers,
    );
    const result = await one(
      ctx.db,
      "UPDATE cash_sessions SET status='closed',counted_cents=$1::integer,expected_cents=$2::bigint,difference_cents=$1::integer-$2::bigint,closed_by=$3,closed_at=now() WHERE id=$4 RETURNING *",
      [input.counted_cents, summary.expected_cents, ctx.user.id, cash.id],
    );
    await audit(ctx, 'cash.close', 'cash_session', cash.id as string, summary, result);
    return result;
  }),
};
