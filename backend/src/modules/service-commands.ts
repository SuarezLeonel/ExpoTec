import { one, rows } from '../database/db.js';
import { config } from '../config/env.js';
import { has } from '../middleware/auth.js';
import { account } from './account-data.js';
import { audit } from './audit.js';
import { cashSummary } from './cash-data.js';
import { define, type Handler } from './command-types.js';
import { ensure } from './errors.js';
import { escapeHtml, htmlDocument, saveFile } from './files.js';
import { schemas } from './validation.js';
import type { CommandContext } from './types.js';

function demo(ctx: CommandContext) {
  ensure(
    config.demo,
    403,
    'DEMO_DISABLED',
    'Los adaptadores de demostración están deshabilitados.',
  );
  ensure(
    ctx.permissions.some((p) => ['cash', 'prepare_kitchen', 'prepare_bar', 'operate'].includes(p)),
    403,
    'FORBIDDEN',
    'Tu usuario no tiene permiso para operar la cola.',
  );
}
async function printJob(ctx: CommandContext, id: string) {
  demo(ctx);
  const job = await one(ctx.db, 'SELECT * FROM print_jobs WHERE id=$1 FOR UPDATE', [id]);
  ensure(job, 404, 'JOB_NOT_FOUND', 'No se encontró el trabajo de impresión.');
  if (!ctx.permissions.includes('cash') && !ctx.permissions.includes('operate'))
    has(ctx, job.destination === 'kitchen' ? 'prepare_kitchen' : 'prepare_bar');
  return job;
}
async function invoice(ctx: CommandContext, id: string) {
  demo(ctx);
  has(ctx, 'cash');
  const value = await one(ctx.db, 'SELECT * FROM invoices WHERE id=$1 FOR UPDATE', [id]);
  ensure(value, 404, 'INVOICE_NOT_FOUND', 'No se encontró el comprobante.');
  return value;
}
async function issue(ctx: CommandContext, id: string, resolved: boolean) {
  const result = await one(
    ctx.db,
    "UPDATE invoices SET status='issued',document_number=coalesce(document_number,$1),error=NULL,updated_at=now() WHERE id=$2 RETURNING *",
    [`DEMO-${id.slice(0, 8).toUpperCase()}`, id],
  );
  await ctx.db.query(
    "INSERT INTO invoice_events(invoice_id,user_id,state,detail) VALUES($1,$2,'issued',$3)",
    [
      id,
      ctx.user.id,
      resolved
        ? 'Consulta al adaptador local: resultado ya emitido. No se reenvió.'
        : 'Emisión ficticia confirmada por el adaptador local.',
    ],
  );
  const file = await saveFile(ctx.db, {
    name: `comprobante-${result!.document_number}.html`,
    kind: 'invoice',
    mime: 'text/html',
    userId: ctx.user.id,
    entityId: id,
    content: htmlDocument(
      'Comprobante ficticio',
      `<p>Emisor: ${escapeHtml(result!.issuer_name)}</p><p>Domicilio ficticio: Calle de Prueba 123 · Punto de venta de prueba 0001 · Identificación: EMISOR FICTICIO (sin CUIT real).</p><p>Receptor: ${escapeHtml(result!.recipient_name)} · Documento: ${escapeHtml(result!.recipient_document)}</p><p>Tipo: ${escapeHtml(result!.kind)} · Número: ${escapeHtml(result!.document_number)}</p><h2>Conceptos e importes históricos en centavos</h2><pre>${escapeHtml(JSON.stringify(result!.details, null, 2))}</pre><p>Importe: ARS ${((result!.amount_cents as number) / 100).toFixed(2)}</p><p>No contiene CAE ni autorización de ARCA.</p>`,
    ),
  });
  return { invoice: result, file };
}
export const serviceCommands: Record<string, Handler> = {
  'print.process': define(schemas['print.process'], async (ctx, input) => {
    const before = await printJob(ctx, input.id);
    ensure(
      ['generated', 'uncertain'].includes(before.status as string),
      409,
      'PRINT_STATE',
      'Solo se puede procesar un trabajo generado; un fallo requiere reintento explícito.',
    );
    if (before.status === 'uncertain') {
      ensure(
        input.mode === 'success',
        409,
        'PRINT_UNCERTAIN',
        'La respuesta es incierta. Consultá el resultado simulado con Confirmar; una copia exige motivo. No se reenvía automáticamente.',
      );
      await ctx.db.query(
        "UPDATE print_jobs SET status='confirmed',error=NULL,updated_at=now() WHERE id=$1",
        [input.id],
      );
      await ctx.db.query(
        "INSERT INTO print_events(job_id,user_id,state,detail) VALUES($1,$2,'confirmed','Consulta del resultado ya procesado por el adaptador simulado; sin reenvío.')",
        [input.id, ctx.user.id],
      );
    } else {
      await ctx.db.query(
        "UPDATE print_jobs SET status='sent',attempts=attempts+1,updated_at=now() WHERE id=$1",
        [input.id],
      );
      await ctx.db.query(
        "INSERT INTO print_events(job_id,user_id,state,detail) VALUES($1,$2,'sent','Envío al adaptador local simulado.')",
        [input.id, ctx.user.id],
      );
      const status = { success: 'confirmed', offline: 'failed', uncertain: 'uncertain' }[
        input.mode
      ];
      const error =
        input.mode === 'offline'
          ? 'Impresora simulada desconectada; no recibió trabajo.'
          : input.mode === 'uncertain'
            ? 'El adaptador pudo imprimir; se perdió la respuesta. Consultar resultado o generar copia manual.'
            : null;
      await ctx.db.query('UPDATE print_jobs SET status=$1,error=$2,updated_at=now() WHERE id=$3', [
        status,
        error,
        input.id,
      ]);
      await ctx.db.query(
        'INSERT INTO print_events(job_id,user_id,state,detail) VALUES($1,$2,$3,$4)',
        [
          input.id,
          ctx.user.id,
          status,
          error ?? 'Confirmación del simulador. No acredita papel físico.',
        ],
      );
    }
    const after = await one(ctx.db, 'SELECT * FROM print_jobs WHERE id=$1', [input.id]);
    await audit(ctx, 'print.process', 'print_job', input.id, before, after);
    return after;
  }),
  'print.retry': define(schemas['print.retry'], async (ctx, input) => {
    const before = await printJob(ctx, input.id);
    ensure(
      before.status === 'failed',
      409,
      'PRINT_RETRY_UNSAFE',
      'Solo se reintenta un fallo confirmado sin recepción. Los inciertos requieren consultar resultado o copia con motivo.',
    );
    const after = await one(
      ctx.db,
      "UPDATE print_jobs SET status='generated',error=NULL,updated_at=now() WHERE id=$1 RETURNING *",
      [input.id],
    );
    await ctx.db.query(
      "INSERT INTO print_events(job_id,user_id,state,detail) VALUES($1,$2,'generated','Reintento seguro habilitado manualmente.')",
      [input.id, ctx.user.id],
    );
    await audit(ctx, 'print.retry', 'print_job', input.id, before, after);
    return after;
  }),
  'print.copy': define(schemas['print.copy'], async (ctx, input) => {
    const original = await printJob(ctx, input.id);
    const copy = await one(
      ctx.db,
      'INSERT INTO print_jobs(send_id,account_id,destination,content,copy_of,reason) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
      [
        original.send_id,
        original.account_id,
        original.destination,
        `COPIA · ${input.reason}\n${original.content}`,
        original.id,
        input.reason,
      ],
    );
    await audit(
      ctx,
      'print.copy',
      'print_job',
      copy!.id as string,
      { original_id: original.id, status: original.status },
      copy,
      input.reason,
    );
    return copy;
  }),
  'invoice.prepare': define(schemas['invoice.prepare'], async (ctx, input) => {
    demo(ctx);
    has(ctx, 'cash');
    const current = await account(ctx, input.account_id, input.version, true);
    ensure(
      current.balance_cents === 0 && current.total_cents > 0,
      409,
      'INVOICE_UNPAID',
      'Completá el cobro antes de preparar el comprobante de demostración.',
    );
    ensure(
      !(await one(ctx.db, "SELECT 1 FROM invoices WHERE account_id=$1 AND status<>'rejected'", [
        current.id,
      ])),
      409,
      'INVOICE_EXISTS',
      'Ya hay un comprobante o solicitud activa para esta cuenta.',
    );
    const details = {
      concepts: await rows(
        ctx.db,
        "SELECT id,name,description,quantity,unit_cents,effective_unit_cents,line_cents FROM item_totals WHERE account_id=$1 AND status<>'void' ORDER BY created_at,id",
        [current.id],
      ),
      discounts: await rows(
        ctx.db,
        'SELECT item_id,kind,value,amount_cents,base_cents FROM discounts WHERE account_id=$1 ORDER BY created_at',
        [current.id],
      ),
      refunds: await rows(
        ctx.db,
        'SELECT payment_id,amount_cents,reason FROM refunds WHERE account_id=$1 ORDER BY created_at',
        [current.id],
      ),
      subtotal_cents: current.subtotal_cents,
      discount_cents: current.discount_cents,
      credited_cents: current.refunded_cents,
      total_cents: current.total_cents,
    };
    const result = await one(
      ctx.db,
      'INSERT INTO invoices(account_id,user_id,kind,recipient_name,recipient_document,amount_cents,details) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [
        current.id,
        ctx.user.id,
        input.kind,
        input.recipient_name,
        input.recipient_document,
        current.total_cents,
        details,
      ],
    );
    await ctx.db.query(
      "INSERT INTO invoice_events(invoice_id,user_id,state,detail) VALUES($1,$2,'prepared','Documento ficticio sin validez fiscal.')",
      [result!.id, ctx.user.id],
    );
    await audit(ctx, 'invoice.prepare', 'invoice', result!.id as string, undefined, result);
    return result;
  }),
  'invoice.process': define(schemas['invoice.process'], async (ctx, input) => {
    const before = await invoice(ctx, input.id);
    ensure(
      before.status === 'prepared',
      409,
      'INVOICE_STATE',
      'Un rechazo requiere reintento explícito. Una respuesta incierta requiere consultar resultado.',
    );
    await ctx.db.query(
      "UPDATE invoices SET status='requested',attempts=attempts+1,updated_at=now() WHERE id=$1",
      [input.id],
    );
    await ctx.db.query(
      "INSERT INTO invoice_events(invoice_id,user_id,state,detail) VALUES($1,$2,'requested','Solicitud al adaptador simulado con ID estable.')",
      [input.id, ctx.user.id],
    );
    if (input.mode === 'success') {
      const result = await issue(ctx, input.id, false);
      await audit(ctx, 'invoice.process', 'invoice', input.id, before, result.invoice);
      return result;
    }
    const status = input.mode === 'reject' ? 'rejected' : 'uncertain';
    const error =
      input.mode === 'reject'
        ? 'Rechazo de prueba: datos del receptor observados. El cobro permanece confirmado.'
        : 'Respuesta de prueba perdida. No reenviar: consultar el resultado del mismo ID.';
    const result = await one(
      ctx.db,
      'UPDATE invoices SET status=$1,error=$2,updated_at=now() WHERE id=$3 RETURNING *',
      [status, error, input.id],
    );
    await ctx.db.query(
      'INSERT INTO invoice_events(invoice_id,user_id,state,detail) VALUES($1,$2,$3,$4)',
      [input.id, ctx.user.id, status, error],
    );
    await audit(ctx, 'invoice.process', 'invoice', input.id, before, result);
    return { invoice: result };
  }),
  'invoice.retry': define(schemas['invoice.retry'], async (ctx, input) => {
    const before = await invoice(ctx, input.id);
    ensure(
      before.status === 'rejected',
      409,
      'INVOICE_RETRY_UNSAFE',
      'Solo un rechazo confirmado admite reintento. Consultá primero cualquier respuesta incierta.',
    );
    ensure(
      !(await one(
        ctx.db,
        "SELECT 1 FROM invoices WHERE account_id=$1 AND id<>$2 AND status<>'rejected'",
        [before.account_id, input.id],
      )),
      409,
      'INVOICE_EXISTS',
      'Otra solicitud activa ya cubre esta cuenta.',
    );
    const result = await one(
      ctx.db,
      "UPDATE invoices SET status='prepared',error=NULL,updated_at=now() WHERE id=$1 RETURNING *",
      [input.id],
    );
    await ctx.db.query(
      "INSERT INTO invoice_events(invoice_id,user_id,state,detail) VALUES($1,$2,'prepared','Reintento seguro habilitado, conservando el identificador.')",
      [input.id, ctx.user.id],
    );
    await audit(ctx, 'invoice.retry', 'invoice', input.id, before, result);
    return result;
  }),
  'invoice.resolve': define(schemas['invoice.resolve'], async (ctx, input) => {
    const before = await invoice(ctx, input.id);
    ensure(
      before.status === 'uncertain',
      409,
      'INVOICE_STATE',
      'Este comprobante no tiene una respuesta incierta.',
    );
    const result = await issue(ctx, input.id, true);
    await audit(ctx, 'invoice.resolve', 'invoice', input.id, before, result.invoice);
    return result;
  }),
  'report.export': define(schemas['report.export'], async (ctx, input) => {
    if (input.kind === 'audit') has(ctx, 'audit');
    else has(ctx, 'cash');
    let records: unknown;
    if (input.kind === 'audit')
      records = await rows(
        ctx.db,
        'SELECT * FROM audit_events ORDER BY created_at DESC LIMIT 5000',
      );
    else if (input.kind === 'cash') records = await cashSummary(ctx.db);
    else {
      ensure(input.account_id, 422, 'ACCOUNT_REQUIRED', 'Elegí la cuenta a exportar.');
      records = {
        account: await account(ctx, input.account_id, undefined, true),
        items: await rows(ctx.db, 'SELECT * FROM item_totals WHERE account_id=$1', [
          input.account_id,
        ]),
        payments: await rows(ctx.db, 'SELECT * FROM payments WHERE account_id=$1', [
          input.account_id,
        ]),
        refunds: await rows(ctx.db, 'SELECT * FROM refunds WHERE account_id=$1', [
          input.account_id,
        ]),
      };
    }
    const result = await saveFile(ctx.db, {
      name: `${input.kind}-${new Date().toISOString().slice(0, 10)}.html`,
      kind: input.kind,
      mime: 'text/html',
      userId: ctx.user.id,
      entityId: input.account_id,
      content: htmlDocument(
        `Informe ${input.kind}`,
        `<pre>${escapeHtml(JSON.stringify(records, null, 2))}</pre>`,
      ),
    });
    await audit(ctx, 'report.export', 'file', result.id, undefined, {
      id: result.id,
      name: result.name,
      kind: input.kind,
    });
    return result;
  }),
};
