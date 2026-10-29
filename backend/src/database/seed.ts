import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { pool, one, transaction, type DB } from './db.js';
import { config } from '../config/env.js';
import { hashPin, pinLookup, verifyPin } from '../modules/operational-pin.js';
import { hashPassword } from '../modules/security.js';
import { ensure } from '../modules/errors.js';

let demoPasswordHash: Promise<string> | undefined;
const demoPinHashes = new Map<string, Promise<string>>();
function seededPinHash(pin: string) {
  let pending = demoPinHashes.get(pin);
  if (!pending) {
    pending = hashPin(pin);
    demoPinHashes.set(pin, pending);
  }
  return pending;
}

export const seedUsers = [
  {
    id: '50000000-0000-4000-8000-000000000001',
    username: 'admin',
    name: 'Ana Encargada',
    role: 'admin',
    pin: '4101',
    active: true,
  },
  {
    id: '50000000-0000-4000-8000-000000000002',
    username: 'caja',
    name: 'Carla Cajera',
    role: 'cashier',
    pin: '4202',
    active: true,
  },
  {
    id: '50000000-0000-4000-8000-000000000003',
    username: 'mozo',
    name: 'Martín Camarero',
    role: 'waiter',
    pin: '4303',
    active: true,
  },
  {
    id: '50000000-0000-4000-8000-000000000004',
    username: 'cocina',
    name: 'Lucía Cocina',
    role: 'kitchen',
    pin: '4404',
    active: true,
  },
  {
    id: '50000000-0000-4000-8000-000000000006',
    username: 'moza',
    name: 'María Camarera',
    role: 'waiter',
    pin: '4606',
    active: true,
  },
];
export async function seed(db?: DB, sample = true) {
  ensure(config.demo, 403, 'DEMO_DISABLED', 'El seed está limitado al modo demostración.');
  ensure(
    config.DEMO_PASSWORD,
    422,
    'DEMO_PASSWORD_REQUIRED',
    'Configurá DEMO_PASSWORD de al menos 12 caracteres en el entorno local.',
  );
  const passwordHash = await (demoPasswordHash ??= hashPassword(config.DEMO_PASSWORD));
  const apply = async (client: DB) => {
    await client.query(await readFile(new URL('../../sql/002_seed.sql', import.meta.url), 'utf8'));
    await client.query(`
      UPDATE floor_plan_state SET
        draft=jsonb_build_object('tables',layout.tables,'elements','[]'::jsonb),
        published=jsonb_build_object('tables',layout.tables,'elements','[]'::jsonb),
        updated_at=now()
      FROM (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id',id,'label',label,'capacity',capacity,'sector',sector,'x',x,'y',y,
        'shape',shape,'width',width,'height',height,'rotation',rotation,'active',active
      ) ORDER BY sector,label),'[]'::jsonb) AS tables FROM dining_tables) layout
      WHERE id=1 AND jsonb_array_length(floor_plan_state.published->'tables')=0
    `);
    await client.query(`
      INSERT INTO floor_plan_state(id,draft,published)
      SELECT 1,
        jsonb_build_object('tables',coalesce(jsonb_agg(jsonb_build_object(
          'id',id,'label',label,'capacity',capacity,'sector',sector,'x',x,'y',y,
          'shape',shape,'width',width,'height',height,'rotation',rotation,'active',active
        ) ORDER BY sector,label),'[]'::jsonb),'elements','[]'::jsonb),
        jsonb_build_object('tables',coalesce(jsonb_agg(jsonb_build_object(
          'id',id,'label',label,'capacity',capacity,'sector',sector,'x',x,'y',y,
          'shape',shape,'width',width,'height',height,'rotation',rotation,'active',active
        ) ORDER BY sector,label),'[]'::jsonb),'elements','[]'::jsonb)
      FROM dining_tables ON CONFLICT(id) DO NOTHING
    `);
    for (const user of seedUsers)
      await client.query(
        'INSERT INTO users(id,username,name,role,password_hash,active) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET active=$6',
        [user.id, user.username, user.name, user.role, passwordHash, user.active !== false],
      );
    for (const user of seedUsers) {
      const pin = user.pin;
      const existing = await one(
        client,
        'SELECT pin_hash,pin_lookup FROM users WHERE id=$1 AND username=$2',
        [user.id, user.username],
      );
      if (!existing) continue;
      if (!existing.pin_hash)
        await client.query(
          'UPDATE users SET pin_hash=$1,pin_lookup=$2,pin_version=pin_version+1 WHERE id=$3 AND pin_hash IS NULL',
          [await seededPinHash(pin), pinLookup(pin), user.id],
        );
      else if (!existing.pin_lookup && (await verifyPin(pin, existing.pin_hash as string)))
        await client.query('UPDATE users SET pin_lookup=$1 WHERE id=$2 AND pin_lookup IS NULL', [
          pinLookup(pin),
          user.id,
        ]);
    }
    if (!sample) return;
    await client.query(
      `INSERT INTO cash_sessions(id,user_id,opening_cents) VALUES('60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002',10000000) ON CONFLICT DO NOTHING`,
    );
    await client.query(`INSERT INTO accounts(id,table_id,waiter_id,guests,status,closed_at) VALUES
      ('70000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000003',2,'open',NULL),
      ('70000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000006',3,'requested',NULL),
      ('70000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000003',2,'closed',now()) ON CONFLICT DO NOTHING`);
    await client.query(`INSERT INTO items(id,account_id,product_id,name,description,unit_cents,quantity,notes,destination,status) VALUES
      ('80000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Café con leche','Ejemplo ficticio.',350000,2,'Uno sin azúcar','bar','sent'),
      ('80000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','Tostado de jamón y queso','Ejemplo ficticio.',650000,1,'Bien tostado','kitchen','preparing'),
      ('80000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003','Medialuna','Ejemplo ficticio.',180000,2,'','none','draft'),
      ('80000000-0000-4000-8000-000000000004','70000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000004','Limonada','Ejemplo ficticio.',400000,3,'','bar','delivered'),
      ('80000000-0000-4000-8000-000000000005','70000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000002','Tostado de jamón y queso','Ejemplo ficticio.',650000,2,'','kitchen','delivered') ON CONFLICT DO NOTHING`);
    await client.query(`INSERT INTO payments(id,account_id,cash_session_id,user_id,amount_cents,method,received_cents,change_cents) VALUES
      ('90000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002',400000,'debit',400000,0),
      ('90000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002',1300000,'cash',1500000,200000) ON CONFLICT DO NOTHING`);
    await client.query(`INSERT INTO print_jobs(id,account_id,destination,status,content) VALUES
      ('a0000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','bar','generated','DEMOSTRACIÓN · Mesa 1 · Martín Camarero\n2 × Café con leche · Uno sin azúcar'),
      ('a0000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000001','kitchen','confirmed','DEMOSTRACIÓN · Mesa 1 · Martín Camarero\n1 × Tostado de jamón y queso · Bien tostado') ON CONFLICT DO NOTHING`);
    await client.query(
      `INSERT INTO invoices(id,account_id,user_id,status,kind,recipient_name,recipient_document,amount_cents,error) VALUES('b0000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000002','rejected','Factura de demostración','Consumidor Final','',1300000,'Rechazo ficticio inicial. El cobro permanece confirmado.') ON CONFLICT DO NOTHING`,
    );
    await client.query(
      `INSERT INTO audit_events(id,user_id,operation,entity,reason) VALUES('c0000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','demo.seed','demo','Datos ficticios iniciales; ninguna transacción bancaria ni emisión fiscal real.') ON CONFLICT DO NOTHING`,
    );
  };
  if (db) await apply(db);
  else await transaction(apply);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    await seed();
    process.stdout.write('Datos ficticios cargados, conservando los registros existentes.\n');
  } finally {
    await pool.end();
  }
}
