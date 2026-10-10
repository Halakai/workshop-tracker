import { FunctionsHttpError } from '@supabase/supabase-js';

/** Turns Supabase / Edge Function / network errors into a sentence a person can act on. */
export async function errorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      // fall through
    }
    return `Server error (${error.context.status})`;
  }
  return syncErrorMessage(error);
}

export function syncErrorMessage(error: unknown): string {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  const e = error as { message?: string; code?: string };
  if (e.code === '42501') return "You don't have permission to do that.";
  if (e.message === 'Failed to fetch' || e.message?.includes('NetworkError')) {
    return 'No connection to the server. Check your internet and try again.';
  }
  if (e.message === 'Invalid login credentials') return 'Wrong email or password.';
  return e.message ?? 'Unknown error';
}
