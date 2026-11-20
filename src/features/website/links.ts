/**
 * The website inside the app (view.html, team only: docs/PLAN.md §11). `path` is a page: "" for home,
 * "auti/<name>/" for a car. It sits next to the app, so it's the app's address plus "view.html#/…".
 */
export function websiteHref(path = ''): string {
  return `${import.meta.env.BASE_URL}view.html#/${path}`;
}
