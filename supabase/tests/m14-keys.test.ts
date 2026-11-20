import { beforeAll, describe, expect, it } from 'vitest';
import { anonClient, createAuthUser, service, signIn, testEmail, uniqueText, type Client } from './helpers';

let asMember: Client;
let asOutsider: Client;
let wallet: string;
let external: string;
let customerId: string;
const today = new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  const memberEmail = testEmail('keys-member');
  const outsiderEmail = testEmail('keys-outsider');
  const memberId = await createAuthUser(memberEmail);
  await createAuthUser(outsiderEmail);
  const { error } = await service.from('profiles').insert([{ id: memberId, display_name: 'Keys Member', email: memberEmail, role: 'member' }]);
  if (error) throw error;
  asMember = await signIn(memberEmail);
  asOutsider = await signIn(outsiderEmail);
  const { data: accounts } = await service.from('accounts').select('id, kind');
  wallet = accounts!.find((a) => a.kind === 'wallet')!.id;
  external = accounts!.find((a) => a.kind === 'external')!.id;
  customerId = (await asMember.from('contacts').insert({ name: 'Ivan Secret-Customer' }).select().single()).data!.id;
});

/** A job with a bought part (cost 13579, charged 5678), another line, labor, a payment, notes and photos. */
async function jobWithEverything() {
  const { data: job, error } = await asMember
    .from('jobs')
    .insert({
      ref: uniqueText('JOB'),
      customer_id: customerId,
      description: 'New brake pads and a check-up',
      labor_price_cents: 4000,
      car_make: 'VW',
      car_model: 'Golf',
      car_plate: 'ZG-123-AB',
      notes: 'INTERNAL-NOTE do not show',
    })
    .select()
    .single();
  if (error) throw error;
  const bought = await asMember.rpc('save_job_bought_line', {
    p_line_id: null as unknown as string,
    p_job_id: job.id,
    p_description: 'Brake pads',
    p_qty: 1,
    p_cost_cents: 13579,
    p_paid_by: wallet,
    p_supplier: 'Secret Supplier d.o.o.',
    p_sale_price_cents: 5678,
    p_occurred_on: today,
  });
  if (bought.error) throw bought.error;
  await asMember.from('job_lines').insert({ job_id: job.id, kind: 'other', description: 'Disposal fee', qty: 2, sale_price_cents: 300 });
  const pay = await asMember.from('transactions').insert({
    job_id: job.id,
    category: 'job_payment',
    kind: 'income',
    amount_cents: 5000,
    from_account_id: external,
    to_account_id: wallet,
    occurred_on: today,
  });
  if (pay.error) throw pay.error;
  const photo = async () =>
    (
      await service
        .from('attachments')
        .insert({ entity_type: 'job', entity_id: job.id, kind: 'photo', drive_file_id: uniqueText('drive'), file_name: 'p.jpg', mime_type: 'image/jpeg' })
        .select()
        .single()
    ).data!;
  const shown = await photo();
  const hidden = await photo();
  await asMember.rpc('set_photo_on_website', { p_attachment_id: shown.id, p_on: true });
  return { job, shown, hidden };
}

async function makeKey(jobId: string, note?: string) {
  const { data, error } = await asMember.rpc('create_access_key', { p_kind: 'job', p_job_id: jobId, p_car_id: null as unknown as string, p_note: note });
  if (error) throw error;
  return data;
}

const open = (code: string, ip: string | null = null, count = true) =>
  service.rpc('open_access_key', { p_code: code, p_ip: ip as unknown as string, p_count: count });

describe('making keys', () => {
  it('members make keys with an easy-to-type code; several per job', async () => {
    const { job } = await jobWithEverything();
    const a = await makeKey(job.id, 'Ivan');
    const b = await makeKey(job.id);
    expect(a.code).toMatch(/^[2-9A-HJKMNP-Z]{8}$/);
    expect(a.code).not.toBe(b.code);
    expect(a).toMatchObject({ kind: 'job', job_id: job.id, note: 'Ivan', opened_count: 0, switched_off_at: null });
    const { data: list } = await asMember.from('access_keys').select('id').eq('job_id', job.id);
    expect(list).toHaveLength(2);
    const { data: log } = await service.from('activity_log').select('action, summary').eq('entity_id', job.id).eq('action', 'key');
    expect(log).toHaveLength(2);
  });

  it('nobody writes a code by hand, and only members see keys', async () => {
    const { job } = await jobWithEverything();
    const direct = await asMember.from('access_keys').insert({ code: 'ABCDEFGH', kind: 'job', job_id: job.id });
    expect(direct.error).not.toBeNull();
    const key = await makeKey(job.id);
    expect((await asMember.from('access_keys').update({ code: 'ABCDEFGH' }).eq('id', key.id)).error).not.toBeNull();
    expect((await asOutsider.from('access_keys').select('*').eq('id', key.id)).data).toEqual([]);
    expect((await anonClient().from('access_keys').select('*')).error).not.toBeNull();
    expect((await asOutsider.rpc('create_access_key', { p_kind: 'job', p_job_id: job.id, p_car_id: null as unknown as string })).error?.code).toBe('42501');
  });

  it('only the files function (service role) opens keys', async () => {
    const { job } = await jobWithEverything();
    const key = await makeKey(job.id);
    expect((await asMember.rpc('open_access_key', { p_code: key.code })).error).not.toBeNull();
    expect((await anonClient().rpc('open_access_key', { p_code: key.code })).error).not.toBeNull();
  });
});

describe('what a job key shows', () => {
  it('the work at the customer’s prices, payments and the ticked photos; never costs, suppliers, notes or the customer', async () => {
    const { job, shown, hidden } = await jobWithEverything();
    const key = await makeKey(job.id);
    const { data, error } = await open(`${key.code.slice(0, 4).toLowerCase()}-${key.code.slice(4)}`);
    expect(error).toBeNull();
    const view = data as any;
    expect(view).toMatchObject({
      kind: 'job',
      code: key.code,
      job: {
        ref: job.ref,
        description: 'New brake pads and a check-up',
        status: 'open',
        car_make: 'VW',
        car_plate: 'ZG-123-AB',
        labor_cents: 4000,
        has_invoice: false,
        payments: [{ date: today, amount_cents: 5000 }],
      },
      photos: [{ id: shown.id }],
    });
    expect(view.job.lines).toEqual([
      { description: 'Brake pads', qty: 1, unit: null, price_cents: 5678 },
      { description: 'Disposal fee', qty: 2, unit: null, price_cents: 300 },
    ]);
    const text = JSON.stringify(view);
    for (const secret of ['13579', 'Secret Supplier', 'INTERNAL-NOTE', 'Ivan Secret-Customer', hidden.id, 'cost', 'settle', 'share']) {
      expect(text).not.toContain(secret);
    }
  });

  it('counts openings, but not a team member looking', async () => {
    const { job } = await jobWithEverything();
    const key = await makeKey(job.id);
    await open(key.code);
    await open(key.code);
    await open(key.code, null, false);
    const { data } = await asMember.from('access_keys').select('opened_count, last_opened_at').eq('id', key.id).single();
    expect(data!.opened_count).toBe(2);
    expect(data!.last_opened_at).not.toBeNull();
  });

  it('a switched-off key opens nothing, until it is switched on again', async () => {
    const { job } = await jobWithEverything();
    const key = await makeKey(job.id);
    await asMember.from('access_keys').update({ switched_off_at: new Date().toISOString() }).eq('id', key.id);
    expect((await open(key.code)).data).toBeNull();
    await asMember.from('access_keys').update({ switched_off_at: null }).eq('id', key.id);
    expect((await open(key.code)).data).not.toBeNull();
  });

  it('a phone that keeps guessing is stopped after 20 wrong codes', async () => {
    const { job } = await jobWithEverything();
    const key = await makeKey(job.id);
    const ip = `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
    for (let i = 0; i < 20; i++) expect((await open('ZZZZZZZZ', ip)).data).toBeNull();
    const blocked = await open(key.code, ip);
    expect(blocked.error?.message).toMatch(/Too many wrong codes/);
    // other phones are not affected
    expect((await open(key.code, '10.255.255.1')).data).not.toBeNull();
  });

  it('keys go with their job', async () => {
    const { job } = await jobWithEverything();
    const key = await makeKey(job.id);
    await service.from('job_lines').delete().eq('job_id', job.id);
    await service.from('transactions').delete().eq('job_id', job.id);
    await service.from('jobs').delete().eq('id', job.id);
    expect((await service.from('access_keys').select('id').eq('id', key.id)).data).toEqual([]);
  });
});
