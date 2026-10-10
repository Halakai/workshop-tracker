import { beforeAll, describe, expect, it } from 'vitest';
import { anonClient, createAuthUser, service, signIn, testEmail, uniqueText, type Client } from './helpers';

let memberId: string;
let asMember: Client;
let wallet: string;
let external: string;
let account: string;

beforeAll(async () => {
  const em = testEmail('activity-member');
  memberId = await createAuthUser(em);
  const { error } = await service.from('profiles').insert({ id: memberId, display_name: 'Activity Member', email: em, role: 'member', default_share_bp: 0 });
  if (error) throw error;
  asMember = await signIn(em);
  const { data: accounts } = await service.from('accounts').select('id, kind, partner_id');
  wallet = accounts!.find((a) => a.kind === 'wallet')!.id;
  external = accounts!.find((a) => a.kind === 'external')!.id;
  account = accounts!.find((a) => a.partner_id === memberId)!.id;
});

async function log(entityId: string) {
  const { data } = await service.from('activity_log').select('action, summary, actor_id').eq('entity_id', entityId).order('id');
  return data ?? [];
}

describe('recent activity', () => {
  it('records new cars, status changes and car money with who did it', async () => {
    const { data: car } = await asMember.from('cars').insert({ ref: uniqueText('ACT'), make: 'VW', model: 'Golf', year: 2010 }).select().single();
    await asMember.from('cars').update({ status: 'in_repair' }).eq('id', car!.id);
    await asMember.from('transactions').insert({
      car_id: car!.id,
      category: 'car_purchase',
      kind: 'expense',
      amount_cents: 150000,
      from_account_id: account,
      to_account_id: external,
    });
    const entries = await log(car!.id);
    expect(entries.map((e) => e.action)).toEqual(['add', 'status', 'car_purchase']);
    expect(entries[2].summary).toBe(`Bought ${car!.ref} for 1 500.00€ (paid by Activity Member)`);
    expect(entries.every((e) => e.actor_id === memberId)).toBe(true);
  });

  it('records deposits in plain words', async () => {
    const { data: txn } = await asMember
      .from('transactions')
      .insert({ category: 'deposit', kind: 'deposit', amount_cents: 50000, from_account_id: account, to_account_id: wallet })
      .select()
      .single();
    const entries = await log(txn!.id);
    expect(entries.map((e) => e.summary)).toEqual(['Activity Member put 500.00€ into the wallet']);
  });

  it('records new jobs', async () => {
    const { data: customer } = await asMember.from('contacts').insert({ name: uniqueText('Act customer') }).select().single();
    const { data: job } = await asMember
      .from('jobs')
      .insert({ ref: uniqueText('AJ'), customer_id: customer!.id, description: 'Brakes' })
      .select()
      .single();
    const entries = await log(job!.id);
    expect(entries[0].summary).toBe(`New job ${job!.ref} for ${customer!.name}`);
  });
});

describe('keep-alive and backup reminder', () => {
  it('signed-out callers can ping, and nothing else', async () => {
    const ping = await anonClient().rpc('keepalive');
    expect(ping.data).toBe(true);
  });

  it('only admins can record an export', async () => {
    const res = await asMember.from('settings').update({ last_export_at: new Date().toISOString() }).eq('id', true).select();
    expect(res.data ?? []).toEqual([]);
  });
});
