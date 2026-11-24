// Reading the index that workshop-manuals.com publishes for crawlers (robots.txt allows every crawler, 14.10.2026):
//   /sitemap.xml            one sitemap per manual: the list of manuals
//   /sitemap-<manual>.xml   every page of one manual, in the manual's order
//   /…/fullindex/           the manual's chapters (title, kind, first page)
// Only titles and addresses are kept. The pages themselves are read on the site.

export const SITE = 'https://workshop-manuals.com';

/** A manual's name in the site's list, e.g. "volkswagen_passat_b5". */
export const SLUG = /^[a-z0-9][a-z0-9_.,()&+-]{1,150}$/;

export const CHAPTER_KINDS = ['eng', 'trans', 'steer', 'brake', 'hvac', 'diag', 'elec', 'body', 'maint', 'gen'] as const;
export type ChapterKind = (typeof CHAPTER_KINDS)[number];

export interface ManualChapter {
  title: string;
  kind: ChapterKind;
  /** index of the chapter's first page in `pages`; it runs until the next chapter's start */
  start: number;
}

export interface ManualIndex {
  slug: string;
  /** "Volkswagen Passat B5 (1996-2005)" */
  title: string;
  /** what every page's address starts with, e.g. "https://workshop-manuals.com/volkswagen/passat-b5/" */
  base: string;
  chapters: ManualChapter[];
  /** the rest of every page's address, e.g. "brake_systems/repairing_handbrake/adjusting_handbrake" */
  pages: string[];
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', euml: 'ë', eacute: 'é', scaron: 'š' };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

const plain = (html: string) => decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

function locations(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => decodeEntities(m[1]));
}

/** The manuals the site has, from its list of sitemaps. */
export function parseManualList(xml: string): string[] {
  const slugs = locations(xml)
    .map((url) => /\/sitemap-(.+)\.xml$/.exec(url)?.[1] ?? '')
    .filter((slug) => slug !== 'core' && SLUG.test(slug));
  return [...new Set(slugs)].sort();
}

/** Where the manual's chapter list is, from its sitemap. */
export function indexUrl(sitemapXml: string): string | null {
  return locations(sitemapXml).find((url) => url.startsWith(`${SITE}/`) && url.endsWith('/fullindex/')) ?? null;
}

export class UnreadableManual extends Error {}

export function parseManual(slug: string, sitemapXml: string, indexHtml: string): ManualIndex {
  const index = indexUrl(sitemapXml);
  if (!index) throw new UnreadableManual('The manual has no chapter list');
  const indexBase = index.slice(0, -'fullindex/'.length);
  const below = (url: string) => (url.toLowerCase().startsWith(indexBase.toLowerCase()) ? url.slice(indexBase.length) : null);

  // the pages' own spelling of the base (BMW: "3_Series_E46" in the list's address, "3_series_e46" in the pages')
  let base = indexBase;
  const pages: string[] = [];
  for (const url of locations(sitemapXml)) {
    const rest = below(url)?.replace(/\/+$/, '');
    if (!rest || rest === 'fullindex' || rest.startsWith('fullindex/')) continue;
    if (pages.length === 0) base = url.slice(0, indexBase.length);
    pages.push(rest);
  }
  if (pages.length === 0) throw new UnreadableManual('The manual has no pages');

  // chapters: <li class="g-eng"><a href="first page"><i></i><b>07</b><span>Title</span></a></li>
  const position = new Map(pages.map((p, i) => [p.toLowerCase(), i]));
  const chapters: ManualChapter[] = [];
  for (const m of indexHtml.matchAll(/<li class="g-([a-z]+)">\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const path = below(new URL(decodeEntities(m[2]), SITE).href);
    const start = path === null ? undefined : position.get(decodeURI(path).replace(/\/+$/, '').toLowerCase()) ?? position.get(path.replace(/\/+$/, '').toLowerCase());
    const title = plain(/<span[^>]*>([\s\S]*?)<\/span>/.exec(m[3])?.[1] ?? '');
    if (start === undefined || !title || chapters.some((c) => c.start === start)) continue;
    const kind = (CHAPTER_KINDS as readonly string[]).includes(m[1]) ? (m[1] as ChapterKind) : 'gen';
    chapters.push({ title, kind, start });
  }
  chapters.sort((a, b) => a.start - b.start);
  if (chapters.length === 0 || chapters[0].start > 0) chapters.unshift({ title: 'General', kind: 'gen', start: 0 });

  const make = plain(/<nav class="crumbs"[\s\S]*?<a [^>]*>([\s\S]*?)<\/a>/.exec(indexHtml)?.[1] ?? '');
  const name = plain(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(indexHtml)?.[1] ?? '').replace(/:\s*chapter index$/i, '');
  const title = [name.toLowerCase().startsWith(make.toLowerCase()) ? '' : make, name].filter(Boolean).join(' ') || slug.replaceAll('_', ' ');
  return { slug, title, base, chapters, pages };
}
