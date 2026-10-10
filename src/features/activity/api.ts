import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/** The latest things that happened in the workshop. */
export function useActivity(limit = 20) {
  return useQuery({
    queryKey: ['activity', limit],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('activity_log').select('*').order('at', { ascending: false }).limit(limit);
      if (error) throw error;
      return data;
    },
  });
}

export function activityLink(entityType: string, entityId: string | null): string | null {
  if (!entityId) return null;
  switch (entityType) {
    case 'car':
      return `/cars/${entityId}`;
    case 'job':
      return `/jobs/${entityId}`;
    case 'item':
      return `/stock/${entityId}`;
    case 'transaction':
      return '/money';
    default:
      return null;
  }
}
