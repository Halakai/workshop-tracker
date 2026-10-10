import { beforeAll, describe, expect, it } from 'vitest';
import {
  APP_TABLES,
  adminUsers,
  anonClient,
  createAuthUser,
  service,
  signIn,
  testEmail,
  type Client,
} from './helpers';

const emails = {
  admin: testEmail('admin'),
  member: testEmail('member'),
  outsider: testEmail('outsider'),
};

let adminId: string;
let memberId: string;
let asAnon: Client;
let asAdmin: Client;
let asMember: Client;
let asOutsider: Client;

beforeAll(async () => {
  adminId = await createAuthUser(emails.admin);
  memberId = await createAuthUser(emails.member);
  await createAuthUser(emails.outsider); // signed in, but never given a profile

  // what app.bootstrap_admin() and the admin-users function do
  const { error } = await service.from('profiles').insert([
    { id: adminId, display_name: 'Test Admin', email: emails.admin, role: 'admin', default_share_bp: 5000 },
    { id: memberId, display_name: 'Test Member', email: emails.member, role: 'member', default_share_bp: 5000 },
  ]);
  if (error) throw error;

  asAnon = anonClient();
  asAdmin = await signIn(emails.admin);
  asMember = await signIn(emails.member);
  asOutsider = await signIn(emails.outsider);
});

async function workshopName() {
  const { data, error } = await service.from('settings').select('workshop_name').single();
  if (error) throw error;
  return data.workshop_name;
}

describe('signed out', () => {
  it.each(APP_TABLES)('cannot read %s at all', async (table) => {
    const { data, error } = await asAnon.from(table).select('*');
    expect(error, `anon read ${table}: ${JSON.stringify(data)}`).not.toBeNull();
    expect(data).toBeNull();
  });

  it('cannot write', async () => {
    const before = await workshopName();
    const { error } = await asAnon.from('settings').update({ workshop_name: 'hacked' }).eq('id', true);
    expect(error).not.toBeNull();
    expect(await workshopName()).toBe(before);

    const { error: insertError } = await asAnon
      .from('activity_log')
      .insert({ entity_type: 'x', action: 'x', summary: 'x' });
    expect(insertError).not.toBeNull();
  });

  it('cannot call database admin functions', async () => {
    const { error } = await asAnon.rpc('admin_set_default_shares', { p_actor: adminId, p_shares: [] });
    expect(error).not.toBeNull();
  });

  it('is rejected by the admin-users function', async () => {
    const res = await adminUsers(asAnon, { action: 'list' });
    expect(res.status).toBe(401);
  });
});

describe('signed in but not a member of this app', () => {
  it.each(APP_TABLES)('sees no rows in %s', async (table) => {
    const { data, error } = await asOutsider.from(table).select('*');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('cannot change settings', async () => {
    const before = await workshopName();
    await asOutsider.from('settings').update({ workshop_name: 'hacked' }).eq('id', true);
    expect(await workshopName()).toBe(before);
  });

  it('is refused by the admin-users function', async () => {
    const res = await adminUsers(asOutsider, { action: 'list' });
    expect(res.status).toBe(403);
  });
});

describe('member', () => {
  it('can read profiles, accounts and settings', async () => {
    const profiles = await asMember.from('profiles').select('id');
    expect(profiles.data?.map((p) => p.id)).toEqual(expect.arrayContaining([adminId, memberId]));

    const accounts = await asMember.from('accounts').select('kind, partner_id');
    expect(accounts.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'wallet' }),
        expect.objectContaining({ kind: 'external' }),
        expect.objectContaining({ kind: 'partner', partner_id: memberId }),
      ]),
    );

    const settings = await asMember.from('settings').select('*');
    expect(settings.data).toHaveLength(1);
  });

  it('can rename itself, and created_by/updated_by come from the JWT', async () => {
    const { data, error } = await asMember
      .from('profiles')
      .update({ display_name: 'Member Renamed' })
      .eq('id', memberId)
      .select('display_name, updated_by')
      .single();
    expect(error).toBeNull();
    expect(data).toEqual({ display_name: 'Member Renamed', updated_by: memberId });
  });

  it('cannot rename someone else', async () => {
    const { data } = await asMember.from('profiles').update({ display_name: 'pwned' }).eq('id', adminId).select();
    expect(data ?? []).toEqual([]);
    const { data: adminProfile } = await service.from('profiles').select('display_name').eq('id', adminId).single();
    expect(adminProfile?.display_name).toBe('Test Admin');
  });

  it('cannot make itself admin or change its share', async () => {
    const role = await asMember.from('profiles').update({ role: 'admin' }).eq('id', memberId);
    expect(role.error?.code).toBe('42501');
    const share = await asMember.from('profiles').update({ default_share_bp: 10000 }).eq('id', memberId);
    expect(share.error?.code).toBe('42501');
    const active = await asMember.from('profiles').update({ is_active: true }).eq('id', memberId);
    expect(active.error?.code).toBe('42501');

    const { data } = await service.from('profiles').select('role, default_share_bp').eq('id', memberId).single();
    expect(data).toEqual({ role: 'member', default_share_bp: 5000 });
  });

  it('cannot change workshop settings', async () => {
    const before = await workshopName();
    const { data } = await asMember.from('settings').update({ workshop_name: 'hacked' }).eq('id', true).select();
    expect(data ?? []).toEqual([]);
    expect(await workshopName()).toBe(before);
  });

  it('cannot write accounts or the activity log directly', async () => {
    const account = await asMember.from('accounts').insert({ kind: 'wallet', name: 'Second wallet' });
    expect(account.error).not.toBeNull();
    const log = await asMember.from('activity_log').insert({ entity_type: 'x', action: 'x', summary: 'fake' });
    expect(log.error).not.toBeNull();
  });

  it('cannot call admin_set_default_shares', async () => {
    const { error } = await asMember.rpc('admin_set_default_shares', {
      p_actor: memberId,
      p_shares: [{ user_id: memberId, share_bp: 10000 }],
    });
    expect(error).not.toBeNull();
  });

  it.each([
    { action: 'list' },
    { action: 'create', email: 'evil@test.local', password: 'password123', display_name: 'Evil', role: 'admin' },
    { action: 'set_role', user_id: '00000000-0000-4000-8000-000000000000', role: 'admin' },
    { action: 'set_shares', shares: [{ user_id: '00000000-0000-4000-8000-000000000000', share_bp: 10000 }] },
  ])('is refused by admin-users: $action', async (body) => {
    const res = await adminUsers(asMember, body);
    expect(res.status).toBe(403);
  });

  it('really did not create or promote anyone', async () => {
    const { data } = await service.from('profiles').select('role').eq('id', memberId).single();
    expect(data?.role).toBe('member');
    const { data: evil } = await service.auth.admin.listUsers();
    expect(evil.users.some((u) => u.email === 'evil@test.local')).toBe(false);
  });
});

describe('admin', () => {
  it('can change workshop settings', async () => {
    const { error } = await asAdmin.from('settings').update({ workshop_name: 'Test Garage' }).eq('id', true);
    expect(error).toBeNull();
    expect(await workshopName()).toBe('Test Garage');
  });

  it('lists users with last sign-in', async () => {
    const res = await adminUsers(asAdmin, { action: 'list' });
    expect(res.status).toBe(200);
    const ids = res.body.users.map((u: { id: string }) => u.id);
    expect(ids).toEqual(expect.arrayContaining([adminId, memberId]));
    expect(res.body.users.find((u: { id: string }) => u.id === adminId).last_sign_in_at).toBeTruthy();
  });

  it('creates a user who can then sign in and gets a partner account', async () => {
    const email = testEmail('friend');
    const res = await adminUsers(asAdmin, {
      action: 'create',
      email,
      password: 'friend-password-1',
      display_name: 'Friend',
      role: 'member',
    });
    expect(res.status).toBe(200);
    const friend = await signIn(email, 'friend-password-1');
    const { data } = await friend.from('profiles').select('id, created_by').eq('id', res.body.id).single();
    expect(data?.created_by).toBe(adminId);
    const { data: account } = await service.from('accounts').select('kind').eq('partner_id', res.body.id).single();
    expect(account?.kind).toBe('partner');

    const duplicate = await adminUsers(asAdmin, {
      action: 'create',
      email,
      password: 'friend-password-1',
      display_name: 'Friend again',
      role: 'member',
    });
    expect(duplicate.status).toBe(409);
  });

  it('validates input', async () => {
    const res = await adminUsers(asAdmin, { action: 'create', email: 'not-an-email', password: 'x', display_name: '', role: 'boss' });
    expect(res.status).toBe(400);
  });

  it('sets default shares only when they add up to 100 %', async () => {
    const bad = await adminUsers(asAdmin, {
      action: 'set_shares',
      shares: [
        { user_id: adminId, share_bp: 6000 },
        { user_id: memberId, share_bp: 3000 },
      ],
    });
    expect(bad.status).toBe(400);

    const good = await adminUsers(asAdmin, {
      action: 'set_shares',
      shares: [
        { user_id: adminId, share_bp: 6000 },
        { user_id: memberId, share_bp: 4000 },
      ],
    });
    expect(good.status).toBe(200);
    const { data } = await service.from('profiles').select('id, default_share_bp').in('id', [adminId, memberId]);
    expect(Object.fromEntries((data ?? []).map((p) => [p.id, p.default_share_bp]))).toEqual({
      [adminId]: 6000,
      [memberId]: 4000,
    });
  });

  it('can never leave the app without an active admin', async () => {
    // other test files create admins too: make this one the only active admin for the check
    const { data: others } = await service
      .from('profiles')
      .update({ is_active: false })
      .eq('role', 'admin')
      .eq('is_active', true)
      .neq('id', adminId)
      .select('id');
    try {
      const demote = await adminUsers(asAdmin, { action: 'set_role', user_id: adminId, role: 'member' });
      expect(demote.status).toBe(409);
      const disableSelf = await adminUsers(asAdmin, { action: 'set_active', user_id: adminId, active: false });
      expect(disableSelf.status).toBe(409);
    } finally {
      if (others?.length) {
        await service.from('profiles').update({ is_active: true }).in('id', others.map((o) => o.id));
      }
    }
  });

  it('disabling a member cuts off their access immediately; enabling restores it', async () => {
    const disable = await adminUsers(asAdmin, { action: 'set_active', user_id: memberId, active: false });
    expect(disable.status).toBe(200);

    // their still-valid session no longer sees anything
    const { data } = await asMember.from('profiles').select('id');
    expect(data).toEqual([]);
    // and they can't sign in again
    await expect(signIn(emails.member)).rejects.toThrow();

    const enable = await adminUsers(asAdmin, { action: 'set_active', user_id: memberId, active: true });
    expect(enable.status).toBe(200);
    const again = await signIn(emails.member);
    const { data: visible } = await again.from('profiles').select('id');
    expect(visible?.length).toBeGreaterThan(0);
  });

  it('records admin actions in the activity log', async () => {
    const { data } = await asAdmin.from('activity_log').select('action, actor_id').eq('actor_id', adminId);
    expect(data?.map((r) => r.action)).toEqual(expect.arrayContaining(['create', 'set_shares', 'disable', 'enable']));
  });
});
