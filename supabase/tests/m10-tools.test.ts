import { beforeAll, describe, expect, it } from 'vitest';
import { createAuthUser, service, signIn, testEmail, uniqueText, type Client } from './helpers';

let adminId: string;
let memberId: string;
let asAdmin: Client;
let asMember: Client;
let wallet: string;
let memberAccount: string;
let handTools: string;

beforeAll(async () => {
  const ea = testEmail('tools-admin');
  const em = testEmail('tools-member');
  adminId = await createAuthUser(ea);
  memberId = await createAuthUser(em);
  const { error } = await service.from('profiles').insert([
    { id: adminId, display_name: 'Tools Admin', email: ea, role: 'admin', default_share_bp: 0 },
    { id: memberId, display_name: 'Tools Member', email: em, role: 'member', default_share_bp: 0 },
  ]);
  if (error) throw error;
  asAdmin = await signIn(ea);
  asMember = await signIn(em);
  const { data: accounts } = await service.from('accounts').select('id, kind, partner_id');
  wallet = accounts!.find((a) => a.kind === 'wallet')!.id;
  memberAccount = accounts!.find((a) => a.partner_id === memberId)!.id;
  handTools = (await service.from('tool_categories').select('id').eq('name', 'Hand tools').single()).data!.id;
});

async function addTool(values: Record<string, unknown> = {}) {
  const { data, error } = await asMember
    .from('tools')
    .insert({ code: uniqueText('T'), name: 'Torque wrench', category_id: handTools, ...values })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function history(toolId: string) {
  const { data } = await service.from('activity_log').select('action, summary, actor_id').eq('entity_id', toolId).order('id');
  return data!;
}

describe('starting data', () => {
  it('has tool categories and a Tools cost type', async () => {
    const { data } = await asMember.from('tool_categories').select('name').order('sort_order');
    expect(data!.map((c) => c.name)).toEqual(expect.arrayContaining(['Hand tools', 'Power tools', 'Diagnostics & electrical', 'Other']));
    const { data: cost } = await asMember.from('expense_categories').select('name').ilike('name', 'tools');
    expect(cost).toHaveLength(1);
  });

  it('includes tools in backups, after what they point at', async () => {
    const { data } = await asMember.rpc('backup_tables');
    expect(data!.indexOf('tool_categories')).toBeLessThan(data!.indexOf('tools'));
    expect(data!.indexOf('transactions')).toBeLessThan(data!.indexOf('tools'));
    expect(data!.indexOf('brands')).toBeLessThan(data!.indexOf('tools'));
  });
});

describe('tools', () => {
  it('members add tools with a unique ID (ignoring case); who added it is recorded', async () => {
    const code = uniqueText('T');
    const { data, error } = await asMember
      .from('tools')
      .insert({ code, name: 'Impact wrench', category_id: handTools, qty: 2, location: 'Wall rack', price_cents: 18900 })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data!.created_by).toBe(memberId);
    expect(data!.condition).toBe('good');
    const again = await asMember.from('tools').insert({ code: code.toLowerCase(), name: 'Other', category_id: handTools });
    expect(again.error?.code).toBe('23505');
  });

  it('keeps lending and "gone" complete, and quantities sensible', async () => {
    const tool = await addTool();
    expect((await asMember.from('tools').update({ lent_to: 'Marko' }).eq('id', tool.id)).error).not.toBeNull();
    expect((await asMember.from('tools').update({ gone_reason: 'sold' }).eq('id', tool.id)).error).not.toBeNull();
    expect((await asMember.from('tools').update({ qty: 0 }).eq('id', tool.id)).error).not.toBeNull();
    expect((await asMember.from('tools').update({ condition: 'rusty' }).eq('id', tool.id)).error).not.toBeNull();
  });

  it('logs adding, lending, returning, repairs, going and deleting', async () => {
    const tool = await addTool({ name: 'Welder' });
    await asMember.from('tools').update({ lent_to: 'Marko', lent_on: '2026-10-01' }).eq('id', tool.id);
    await asMember.from('tools').update({ lent_to: null, lent_on: null }).eq('id', tool.id);
    await asMember.from('tools').update({ condition: 'needs_repair' }).eq('id', tool.id);
    await asMember.from('tools').update({ condition: 'good', location: 'Shelf A' }).eq('id', tool.id);
    await asMember.from('tools').update({ location: 'Shelf B' }).eq('id', tool.id); // not worth a line
    await asMember.from('tools').update({ gone_on: '2026-10-05', gone_reason: 'given_away' }).eq('id', tool.id);
    await asMember.from('tools').delete().eq('id', tool.id);
    const log = await history(tool.id);
    expect(log.map((l) => l.summary)).toEqual([
      `Added tool ${tool.code} Welder`,
      `Lent ${tool.code} Welder to Marko`,
      `${tool.code} Welder is back from Marko`,
      `${tool.code} Welder needs repair`,
      `${tool.code} Welder works again`,
      `${tool.code} Welder: given away`,
      `Deleted tool ${tool.code} Welder`,
    ]);
    expect(new Set(log.map((l) => l.actor_id))).toEqual(new Set([memberId]));
  });

  it('members cannot link a tool to a money entry themselves', async () => {
    const tool = await addTool();
    const { error } = await asMember
      .from('tools')
      .update({ transaction_id: '00000000-0000-4000-8000-000000000000' } as never)
      .eq('id', tool.id);
    expect(error?.code).toBe('42501');
  });

  it('only admins rename or delete tool categories; a category in use stays', async () => {
    const { data: category, error } = await asMember.from('tool_categories').insert({ name: uniqueText('Cat') }).select().single();
    expect(error).toBeNull();
    expect((await asMember.from('tool_categories').update({ name: 'Renamed' }).eq('id', category!.id).select()).data).toEqual([]);
    await addTool({ category_id: category!.id });
    const del = await asAdmin.from('tool_categories').delete().eq('id', category!.id);
    expect(del.error?.code).toBe('23503');
  });

  it('accepts photos and receipts of tools', async () => {
    const tool = await addTool();
    const { error } = await service.from('attachments').insert({
      entity_type: 'tool',
      entity_id: tool.id,
      kind: 'receipt',
      drive_file_id: uniqueText('drive'),
      file_name: 'receipt.pdf',
      mime_type: 'application/pdf',
    });
    expect(error).toBeNull();
  });
});

describe('paying for a tool from workshop money', () => {
  it('records a workshop expense under Tools, split by the shares given, and keeps it in step', async () => {
    const tool = await addTool({ name: 'Diagnostic scanner', price_cents: 45000, bought_on: '2026-09-15', bought_from: 'Autodijelovi' });
    const { data: txnId, error } = await asMember.rpc('save_tool_payment', {
      p_tool_id: tool.id,
      p_account_id: wallet,
      p_allocations: [{ partner_id: memberId, amount_cents: -45000 }],
    });
    expect(error).toBeNull();
    const { data: txn } = await service
      .from('transactions')
      .select('*, expense_category:expense_categories(name), allocations(partner_id, amount_cents)')
      .eq('id', txnId!)
      .single();
    expect(txn).toMatchObject({
      category: 'workshop_expense',
      amount_cents: 45000,
      occurred_on: '2026-09-15',
      from_account_id: wallet,
      counterparty: 'Autodijelovi',
      description: `Tool: Diagnostic scanner (${tool.code})`,
      expense_category: { name: 'Tools' },
      allocations: [{ partner_id: memberId, amount_cents: -45000 }],
    });
    expect((await service.from('tools').select('transaction_id').eq('id', tool.id).single()).data!.transaction_id).toBe(txnId);

    // a new price and payer update the same entry
    await asMember.from('tools').update({ price_cents: 40000 }).eq('id', tool.id);
    const again = await asMember.rpc('save_tool_payment', {
      p_tool_id: tool.id,
      p_account_id: memberAccount,
      p_allocations: [{ partner_id: memberId, amount_cents: -40000 }],
    });
    expect(again.data).toBe(txnId);
    const { data: updated } = await service.from('transactions').select('amount_cents, from_account_id').eq('id', txnId!).single();
    expect(updated).toEqual({ amount_cents: 40000, from_account_id: memberAccount });

    // deleting the entry in Money unlinks the tool
    expect((await asMember.from('transactions').delete().eq('id', txnId!).select()).data).toHaveLength(1);
    expect((await service.from('tools').select('transaction_id').eq('id', tool.id).single()).data!.transaction_id).toBeNull();
  });

  it('refuses tools without a price, partners’ own tools, and shares that don’t add up', async () => {
    const free = await addTool();
    const noPrice = await asMember.rpc('save_tool_payment', { p_tool_id: free.id, p_account_id: wallet, p_allocations: [] });
    expect(noPrice.error?.message).toMatch(/what the tool cost/);

    const theirs = await addTool({ owner_id: memberId, price_cents: 1000 });
    const partner = await asMember.rpc('save_tool_payment', {
      p_tool_id: theirs.id,
      p_account_id: wallet,
      p_allocations: [{ partner_id: memberId, amount_cents: -1000 }],
    });
    expect(partner.error?.message).toMatch(/belongs to a partner/);

    const priced = await addTool({ price_cents: 1000 });
    const wrong = await asMember.rpc('save_tool_payment', {
      p_tool_id: priced.id,
      p_account_id: wallet,
      p_allocations: [{ partner_id: memberId, amount_cents: -999 }],
    });
    expect(wrong.error?.message).toMatch(/don't add up/);
    expect((await service.from('tools').select('transaction_id').eq('id', priced.id).single()).data!.transaction_id).toBeNull();
  });
});
