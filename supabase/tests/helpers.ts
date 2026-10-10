import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/lib/database.types';

export type Client = SupabaseClient<Database>;

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (run against a local Supabase, see .github/workflows/ci.yml)`);
  return value;
}

export const url = env('SUPABASE_URL');
const publishableKey = env('SUPABASE_PUBLISHABLE_KEY');
const secretKey = env('SUPABASE_SECRET_KEY');

if (!/127\.0\.0\.1|localhost/.test(url)) {
  throw new Error(`Refusing to run destructive permission tests against ${url}: use a local Supabase.`);
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

/** Bypasses RLS: only for test setup and for checking what really happened. */
export const service: Client = createClient<Database>(url, secretKey, noSession);

export function anonClient(): Client {
  return createClient<Database>(url, publishableKey, noSession);
}

export const PASSWORD = 'correct-horse-battery-9';
const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function testEmail(name: string) {
  return `${name}-${runId}@test.local`;
}

export async function createAuthUser(email: string): Promise<string> {
  const { data, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  return data.user.id;
}

export async function signIn(email: string, password = PASSWORD): Promise<Client> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

/** Calls the admin-users Edge Function and returns the HTTP status and JSON body. */
export async function adminUsers(client: Client, body: unknown): Promise<{ status: number; body: any }> {
  const { data: session } = await client.auth.getSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json', apikey: publishableKey };
  if (session.session) headers.Authorization = `Bearer ${session.session.access_token}`;
  const res = await fetch(`${url}/functions/v1/admin-users`, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {
    // keep text
  }
  return { status: res.status, body: json };
}

export const APP_TABLES = ['profiles', 'accounts', 'settings', 'activity_log'] as const;
