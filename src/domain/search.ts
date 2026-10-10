// One search box for everything (cars, jobs, inventory, contacts, money entries).
// Matching ignores case and accents (skoda finds Škoda) and, for codes such as car IDs, plates, VINs and
// part numbers, also spaces and dashes (zg123ab finds ZG 123-AB). Every word typed must match somewhere.

const FOLD: Record<string, string> = { đ: 'd', ß: 'ss', ø: 'o', æ: 'ae', ł: 'l' };

/** "Škoda Đurđevac" → "skoda durdevac" */
export function fold(text: string): string {
  return text
    .toLowerCase()
    .replace(/[đßøæł]/g, (c) => FOLD[c])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** "ZG 123-AB" → "zg123ab" */
export function compact(text: string): string {
  return fold(text).replace(/[^a-z0-9]/g, '');
}

export interface SearchDoc {
  /** e.g. "car:<uuid>": unique across kinds */
  key: string;
  title: string;
  /** codes typed without spaces: refs, plates, VINs, part numbers, invoice numbers */
  codes: (string | null | undefined)[];
  /** everything else worth finding: names, descriptions, notes */
  text: (string | null | undefined)[];
}

interface Prepared {
  title: string;
  titleWords: string[];
  codes: string[];
  text: string;
}

function prepare(doc: SearchDoc): Prepared {
  const title = fold(doc.title);
  return {
    title,
    titleWords: title.split(/[^a-z0-9]+/).filter(Boolean),
    codes: doc.codes.filter((c): c is string => Boolean(c)).map(compact),
    text: [title, ...doc.text.filter((t): t is string => Boolean(t)).map(fold)].join(' \n '),
  };
}

/** 0 = no match; higher is better. */
export function scoreDoc(query: string, doc: SearchDoc): number {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  const p = prepare(doc);
  const whole = compact(query);
  let score = 0;
  if (whole && p.codes.includes(whole)) score += 100;
  else if (whole.length >= 2 && p.codes.some((c) => c.startsWith(whole))) score += 60;
  for (const word of words) {
    const w = compact(word);
    const inCodes = w !== '' && p.codes.some((c) => c.includes(w));
    if (p.titleWords.some((t) => t.startsWith(word) || (w && t.startsWith(w)))) score += 10;
    else if (p.title.includes(word)) score += 6;
    else if (inCodes) score += 5;
    else if (p.text.includes(word)) score += 2;
    else return 0;
  }
  return score;
}

/** Matching docs, best first; equal scores keep their original order (lists come newest first). */
export function search<T extends SearchDoc>(query: string, docs: readonly T[], limit = Infinity): T[] {
  if (!query.trim()) return [];
  return docs
    .map((doc, index) => ({ doc, index, score: scoreDoc(query, doc) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((r) => r.doc);
}
