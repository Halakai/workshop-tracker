// Customer keys (docs/PLAN.md §11): codes like K7M4QX9P, shown as K7M4-QX9P, and the link that opens one.
// A customer's phone remembers the codes it opened, so the page comes back when they open the app's address again.

/** What people type ("k7m4 qx9p", "K7M4-QX9P") → "K7M4QX9P" */
export function normalizeKeyCode(text: string): string {
  return text.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/** "K7M4QX9P" → "K7M4-QX9P" (easier to read out) */
export function formatKeyCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

/** The link to send: the main address with the code, which forwards to the customer's page. */
export function keyLink(code: string, origin = window.location.origin): string {
  return `${origin}${import.meta.env.BASE_URL.replace(/app\/$/, '')}?k=${formatKeyCode(code)}`;
}

/** The customer's page inside the app (also how the team sees what the customer sees). */
export function keyPageHref(code: string): string {
  return `${import.meta.env.BASE_URL}view.html#/k/${code}/`;
}

const STORAGE = 'workshop-customer-keys';

export function rememberedKeys(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE) ?? '[]');
    return Array.isArray(list) ? list.filter((c): c is string => typeof c === 'string') : [];
  } catch {
    return [];
  }
}

/** Most recent first, up to 10. */
export function rememberKey(code: string) {
  try {
    localStorage.setItem(STORAGE, JSON.stringify([code, ...rememberedKeys().filter((c) => c !== code)].slice(0, 10)));
  } catch {
    // private mode: the link still works, it just isn't remembered
  }
}
