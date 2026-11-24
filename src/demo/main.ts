// The app with made-up data, for trying it out: `npm run dev`, then /app/demo.html. Nobody is signed in, nothing
// leaves this computer and nothing is saved: every call to the database is answered here. Only the manuals' index is
// real (scripts/manuals-dev.ts). Never part of the build.
import { DEMO_TABLES, DEMO_USER } from './data';

// the sign-in is kept in memory, apart from a real one in this browser
const memory = new Map<string, string>();
const mine = (key: string) => key.startsWith('sb-');
const { getItem, setItem, removeItem } = Storage.prototype;
Storage.prototype.getItem = function (key) {
  return mine(key) ? (memory.get(key) ?? null) : getItem.call(this, key);
};
Storage.prototype.setItem = function (key, value) {
  if (mine(key)) memory.set(key, value);
  else setItem.call(this, key, value);
};
Storage.prototype.removeItem = function (key) {
  if (mine(key)) memory.delete(key);
  else removeItem.call(this, key);
};
Reflect.deleteProperty(window, 'BroadcastChannel');

const host = new URL(import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321').hostname;
const part = (value: unknown) => btoa(JSON.stringify(value)).replace(/=+$/, '');
const expires = Math.floor(Date.now() / 1000) + 365 * 86_400;
memory.set(
  `sb-${host.split('.')[0]}-auth-token`,
  JSON.stringify({
    access_token: `${part({ alg: 'none' })}.${part({ sub: DEMO_USER.id, exp: expires })}.demo`,
    refresh_token: 'demo',
    token_type: 'bearer',
    expires_in: 365 * 86_400,
    expires_at: expires,
    user: { ...DEMO_USER, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
  }),
);

const realFetch = window.fetch.bind(window);
const answer = (body: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

window.fetch = async (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (url.origin === window.location.origin) return realFetch(input, init);
  if (url.hostname !== host) return answer({ message: 'Not in the demo' }, 404);

  const table = /\/rest\/v1\/([a-z_]+)$/.exec(url.pathname)?.[1];
  if (!table) return url.pathname.includes('/files/sign') ? answer({ links: {} }) : answer({ error: 'Not in the demo' }, 400);
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    // choosing a manual works; everything else is only looked at
    if (table !== 'car_manuals') return answer({ message: 'This is a demo: nothing is saved.' }, 400);
    const values = (await request.json()) as Record<string, unknown>;
    const chosen = url.searchParams.get('id')?.replace(/^eq\./, '');
    const row = DEMO_TABLES.car_manuals.find((r) => r.id === chosen);
    if (row) Object.assign(row, values);
    else DEMO_TABLES.car_manuals.push({ id: crypto.randomUUID(), ...values });
    return answer(null, 204);
  }

  let rows = DEMO_TABLES[table] ?? [];
  for (const [column, filter] of url.searchParams) {
    if (filter.startsWith('eq.')) rows = rows.filter((r) => String(r[column]) === filter.slice(3));
    else if (filter.startsWith('gte.')) rows = rows.filter((r) => String(r[column]) >= filter.slice(4));
  }
  const limit = Number(url.searchParams.get('limit') ?? 0);
  if (limit) rows = rows.slice(0, limit);
  if ((request.headers.get('accept') ?? '').includes('vnd.pgrst.object')) return rows[0] ? answer(rows[0]) : answer({ code: 'PGRST116', message: 'none' }, 406);
  return answer(rows);
};

void import('../main');
