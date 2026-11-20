import { beforeAll, describe, expect, it } from 'vitest';
import { anonClient, createAuthUser, service, signIn, testEmail, uniqueText, type Client } from './helpers';

let asAdmin: Client;
let asMember: Client;
let asOutsider: Client;
let wallet: string;
let customerId: string;
let handTools: string;
const today = new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  const adminEmail = testEmail('suppliers-admin');
  const memberEmail = testEmail('suppliers-member');
  const outsiderEmail = testEmail('suppliers-outsider');
  const adminId = await createAuthUser(adminEmail);
  const memberId = await createAuthUser(memberEmail);
  await createAuthUser(outsiderEmail);
  const { error } = await service.from('profiles').insert([
    { id: adminId, display_name: 'Suppliers Admin', email: adminEmail, role: 'admin' },
    { id: memberId, display_name: 'Suppliers Member', email: memberEmail, role: 'member' },
  ]);
  if (error) throw error;
  asAdmin = await signIn(adminEmail);
  asMember = await signIn(memberEmail);
  asOutsider = await signIn(outsiderEmail);
  wallet = (await service.from('accounts').select('id').eq('kind', 'wallet').single()).data!.id;
  customerId = (await asMember.from('contacts').insert({ name: uniqueText('Customer') }).select().single()).data!.id;
  handTools = (await service.from('tool_categories').select('id').eq('name', 'Hand tools').single()).data!.id;
});

async function boughtForJob(supplier: string) {
  const { data: job, error } = await asMember
    .from('jobs')
    .insert({ ref: uniqueText('JOB'), customer_id: customerId, description: 'Brakes', labor_price_cents: 0 })
    .select()
    .single();
  if (error) throw error;
  const line = await asMember.rpc('save_job_bought_line', {
    p_line_id: null as unknown as string,
    p_job_id: job.id,
    p_description: 'Brake pads',
    p_qty: 1,
    p_cost_cents: 3000,
    p_paid_by: wallet,
    p_supplier: supplier,
    p_sale_price_cents: 3500,
    p_occurred_on: today,
  });
  if (line.error) throw line.error;
  const { data } = await service.from('job_lines').select('transaction_id').eq('id', line.data!).single();
  return data!.transaction_id!;
}

async function supplier(name: string) {
  const { data } = await asMember.from('supplier_usage').select('*').eq('name', name).maybeSingle();
  return data;
}

describe('who can see and change the list', () => {
  it('signed out and non-members cannot read or add suppliers', async () => {
    const anon = await anonClient().from('suppliers').select('*');
    expect(anon.error).not.toBeNull();
    expect((await asOutsider.from('suppliers').select('*')).data).toEqual([]);
    expect((await asOutsider.from('supplier_usage').select('*')).data).toEqual([]);
    expect((await asOutsider.from('suppliers').insert({ name: uniqueText('Evil') })).error).not.toBeNull();
  });

  it('members add suppliers but cannot rename or delete them', async () => {
    const name = uniqueText('Shop');
    const { data, error } = await asMember.from('suppliers').insert({ name }).select().single();
    expect(error).toBeNull();
    expect((await asMember.from('suppliers').update({ name: 'Hacked' }).eq('id', data!.id)).error).not.toBeNull();
    expect((await asMember.rpc('rename_supplier', { p_id: data!.id, p_name: 'Hacked' })).error?.code).toBe('42501');
    expect((await asMember.from('suppliers').delete().eq('id', data!.id).select()).data ?? []).toEqual([]);
    expect(await supplier(name)).toMatchObject({ uses: 0 });
  });

  it('names are unique and trimmed', async () => {
    const name = uniqueText('Twice');
    await asMember.from('suppliers').insert({ name });
    expect((await asMember.from('suppliers').insert({ name })).error?.code).toBe('23505');
    expect((await asMember.from('suppliers').insert({ name: ` ${uniqueText('Spaces')} ` })).error).not.toBeNull();
  });
});

describe('purchases fill the list', () => {
  it('a supplier typed on a part for a job joins the list and is counted', async () => {
    const name = uniqueText('Job shop');
    await boughtForJob(`  ${name} `);
    expect(await supplier(name)).toMatchObject({ uses: 1 });
    await boughtForJob(name);
    expect(await supplier(name)).toMatchObject({ uses: 2 });
  });

  it('so does where a tool was bought', async () => {
    const name = uniqueText('Tool shop');
    const { error } = await asMember.from('tools').insert({ code: uniqueText('T'), name: 'Torque wrench', category_id: handTools, bought_from: name });
    expect(error).toBeNull();
    expect(await supplier(name)).toMatchObject({ uses: 1 });
  });
});

describe('admins rename and delete', () => {
  it('renaming changes the name on every purchase', async () => {
    const name = uniqueText('Typo shpo');
    const txn = await boughtForJob(name);
    const { data: entry } = await asAdmin.from('suppliers').select('id').eq('name', name).single();
    const fixed = uniqueText('Typo shop');
    expect((await asAdmin.rpc('rename_supplier', { p_id: entry!.id, p_name: fixed })).error).toBeNull();
    expect((await service.from('transactions').select('counterparty').eq('id', txn).single()).data!.counterparty).toBe(fixed);
    expect(await supplier(name)).toBeNull();
    expect(await supplier(fixed)).toMatchObject({ id: entry!.id, uses: 1 });
  });

  it('renaming to a name already on the list merges the two', async () => {
    const keep = uniqueText('Autodijelovi');
    const dupe = uniqueText('Auto dijelovi');
    await boughtForJob(keep);
    await boughtForJob(dupe);
    const { data: entry } = await asAdmin.from('suppliers').select('id').eq('name', dupe).single();
    expect((await asAdmin.rpc('rename_supplier', { p_id: entry!.id, p_name: keep })).error).toBeNull();
    expect(await supplier(dupe)).toBeNull();
    expect(await supplier(keep)).toMatchObject({ uses: 2 });
    expect((await service.from('suppliers').select('id').eq('name', keep)).data).toHaveLength(1);
  });

  it('a supplier in use cannot be deleted; an unused one can', async () => {
    const used = uniqueText('Used');
    await boughtForJob(used);
    const { data: usedEntry } = await asAdmin.from('suppliers').select('id').eq('name', used).single();
    expect((await asAdmin.from('suppliers').delete().eq('id', usedEntry!.id)).error?.code).toBe('23503');

    const { data: unused } = await asMember.from('suppliers').insert({ name: uniqueText('Unused') }).select().single();
    const del = await asAdmin.from('suppliers').delete().eq('id', unused!.id).select();
    expect(del.error).toBeNull();
    expect(del.data).toHaveLength(1);
  });

  it('suppliers are part of backups', async () => {
    const { data } = await asMember.rpc('backup_tables');
    expect(data).toContain('suppliers');
  });
});
