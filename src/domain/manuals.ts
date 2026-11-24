// Which repair manual fits a car. The site's manuals are known by names such as "volkswagen_passat_b5",
// "bmw_3_series_e46_320d_m47tu_tour", "citroen_c5_ii_2004_2008", "volvo_v70_2000_factory" or, for cars sold in the
// USA, "volkswagen_golf_gl_l4-19l_dsl_turbo_alh". Cars are matched by make, model, generation, years and engine.
import { fold } from './search';

export interface ManualCar {
  make?: string | null;
  model?: string | null;
  generation?: string | null;
  year?: number | null;
  engine?: string | null;
  fuel?: string | null;
  /** the generation's years, when the car catalogue knows them */
  yearFrom?: number | null;
  yearTo?: number | null;
}

/** exact: this generation · close: this model, check the rest · related: another car with the same technology */
export type ManualFit = 'exact' | 'close' | 'related';

export interface ManualMatch {
  slug: string;
  title: string;
  fit: ManualFit;
  score: number;
}

// ---------------------------------------------------------------------------
// Makes
// ---------------------------------------------------------------------------
const MAKE_PREFIXES: Record<string, string[]> = {
  'alfa romeo': ['alfa_romeo'],
  abarth: ['fiat'],
  'aston martin': ['aston_martin'],
  citroen: ['citroen'],
  cupra: ['seat'],
  ds: ['citroen'],
  'land rover': ['landrover', 'land_rover'],
  'mercedes-benz': ['mercedes_benz'],
  mercedes: ['mercedes_benz'],
  nissan: ['nissan', 'nissan-datsun_truck', 'nissan-datsun'],
  opel: ['vauxhall'],
  peugeot: ['peugeot', 'citroen'],
  vw: ['volkswagen'],
};

/** What the names of this make's manuals start with. Opel is in the list as Vauxhall. */
export function manualPrefixes(make: string | null | undefined): string[] {
  const name = fold((make ?? '').trim());
  if (!name) return [];
  return MAKE_PREFIXES[name] ?? [name.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')].filter(Boolean);
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------
const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8 };
const WORDS: Record<string, string> = {
  bmw: 'BMW',
  vw: 'VW',
  mg: 'MG',
  mini: 'Mini',
  sal: 'saloon',
  tour: 'Touring',
  conver: 'convertible',
  comp: 'compact',
  roadst: 'roadster',
  dsl: 'diesel',
  sohc: 'SOHC',
  dohc: 'DOHC',
  fwd: 'FWD',
  awd: 'AWD',
  '4wd': '4WD',
  '2wd': '2WD',
  nms: '(USA)',
  factory: '',
  vauxhall: 'Opel/Vauxhall',
  citroen: 'Citroën',
  skoda: 'Škoda',
  landrover: 'Land Rover',
};

/** A manual's name for people, until the manual is opened and its own title is known. */
export function manualTitle(slug: string): string {
  const out: string[] = [];
  const tokens = slug.split('_').filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const years = yearSpan(tokens, i);
    if (years) {
      out.push(years.to ? `(${years.from}–${years.to})` : `(${years.from}–)`);
      i += years.used - 1;
      continue;
    }
    const mk = /^mk(\d)$/.exec(t);
    const engine = /^([lvwhf]\d)-(\d)(\d)l$/.exec(t);
    if (mk) out.push(`Mk${mk[1]}`);
    else if (engine) out.push(`${engine[1].toUpperCase()} ${engine[2]}.${engine[3]}`);
    else if (t in WORDS) out.push(WORDS[t]);
    else if (t in ROMAN && i > 1) out.push(t.toUpperCase());
    else if (/\d/.test(t) && t.length <= 6) out.push(/^\d+(d|i|td|tds|ti|is|ci|xi|xd|da|ia)$/.test(t) ? t : t.toUpperCase());
    else if (t.length === 1) out.push(t.toUpperCase());
    else out.push(t[0].toUpperCase() + t.slice(1));
  }
  return out.filter(Boolean).join(' ');
}

interface YearSpan {
  from: number;
  to: number | null;
  /** how many tokens it takes */
  used: number;
}

/**
 * The years in a name at this token: "2004_2008"; "2001_factory" (from that year); "200475_072004" and
 * "1999_081998122004" (Ford: model year, then MMYYYY from and perhaps to); "2007".
 */
function yearSpan(tokens: readonly string[], i: number): YearSpan | null {
  const t = tokens[i];
  const next = tokens[i + 1];
  const isYear = (s: string | undefined) => Boolean(s && /^(19[5-9]\d|20[0-3]\d)$/.test(s));
  const monthYears = next && /^(\d{2})((?:19|20)\d{2})(?:(\d{2})((?:19|20)\d{2}))?$/.exec(next);
  if (monthYears && /^(19|20)\d{2}\d{0,2}$/.test(t)) {
    return { from: Number(monthYears[2]), to: monthYears[4] ? Number(monthYears[4]) : null, used: 2 };
  }
  if (!isYear(t) || i < 2) return null;
  if (isYear(next)) return { from: Number(t), to: Number(next), used: 2 };
  return { from: Number(t), to: null, used: 1 };
}

// ---------------------------------------------------------------------------
// Cars whose manual has another name, or that share their technology with another car
// ---------------------------------------------------------------------------
interface Alias {
  /** matches the folded generation (missing: every generation) */
  gen?: RegExp;
  slugs: string[];
  fit: ManualFit;
}

const same = (slugs: string | string[], gen?: RegExp): Alias => ({ gen, slugs: [slugs].flat(), fit: 'exact' });
const like = (slugs: string | string[], gen?: RegExp): Alias => ({ gen, slugs: [slugs].flat(), fit: 'related' });

const ALIASES: Record<string, Alias[]> = {
  'volkswagen|passat': [same('volkswagen_passat_b3', /^b4/), same('volkswagen_passat_b5', /^b5/)],
  'volkswagen|passat cc': [same('volkswagen_cc_357')],
  'volkswagen|cc': [same('volkswagen_cc_357')],
  'volkswagen|vento': [same('volkswagen_golf_mk3')],
  'volkswagen|bora': [same('volkswagen_golf_mk4')],
  'volkswagen|jetta': [like('volkswagen_golf_mk2', /^ii\b/)],
  'volkswagen|beetle': [same('volkswagen_beetle_2012', /5c/)],
  'volkswagen|transporter': [same('volkswagen_transporter_t6', /^t6/)],
  'volkswagen|multivan': [like('volkswagen_transporter_t6')],
  'volkswagen|new beetle': [same('volkswagen_new_beetle')],
  'volkswagen|arteon': [like('volkswagen_passat_b8')],
  'audi|a1': [same('audi_a1', /8x/)],
  'audi|a2': [same('audi_a2')],
  'audi|a3': [same('audi_a3_mk1', /8l/), same('audi_a3_mk2', /8p/), same('audi_a3_mk3', /8v/)],
  'audi|a4': [same('audi_a4_mk1', /^b5/), same('audi_a4_mk2', /^b6/), same('audi_a4_mk3', /^b7/), same('audi_a4_mk4', /^b8/)],
  'audi|a5': [same(['audi_a5', 'audi_a5_sportback', 'audi_a5_cabriolet_8f'], /8t/)],
  'audi|q3': [same('audi_q3', /8u/)],
  'audi|q5': [same('audi_q5_mk1', /8r/)],
  'audi|q7': [same('audi_q7_mk1', /4l/), same('audi_q7_mk2', /4m/)],
  'audi|tt': [same('audi_tt_mk1', /8n/), same('audi_tt_mk2', /8j/), same('audi_tt_mk3', /fv/)],
  'skoda|superb': [same('skoda_superb', /^i\b|3u/), same('skoda_superb_ii', /^ii\b|3t/)],
  'skoda|rapid': [same('skoda_rapid')],
  'seat|cordoba': [same('seat_cordoba')],
  'seat|altea': [same('seat_altea')],
  'seat|exeo': [same('seat_exeo'), like('audi_a4_mk3')],
  'cupra|leon': [like('seat_leon_mk3')],
  'opel|zafira': [like('vauxhall_astra_g', /^a/), like('vauxhall_astra_h', /^b/), like('vauxhall_astra_j', /^c/)],
  'opel|meriva': [like('vauxhall_corsa_c', /^a/), like('vauxhall_corsa_d', /^b/)],
  'opel|tigra': [like('vauxhall_corsa_b', /^a/), like('vauxhall_corsa_c', /^b/)],
  'opel|combo': [like('vauxhall_corsa_b', /^b/), like('vauxhall_corsa_c', /^c/)],
  'opel|adam': [like('vauxhall_corsa_d')],
  'opel|corsa': [like('vauxhall_corsa_d', /^e/)],
  'citroen|c4': [same('citroen_c4_2004_2010', /^i\b/), same('citroen_c4_ii_ds4_b7_2010_2018', /^ii\b/)],
  'citroen|c5': [same(['citroen_c5_ii_2004_2008', 'citroen_c5_2001_2004'], /^i\b/), same('citroen_c5_x7_2008_2017', /^ii\b/)],
  'citroen|c3': [same('citroen_c3_2002_2009', /^i\b/), same('citroen_c3_ii_2009_2016', /^ii\b/), same('citroen_c3_a51_2016_2024', /^iii\b/)],
  'ds|ds4': [same('citroen_c4_ii_ds4_b7_2010_2018', /^i\b/)],
  'peugeot|106': [like('citroen_saxo_1996_2004')],
  'peugeot|107': [like('citroen_c1_2005_2014')],
  'peugeot|1007': [like('citroen_c2_2003_2009')],
  'peugeot|206': [like('citroen_c2_2003_2009')],
  'peugeot|207': [like('citroen_c3_2002_2009')],
  'peugeot|208': [like('citroen_c3_ii_2009_2016', /^i\b/), like('citroen_c3_a51_2016_2024')],
  'peugeot|301': [like('citroen_c_elysee_2012_2020')],
  'peugeot|306': [like('citroen_xsara_1997_2000')],
  'peugeot|307': [like('citroen_c4_2004_2010')],
  'peugeot|308': [like('citroen_c4_2004_2010', /^i\b/), like('citroen_c4_picasso_b78_2013_2018', /^ii\b/)],
  'peugeot|3008': [like('citroen_c4_picasso_2006_2013', /^i\b/)],
  'peugeot|5008': [like('citroen_c4_picasso_2006_2013', /^i\b/)],
  'peugeot|406': [like('citroen_xantia_ii_1998_2001')],
  'peugeot|407': [like('citroen_c5_x7_2008_2017')],
  'peugeot|508': [like('citroen_c5_x7_2008_2017', /^i\b/)],
  'peugeot|607': [like('citroen_c5_2001_2004')],
  'peugeot|807': [like('citroen_c8_2002_2014')],
  'peugeot|partner': [
    like(['citroen_berlingo_m59_multispace_2002_2008', 'citroen_berlingo_1996_2002', 'citroen_berlingo_m59_van_2002_2011'], /^i\b/),
    like(['citroen_berlingo_b9_multispace_2008_2018', 'citroen_berlingo_b9_van_2008_2018'], /^ii\b/),
  ],
  'peugeot|expert': [like('citroen_jumpy_i_ii_1996_2006', /^i\b/), like('citroen_jumpy_iii_2007_2016', /^ii\b/)],
  'peugeot|boxer': [like(['citroen_jumper_ii_2002_2006', 'citroen_jumper_1994_2002'], /^i\b/), like('citroen_jumper_iii_2006_2017', /^ii\b/)],
  'fiat|fiorino': [like('citroen_nemo_van_2008_2017')],
  'fiat|punto': [same('fiat_punto_1993_1999', /^i\b/), same('fiat_grande_punto', /^iii\b/)],
  'fiat|bravo': [same('fiat_bravo_brava_1995_2001', /^i\b/), same('fiat_bravo_2007', /^ii\b/)],
  'fiat|panda': [same('fiat_panda_1986_2003', /^i\b/), same('fiat_panda', /^ii\b/)],
  'fiat|500': [same('fiat_500', /312/)],
  'fiat|doblo': [same('fiat_doblo', /^i\b/)],
  'fiat|ducato': [same('fiat_ducato_2002', /^ii\b/), same('fiat_ducato_2006', /^iii\b/)],
  'abarth|500': [like('fiat_500')],
  'abarth|punto': [like('fiat_grande_punto')],
  'alfa romeo|145/146': [same(['alfa_romeo_145_146', 'alfa_romeo_145_146_engines', 'alfa_romeo_145_146_electrical'])],
  'alfa romeo|gt': [same('alfa_romeo_gt')],
  'alfa romeo|147': [same(['alfa_romeo_147', 'alfa_romeo_147_2000_2004'])],
  'ford|escort': [same('ford_escortorion_1991_081990092001')],
  'ford|c-max': [same('ford_cmax_200375_062003', /^i\b/)],
  'ford|s-max': [same('ford_smaxgalaxy_20065_032006', /^i\b/)],
  'ford|galaxy': [same('ford_galaxy_200075_042000022006', /^i\b/), same('ford_smaxgalaxy_20065_032006', /^ii\b/)],
  'ford|transit connect': [same('ford_transittourneo_connect_20025_062002', /^i\b/)],
  'ford|mondeo': [
    same(['ford_mondeo_1997_081996092000', 'ford_mondeo_1993_011993071996'], /^i\/ii|^i\b/),
    same('ford_mondeo_2001_102000022007', /^iii\b/),
    same('ford_mondeo_20075_022007', /^iv\b/),
  ],
  'ford|fusion': [same('ford_fusion_200275_062002', /ju/)],
  'land rover|discovery': [same('landrover_discovery_ii', /^ii\b/), same('landrover_lr3', /^3/)],
  'land rover|range rover': [same(['landrover_l322_a', 'landrover_l322_b'], /l322/), same('landrover_p38', /p38/)],
};

/** BMW generations that cover several body codes, and the series the site files them under. */
const BMW_CODES: Record<string, string[]> = {
  e87: ['e87', 'e81', 'e82', 'e88'],
  e90: ['e90', 'e91', 'e92', 'e93'],
  e60: ['e60', 'e61'],
  e65: ['e65', 'e66'],
  e63: ['e63', 'e64'],
  e85: ['e85', 'e86'],
};

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------
/** "Golf Plus" → its tokens must be what the name starts with (in any split): the rest of the tokens, or null. */
function afterModel(tokens: readonly string[], model: string): string[] | null {
  const want = fold(model).replace(/[^a-z0-9]/g, '');
  if (!want) return null;
  let built = '';
  for (let i = 0; i < tokens.length; i++) {
    built += tokens[i].replace(/[^a-z0-9]/g, '');
    if (built === want) return tokens.slice(i + 1);
    if (!want.startsWith(built)) return null;
  }
  return null;
}

interface Wanted {
  genTokens: Set<string>;
  genNumber: number | null;
  from: number | null;
  to: number | null;
  year: number | null;
  displacement: number | null;
  diesel: boolean | null;
  engineWord: string | null;
}

function wanted(car: ManualCar): Wanted {
  const gen = fold(car.generation ?? '');
  const genTokens = new Set(gen.split(/[^a-z0-9.]+/).filter(Boolean));
  for (const t of [...genTokens]) {
    if (t.includes('.')) genTokens.add(t.split('.')[0]); // B5.5 → B5
    for (const code of BMW_CODES[t] ?? []) genTokens.add(code);
    const chassis = /^[wscvrx](\d{3})$/.exec(t); // W203
    if (chassis) genTokens.add(chassis[1]);
  }
  const first = gen.split(/[^a-z0-9]+/)[0];
  const genNumber = ROMAN[first] ?? null;
  if (genNumber) genTokens.add(`mk${genNumber}`);
  const engine = engineOf(car);
  return {
    genTokens,
    genNumber,
    from: car.yearFrom ?? null,
    to: car.yearTo ?? null,
    year: car.year ?? null,
    displacement: engine.displacement,
    diesel: engine.diesel,
    engineWord: /^\s*([a-z]{0,2}\d{3}[a-z]{0,3}|m\d)\b/i.exec(car.engine ?? '')?.[1].toLowerCase() ?? null,
  };
}

/** Tokens that say which version of a model a manual is for. */
const VERSION = /^(mk\d|[a-z]|[a-z]\d{1,3}|\d[a-z]{1,2}|i{1,3}|iv|v|vi{1,3}|t\d)$/;
const OTHER_MARKETS = new Set(['india', 'brazil', 'russia', 'vivo', 'kombi', 'nms', 'mexico']);
const EXTRAS = new Set(['circuit', 'diagrams', 'electrical', 'library', 'technical', 'bulletins', 'supplement', 'body', 'repair', 'workbook', 'etm']);

/** A car's fit with the tokens left after the model's name; null when it is certainly another version. */
function scoreRest(rest: readonly string[], w: Wanted): { score: number; fit: ManualFit; sure: boolean } | null {
  let score = 0;
  // the generation or the years say it's this version
  let sure = false;
  let usMarket = false;
  const hasYears = rest.some((_, i) => yearSpan(['', '', ...rest], i + 2)?.to);
  for (let i = 0; i < rest.length; i++) {
    const t = rest[i];
    const span = yearSpan(['', '', ...rest], i + 2);
    const usEngine = /^([lvwhf]\d{1,2})-(\d)(\d)l$/.exec(t) ?? /^([lvwhf]\d{1,2})-(\d)\d{3}cc$/.exec(t);
    if (span) {
      i += span.used - 1;
      const fits = yearsFit(span, w);
      if (fits === null) continue;
      if (fits <= 0) return null;
      if (fits > 0.4) sure = true;
      score += 40 * fits;
    } else if (!hasYears && (w.genTokens.has(t) || (/^\d{6}$/.test(t) && w.genTokens.has(t.slice(0, 3))))) {
      sure = true;
      score += 40;
    } else if (w.engineWord && t === w.engineWord) {
      score += 30;
    } else if (usEngine) {
      usMarket = true;
      const litres = usEngine[3] ? Number(`${usEngine[2]}.${usEngine[3]}`) : null;
      if (litres !== null && w.displacement !== null) score += litres === w.displacement ? 15 : -10;
      if (w.diesel !== null) score += rest.includes('dsl') === w.diesel ? 10 : -15;
    } else if (VERSION.test(t) && !usMarket && i === 0) {
      // another generation of the same model (unless it has years: those decide)
      if (hasYears) continue;
      if (w.genTokens.size > 0) return null;
      score -= 5;
    } else if (OTHER_MARKETS.has(t)) {
      score -= 25;
    } else if (EXTRAS.has(t)) {
      score -= 8;
    } else if (t === 'sal' || t === '5door') {
      score += 2;
    } else if (/^m\d$/.test(t)) {
      score -= 12; // an M3 isn't what "3 Series" usually means
    } else if (t !== 'factory') {
      score -= i === 0 ? 12 : 4; // a word about another model, body or trim
    }
  }
  if (usMarket) score -= 15;
  if (rest.length === 0) {
    // "skoda_yeti": one manual for the model. Fine unless the car is a later generation.
    if (w.genNumber !== null && w.genNumber > 1) return { score: 5, fit: 'close', sure: false };
    return { score: 35, fit: 'exact', sure: false };
  }
  return { score, fit: sure && !usMarket ? 'exact' : 'close', sure };
}

/** How well a manual's years fit the car: 1 best, 0 not at all, null when the car's years aren't known. */
function yearsFit(span: YearSpan, w: Wanted): number | null {
  if (span.to === null) {
    // "from 2001": the generation that started then; with only the car's year, the newest one started by then
    if (w.from !== null) return Math.abs(span.from - w.from) <= 1 ? 1 : 0;
    if (w.year === null) return null;
    return span.from <= w.year ? Math.max(0, 0.4 - (w.year - span.from) / 40) : 0;
  }
  if (w.year !== null) return w.year >= span.from && w.year <= span.to ? 1 : w.year === span.from - 1 || w.year === span.to + 1 ? 0.3 : 0;
  if (w.from === null) return null;
  const to = w.to ?? new Date().getFullYear();
  const overlap = Math.min(to, span.to) - Math.max(w.from, span.from) + 1;
  if (overlap <= 1) return 0;
  return overlap / Math.max(to - w.from + 1, span.to - span.from + 1);
}

/** The manuals that could be this car's, best first. `slugs`: the names that start with the make's prefixes. */
export function findManuals(car: ManualCar, slugs: readonly string[], limit = 12): ManualMatch[] {
  const make = fold((car.make ?? '').trim());
  const model = fold((car.model ?? '').trim());
  if (!make || !model) return [];
  const gen = fold((car.generation ?? '').trim());
  const w = wanted(car);
  const found = new Map<string, ManualMatch>();
  const add = (slug: string, fit: ManualFit, score: number) => {
    const old = found.get(slug);
    if (!old || old.score < score) found.set(slug, { slug, title: manualTitle(slug), fit, score });
  };

  const have = new Set(slugs);
  const aliases = ALIASES[`${make}|${model}`] ?? [];
  aliases.forEach((alias, order) => {
    if (alias.gen && gen && !alias.gen.test(gen)) return;
    alias.slugs.forEach((slug, i) => {
      if (!have.has(slug)) return;
      const sure = alias.fit === 'exact' && (!alias.gen || gen !== '');
      let score = (alias.fit === 'exact' ? (sure ? 60 : 25) : 30) - order - i;
      // several manuals for one generation: the car's year decides
      const tokens = slug.split('_');
      const span = tokens.map((_, k) => yearSpan(tokens, k)).find(Boolean);
      if (span?.to && w.year !== null) score += w.year >= span.from && w.year <= span.to ? 10 : -10;
      add(slug, alias.fit === 'related' ? 'related' : sure ? 'exact' : 'close', score);
    });
  });

  const series = /^([a-z])\d$/.exec(model); // BMW X5 and Z4 are filed under "x_series" and "z_series"
  const models = make === 'bmw' && series ? [model, `${series[1]} series`] : [model.replace(/-?\s*class$/, ''), model];
  const prefixes = manualPrefixes(car.make);
  const candidates: { slug: string; rest: string[] }[] = [];
  for (const slug of slugs) {
    const prefix = prefixes.find((p) => slug.startsWith(`${p}_`));
    // Peugeot's twins come from the list above, never from Citroën's names
    if (!prefix || (make === 'peugeot' && prefix === 'citroen')) continue;
    const tokens = slug.slice(prefix.length + 1).split('_').filter(Boolean);
    for (const m of models) {
      const rest = afterModel(tokens, m);
      if (!rest) continue;
      candidates.push({ slug, rest });
      break;
    }
  }
  // "vauxhall_astra" next to "vauxhall_astra_h": nobody knows which Astra the first one is. The same when the
  // list above knows this model's generations and the car's isn't among them.
  const versioned = candidates.some((c) => c.rest.length > 0 && VERSION.test(c.rest[0]));
  const otherGeneration = gen !== '' && aliases.length > 0 && aliases.every((a) => a.gen && !a.gen.test(gen));
  for (const { slug, rest } of candidates) {
    const result = scoreRest(rest, w);
    if (!result) continue;
    if (!result.sure && (otherGeneration || (rest.length === 0 && versioned))) add(slug, 'close', Math.min(result.score, 0));
    else add(slug, result.fit, 10 + result.score);
  }
  return [...found.values()].sort((a, b) => b.score - a.score || a.slug.length - b.slug.length || a.slug.localeCompare(b.slug)).slice(0, limit);
}

/** The manual to show without asking, if one is good enough. */
export function bestManual(matches: readonly ManualMatch[]): ManualMatch | null {
  const best = matches[0];
  return best && best.score >= 15 ? best : null;
}

// ---------------------------------------------------------------------------
// The car's engine, from texts like "1.9 TDI 96 kW (130 HP)"
// ---------------------------------------------------------------------------
export interface EngineInfo {
  displacement: number | null;
  kw: number | null;
  diesel: boolean | null;
  cylinders: number | null;
  /** valves per cylinder: 5 for 1.8 T and 20V, 4 for 16V */
  valves: number | null;
  /** how the diesel injects: VW's unit injector (PD), a distributor pump, common rail */
  injection: 'unit' | 'pump' | 'rail' | null;
}

export function engineOf(car: Pick<ManualCar, 'engine' | 'fuel' | 'make' | 'year' | 'yearFrom' | 'generation'>): EngineInfo {
  const text = fold(car.engine ?? '');
  const fuel = fold(car.fuel ?? '');
  const displacement = /(?:^|[^\d.])(\d)[.,](\d)(?!\d)/.exec(text);
  const litres = displacement ? Number(`${displacement[1]}.${displacement[2]}`) : null;
  const kw = /(\d{2,3})\s*kw/.exec(text);
  const power = kw ? Number(kw[1]) : null;
  const dieselWord = /\b(tdi|sdi|hdi|bluehdi|cdti|dti|cdi|dci|jtdm?|multijet|crdi|d-?4d|tdci|td|di-?d|dtec|bitdi|d5|d3|d4)\b|\d{3}x?d\b|\bd\b|diesel|ecoblue|bluetec/.test(text);
  const diesel = fuel ? /diesel|dizel/.test(fuel) : text ? dieselWord : null;

  const layout = /\b(vr5|v5|r5)\b/.test(text) ? 5 : /\b(vr6|v6|r6)\b/.test(text) ? 6 : /\b(v8|w8)\b/.test(text) ? 8 : /\bv10\b/.test(text) ? 10 : /\bw12\b|\bv12\b/.test(text) ? 12 : null;
  const cylinders = layout ?? (litres === null ? null : litres >= 1.3 && litres <= 2.3 ? 4 : null);

  const vag = /^(volkswagen|vw|audi|seat|skoda|cupra)$/.test(fold(car.make ?? ''));
  let valves: number | null = null;
  if (/20v|1\.8\s*t\b/.test(text)) valves = 5;
  else if (/16v|30v/.test(text)) valves = /30v/.test(text) ? 5 : 4;

  let injection: EngineInfo['injection'] = null;
  if (diesel && vag) {
    const from = car.year ?? car.yearFrom ?? null;
    if (litres === 1.9 && /sdi/.test(text)) injection = 'pump';
    // 66 and 81 kW had a distributor pump, until the Golf V's 66 kW; every other 1.9 TDI is PD
    else if (litres === 1.9) injection = (power === 66 || power === 81) && (from === null || from < 2003) ? 'pump' : 'unit';
    else if (litres === 1.6) injection = 'rail';
    else if (litres === 2.0 && from !== null) injection = from >= 2009 ? 'rail' : from < 2007 ? 'unit' : null;
  }
  return { displacement: litres, kw: power, diesel, cylinders, valves, injection };
}
