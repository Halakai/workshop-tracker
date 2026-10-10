import { beforeAll, describe, expect, it } from 'vitest';
import { createAuthUser, service, signIn, testEmail, uniqueText, type Client } from './helpers';
import { toPostStockMovementArgs } from '@/features/inventory/rpc';
import { buildPurchase } from '@/domain/stock';
import type { Json } from '@/lib/database.types';

// Restoring wipes every workshop table, so this file restores exactly what it exported:
// the files that run after it see the same data as before.

let adminId: string;
let memberId: string;
let asAdmin: Client;
let asMember: Client;

beforeAll(async () => {
  const ea = testEmail('restore-admin');
  const em = testEmail('restore-member');
  adminId = await createAuthUser(ea);
  memberId = await createAuthUser(em);
  const { error } = await service.from('profiles').insert([
    { id: adminId, display_name: 'Restore Admin', email: ea, role: 'admin', default_share_bp: 0 },
    { id: memberId, display_name: 'Restore Member', email: em, role: 'member', default_share_bp: 0 },
  ]);
  if (error) throw error;
  asAdmin = await signIn(ea);
  asMember = await signIn(em);
});

type Rows = Record<string, unknown>[];

/** What the Backup & export page does. */
async function exportAll(client: Client) {
  const { data: tables, error } = await client.rpc('backup_tables');
  if (error) throw error;
  const result: Record<string, Rows> = {};
  for (const table of ['profiles', ...tables]) {
    const rows: Rows = [];
    for (let from = 0; ; from += 1000) {
      const { data, error: e } = await client
        .from(table as 'items')
        .select('*')
        .range(from, from + 999);
      if (e) throw new Error(`${table}: ${e.message}`);
      rows.push(...(data as Rows));
      if (data.length < 1000) break;
    }
    result[table] = rows;
  }
  return { app: 'workshop-tracker', version: 2, exported_at: new Date().toISOString(), tables: result };
}

const byKey = (rows: Rows) =>
  [...rows].sort((a, b) => String(a.id ?? a.key ?? a.seq).localeCompare(String(b.id ?? b.key ?? b.seq)));

describe('backup tables', () => {
  it('lists every readable table, parents before children, without profiles', async () => {
    const { data, error } = await asMember.rpc('backup_tables');
    expect(error).toBeNull();
    expect(data).not.toContain('profiles');
    expect(data).not.toContain('counters'); // only database functions read it
    for (const table of ['accounts', 'settings', 'items', 'cars', 'jobs', 'transactions', 'stock_movements', 'activity_log', 'attachments']) {
      expect(data).toContain(table);
    }
    const at = (t: string) => data!.indexOf(t);
    expect(at('accounts')).toBeLessThan(at('transactions'));
    expect(at('transactions')).toBeLessThan(at('stock_movements'));
    expect(at('settlements')).toBeLessThan(at('transactions'));
    expect(at('stock_movements')).toBeLessThan(at('job_lines'));
    expect(at('items')).toBeLessThan(at('stock_movements'));
  });
});

describe('restore', () => {
  it('is for admins only', async () => {
    const { error } = await asMember.rpc('admin_restore', { p_backup: { app: 'workshop-tracker', tables: { accounts: [] } } });
    expect(error?.code).toBe('42501');
  });

  it('refuses files that are not backups', async () => {
    const { error } = await asAdmin.rpc('admin_restore', { p_backup: { hello: 'world' } });
    expect(error?.message).toMatch(/not a Workshop Tracker backup/);
  });

  it('refuses people who are not users here', async () => {
    const backup = await exportAll(asAdmin);
    backup.tables.profiles = [...backup.tables.profiles, { id: '00000000-0000-4000-8000-000000000001', display_name: 'Ghost' }];
    const { error } = await asAdmin.rpc('admin_restore', { p_backup: backup as unknown as Json });
    expect(error?.message).toMatch(/Ghost/);
  });

  it('puts everything back exactly as it was, and the app keeps working', async () => {
    // some data that must survive: a car with a purchase, a job with an invoice number
    const { data: accounts } = await service.from('accounts').select('id, kind, partner_id');
    const external = accounts!.find((a) => a.kind === 'external')!.id;
    const memberAccount = accounts!.find((a) => a.partner_id === memberId)!.id;
    const { data: car } = await asMember.from('cars').insert({ ref: uniqueText('RST'), make: 'Škoda', model: 'Octavia' }).select().single();
    await asMember.from('transactions').insert({
      car_id: car!.id,
      category: 'car_purchase',
      kind: 'expense',
      amount_cents: 123456,
      from_account_id: memberAccount,
      to_account_id: external,
    });
    const { data: customer } = await asMember.from('contacts').insert({ name: uniqueText('Restore customer') }).select().single();
    const { data: job } = await asMember.from('jobs').insert({ ref: uniqueText('RJ'), customer_id: customer!.id, description: 'Oil' }).select().single();
    const { data: invoice } = await asMember.rpc('issue_invoice_number', { p_job_id: job!.id });

    const backup = await exportAll(asAdmin);

    // things go wrong after the backup
    await service.from('transactions').delete().eq('car_id', car!.id);
    await service.from('cars').delete().eq('id', car!.id);
    await asMember.from('contacts').insert({ name: uniqueText('After backup') });

    const { data: counts, error } = await asAdmin.rpc('admin_restore', { p_backup: backup as unknown as Json });
    expect(error).toBeNull();
    expect((counts as unknown as Record<string, number>).cars).toBe(backup.tables.cars.length);

    const after = await exportAll(asAdmin);
    const { activity_log: logBefore, ...tablesBefore } = backup.tables;
    for (const [table, rows] of Object.entries(tablesBefore)) {
      expect(byKey(after.tables[table]), table).toEqual(byKey(rows));
    }
    // the activity log is the backup's plus one line about the restore
    expect(after.tables.activity_log).toHaveLength(logBefore.length + 1);
    const { data: last } = await service.from('activity_log').select('*').order('id', { ascending: false }).limit(1).single();
    expect(last!.summary).toMatch(/^Restored the backup from \d{2}\.\d{2}\.\d{4}$/);
    expect(last!.actor_id).toBe(adminId);
    expect(last!.id).toBeGreaterThan(Math.max(...logBefore.map((l) => Number(l.id))));

    // the restored car keeps who added it and when
    const restored = after.tables.cars.find((c) => c.id === car!.id)!;
    expect(restored.created_by).toBe(memberId);
    expect(restored.created_at).toBe(car!.created_at);

    // triggers are back on: new rows are stamped and logged
    const { data: newCar } = await asMember.from('cars').insert({ ref: uniqueText('RST'), make: 'VW', model: 'Golf' }).select().single();
    expect(newCar!.created_by).toBe(memberId);
    const { data: logged } = await service.from('activity_log').select('action').eq('entity_id', newCar!.id);
    expect(logged!.map((l) => l.action)).toEqual(['add']);

    // invoice numbers carry on after the restored ones
    const { data: job2 } = await asMember.from('jobs').insert({ ref: uniqueText('RJ'), customer_id: customer!.id, description: 'Tyres' }).select().single();
    const { data: invoice2 } = await asMember.rpc('issue_invoice_number', { p_job_id: job2!.id });
    const n = (s: string) => Number(s.split('-')[1]);
    expect(n(invoice2!)).toBe(n(invoice!) + 1);

    // stock movement numbers carry on too
    const { data: unit } = await service.from('units').select('id').eq('name', 'pcs').single();
    const { data: category } = await service.from('item_categories').select('id').limit(1).single();
    const { data: item } = await asMember
      .from('items')
      .insert({ name: 'Restore test item', part_number: uniqueText('RST-ITEM'), unit_id: unit!.id, category_id: category!.id })
      .select()
      .single();
    const { data: wallet } = await service.from('accounts').select('id').eq('kind', 'wallet').single();
    const posted = await asMember.rpc(
      'post_stock_movement',
      toPostStockMovementArgs(item!.id, item!.version, buildPurchase({ qty: 1000, totalCost: 500, paidBy: wallet!.id, occurredOn: car!.purchase_date })),
    );
    expect(posted.error).toBeNull();
    const { data: movement } = await service.from('stock_movements').select('seq').eq('item_id', item!.id).single();
    const seqs = backup.tables.stock_movements.map((m) => Number(m.seq));
    expect(movement!.seq).toBeGreaterThan(Math.max(0, ...seqs));
  });

  it('gives users who joined after the backup a money account', async () => {
    const backup = await exportAll(asAdmin);
    const email = testEmail('restore-new');
    const newId = await createAuthUser(email);
    const { error: e } = await service.from('profiles').insert({ id: newId, display_name: 'Restore New', email, role: 'member', default_share_bp: 0 });
    if (e) throw e;

    const { error } = await asAdmin.rpc('admin_restore', { p_backup: backup as unknown as Json });
    expect(error).toBeNull();
    const { data } = await service.from('accounts').select('kind').eq('partner_id', newId);
    expect(data).toEqual([{ kind: 'partner' }]);
  });
});
