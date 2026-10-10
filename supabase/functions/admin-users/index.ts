// Admin-only user management. Needs the secret key (auth admin API), so it runs here and never in the browser.
// Every call: verify the caller's JWT (@supabase/server) → require an ACTIVE profile with role 'admin'.
import { withSupabase } from 'npm:@supabase/server@1';
import { z } from 'npm:zod@4';

const role = z.enum(['admin', 'member']);
const password = z.string().min(8, 'Password must be at least 8 characters').max(72);
const displayName = z.string().trim().min(1, 'Name is required').max(60);
const shareBp = z.number().int().min(0).max(10000);

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list') }),
  z.object({
    action: z.literal('create'),
    email: z.email().transform((e) => e.trim().toLowerCase()),
    password,
    display_name: displayName,
    role,
  }),
  z.object({ action: z.literal('set_password'), user_id: z.uuid(), password }),
  z.object({ action: z.literal('set_active'), user_id: z.uuid(), active: z.boolean() }),
  z.object({ action: z.literal('set_role'), user_id: z.uuid(), role }),
  z.object({ action: z.literal('rename'), user_id: z.uuid(), display_name: displayName }),
  z.object({
    action: z.literal('set_shares'),
    shares: z.array(z.object({ user_id: z.uuid(), share_bp: shareBp })).min(1),
  }),
]);

// Ban length used to "disable" an account (~100 years). Unban with 'none'.
const DISABLED_BAN = '876000h';

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    try {
      if (req.method !== 'POST') throw new HttpError(405, 'Use POST');

      const admin = ctx.supabaseAdmin;
      const callerId = ctx.userClaims?.id;
      if (!callerId) throw new HttpError(401, 'Not signed in');

      const { data: caller, error: callerError } = await admin
        .from('profiles')
        .select('id, display_name, role, is_active')
        .eq('id', callerId)
        .maybeSingle();
      if (callerError) throw callerError;
      if (!caller || !caller.is_active || caller.role !== 'admin') {
        throw new HttpError(403, 'Only an admin can manage users.');
      }

      const parsed = Body.safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        throw new HttpError(400, parsed.error.issues.map((i) => i.message).join('; '));
      }
      const body = parsed.data;

      const log = async (entityId: string, action: string, summary: string) => {
        const { error } = await admin.from('activity_log').insert({
          actor_id: callerId,
          entity_type: 'profile',
          entity_id: entityId,
          action,
          summary,
        });
        if (error) console.error('activity_log insert failed', error);
      };

      const getProfile = async (userId: string) => {
        const { data, error } = await admin
          .from('profiles')
          .select('id, display_name, role, is_active')
          .eq('id', userId)
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new HttpError(404, 'User not found');
        return data;
      };

      // Refuse anything that would leave the app without an active admin.
      const assertAnotherActiveAdmin = async (userId: string) => {
        const { count, error } = await admin
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'admin')
          .eq('is_active', true)
          .neq('id', userId);
        if (error) throw error;
        if (!count) throw new HttpError(409, 'There must always be at least one active admin.');
      };

      switch (body.action) {
        case 'list': {
          const { data: profiles, error } = await admin.from('profiles').select('*').order('created_at');
          if (error) throw error;
          const { data: authUsers, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
          if (listError) throw listError;
          const byId = new Map(authUsers.users.map((u) => [u.id, u]));
          return Response.json({
            users: profiles.map((p) => ({
              ...p,
              last_sign_in_at: byId.get(p.id)?.last_sign_in_at ?? null,
            })),
          });
        }

        case 'create': {
          const { data: created, error } = await admin.auth.admin.createUser({
            email: body.email,
            password: body.password,
            email_confirm: true,
          });
          if (error) {
            const exists = /already|registered|exists/i.test(error.message);
            throw new HttpError(exists ? 409 : 400, exists ? 'A user with this email already exists.' : error.message);
          }
          const userId = created.user.id;
          const { error: profileError } = await admin.from('profiles').insert({
            id: userId,
            display_name: body.display_name,
            email: body.email,
            role: body.role,
            default_share_bp: 0,
            created_by: callerId,
          });
          if (profileError) {
            // roll back so the email can be used again
            await admin.auth.admin.deleteUser(userId);
            throw profileError;
          }
          await log(userId, 'create', `Created account for ${body.display_name} (${body.role})`);
          return Response.json({ id: userId });
        }

        case 'set_password': {
          const target = await getProfile(body.user_id);
          const { error } = await admin.auth.admin.updateUserById(body.user_id, { password: body.password });
          if (error) throw new HttpError(400, error.message);
          await log(body.user_id, 'set_password', `Reset password for ${target.display_name}`);
          return Response.json({ ok: true });
        }

        case 'set_active': {
          const target = await getProfile(body.user_id);
          if (!body.active) {
            if (body.user_id === callerId) throw new HttpError(409, "You can't disable your own account.");
            if (target.role === 'admin') await assertAnotherActiveAdmin(body.user_id);
          }
          const { error } = await admin.auth.admin.updateUserById(body.user_id, {
            ban_duration: body.active ? 'none' : DISABLED_BAN,
          });
          if (error) throw new HttpError(400, error.message);
          const { error: updateError } = await admin
            .from('profiles')
            .update({ is_active: body.active, updated_by: callerId })
            .eq('id', body.user_id);
          if (updateError) throw updateError;
          await log(body.user_id, body.active ? 'enable' : 'disable', `${body.active ? 'Enabled' : 'Disabled'} ${target.display_name}`);
          return Response.json({ ok: true });
        }

        case 'set_role': {
          const target = await getProfile(body.user_id);
          if (target.role === 'admin' && body.role !== 'admin') await assertAnotherActiveAdmin(body.user_id);
          const { error } = await admin
            .from('profiles')
            .update({ role: body.role, updated_by: callerId })
            .eq('id', body.user_id);
          if (error) throw error;
          await log(body.user_id, 'set_role', `${target.display_name} is now ${body.role}`);
          return Response.json({ ok: true });
        }

        case 'rename': {
          const target = await getProfile(body.user_id);
          const { error } = await admin
            .from('profiles')
            .update({ display_name: body.display_name, updated_by: callerId })
            .eq('id', body.user_id);
          if (error) throw error;
          await log(body.user_id, 'rename', `Renamed ${target.display_name} to ${body.display_name}`);
          return Response.json({ ok: true });
        }

        case 'set_shares': {
          const { error } = await admin.rpc('admin_set_default_shares', {
            p_actor: callerId,
            p_shares: body.shares,
          });
          if (error) throw new HttpError(400, error.message);
          await log(callerId, 'set_shares', 'Changed default profit shares');
          return Response.json({ ok: true });
        }
      }
    } catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
      console.error(e);
      const message = e instanceof Error ? e.message : (e as { message?: string })?.message ?? 'Unexpected error';
      return Response.json({ error: message }, { status: 500 });
    }
  }),
};
