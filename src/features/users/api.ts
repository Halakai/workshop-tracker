import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { profileKeys, type Profile } from '@/features/auth/profiles';
import type { Enums } from '@/lib/database.types';

export type Role = Enums<'user_role'>;

export interface AdminUser extends Profile {
  last_sign_in_at: string | null;
}

export type AdminAction =
  | { action: 'create'; email: string; password: string; display_name: string; role: Role }
  | { action: 'set_password'; user_id: string; password: string }
  | { action: 'set_active'; user_id: string; active: boolean }
  | { action: 'set_role'; user_id: string; role: Role }
  | { action: 'rename'; user_id: string; display_name: string }
  | { action: 'set_shares'; shares: { user_id: string; share_bp: number }[] };

/** Calls the admin-users Edge Function; it checks on the server that the caller is an active admin. */
async function callAdminUsers<T>(body: AdminAction | { action: 'list' }): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) throw new Error(await errorMessage(error));
  return data as T;
}

const adminUsersKey = ['admin-users'] as const;

export function useAdminUsers() {
  return useQuery({
    queryKey: adminUsersKey,
    queryFn: async () => (await callAdminUsers<{ users: AdminUser[] }>({ action: 'list' })).users,
  });
}

export function useAdminAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AdminAction) => callAdminUsers<{ ok?: boolean; id?: string }>(body),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminUsersKey }),
        queryClient.invalidateQueries({ queryKey: profileKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['me'] }),
      ]);
    },
  });
}
