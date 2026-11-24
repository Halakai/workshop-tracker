// Finding pages in a repair manual's index: by words (English or Croatian), by job (small service, brakes…), and only
// for the car's own engine. The index holds titles and addresses; the pages are read on the manual's site.
import { engineOf, type EngineInfo, type ManualCar } from './manuals';
import { fold } from './search';

export type ChapterKind = 'eng' | 'trans' | 'steer' | 'brake' | 'hvac' | 'diag' | 'elec' | 'body' | 'maint' | 'gen';

/** What the manuals function returns (supabase/functions/manuals/parse.ts). */
export interface ManualIndex {
  slug: string;
  title: string;
  base: string;
  chapters: { title: string; kind: string; start: number }[];
  pages: string[];
}

export interface ManualPage {
  url: string;
  title: string;
  /** the headings above it, below the chapter: "Cylinder head" */
  trail: string[];
  chapter: string;
  kind: ChapterKind;
  /** the engine (or gearbox) this page is only for, if the manual says so */
  engine: string | null;
  gearbox: string | null;
  order: number;
  // prepared for searching
  foldedTitle: string;
  foldedTrail: string;
}

// ---------------------------------------------------------------------------
// Names: "removing_and_installing_oil_sump" → "Removing and installing oil sump"
// ---------------------------------------------------------------------------
const UPPER = new Set(['abs', 'esp', 'asr', 'edl', 'egr', 'tdi', 'sdi', 'tsi', 'fsi', 'tfsi', 'kw', 'ecu', 'dsg', 'atf', 'obd', 'dtc', 'vin', 'can', 'led', 'srs', 'tcs', 'tdc', 'mpi', 'cr', 'pd', 'hvac', 'dohc', 'sohc', 'ac']);

/** `repeated`: the manual has the same heading without the number too ("removing", "removing_2"). */
export function pageTitle(segment: string, repeated = false): string {
  let s = segment;
  try {
    s = decodeURIComponent(segment);
  } catch {
    // a stray % in a name
  }
  const cut = s.length >= 59 && s.length <= 62; // the site cuts long names there
  // order numbers: BMW "4_ra__…", "11__engine", Vauxhall "j__…"
  s = s.replace(/^\d+_[a-z]{2}__/, '').replace(/^(?:\d+|[a-z])__/, '');
  if (repeated) s = s.replace(/_(\d{1,2})$/, ' ($1)');
  s = s.replace(/_{3,}/g, ' / ').replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
  s = s
    .split(' ')
    .map((w) => (UPPER.has(w) ? w.toUpperCase() : w))
    .join(' ');
  if (!s) return segment;
  return s[0].toUpperCase() + s.slice(1) + (cut ? '…' : '');
}

// ---------------------------------------------------------------------------
// Engines: many manuals have a part for each engine. A page knows which one it is in.
// ---------------------------------------------------------------------------
const ENGINE_NAME = /\d\s*-?\s*(cyl|zyl)|\bkw\b|(diesel|petrol|injection) engine|motronic|simos|direct injection and (pre)?glow|natural gas/;
/** A part of a name cut in two by the "/" in "1.9/77 kW TDI PD engine". */
const HALF_NAME = /^(engine_)?\d([._]?\d)?$/;

function engineLabel(chapter: { title: string; kind: string }, segments: readonly string[]): string | null {
  const title = chapter.title;
  const isEngine = chapter.kind === 'eng' || /motor|engine/i.test(title);
  if (!isEngine) return null;
  if (ENGINE_NAME.test(fold(title))) return title;
  if (segments.length < 3) return null;
  const second = segments[1];
  const label =
    HALF_NAME.test(second) && segments.length > 3
      ? `${displacementName(second)}/${pageTitle(segments[2])}`
      : pageTitle(second).replace(/^(?:engine )?(\d) (\d) (?=\d{2,3}\b)/i, '$1.$2/');
  return ENGINE_NAME.test(fold(label)) ? label : null;
}

const GEARBOX_NAME = /(?=.*(gearbox|transmission))(?=.*(\d|automatic|manual|direct shift|dual clutch))/;

function gearboxLabel(chapter: { title: string; kind: string }, segments: readonly string[]): string | null {
  if (chapter.kind !== 'trans') return null;
  if (GEARBOX_NAME.test(fold(chapter.title))) return chapter.title;
  const label = segments.length > 2 ? pageTitle(segments[1]) : '';
  return GEARBOX_NAME.test(fold(label)) ? label : null;
}

/** "2.0" stays, "16" → "1.6", "engine_2.0" → "2.0" */
function displacementName(segment: string): string {
  const s = segment.replace(/^engine_/, '').replace('_', '.');
  return /^\d\d$/.test(s) ? `${s[0]}.${s[1]}` : s;
}

/** The manual's pages, ready for searching. */
export function readManual(index: ManualIndex): ManualPage[] {
  const pages: ManualPage[] = [];
  const all = new Set(index.pages);
  const parentOf = (path: string) => path.slice(0, path.lastIndexOf('/') + 1);
  const siblings = new Map<string, number>();
  for (const path of index.pages) siblings.set(parentOf(path), (siblings.get(parentOf(path)) ?? 0) + 1);
  let c = 0;
  index.pages.forEach((path, order) => {
    while (c + 1 < index.chapters.length && index.chapters[c + 1].start <= order) c++;
    const chapter = index.chapters[c];
    const segments = path.split('/').filter(Boolean);
    const title = pageTitle(segments[segments.length - 1] ?? path, all.has(path.replace(/_\d{1,2}$/, '')));
    // VW's maintenance book sits under a gearbox heading in some manuals: hundreds of pages in one section
    const misfiled = chapter.kind === 'trans' && (siblings.get(parentOf(path)) ?? 0) >= 150;
    const engine = misfiled ? null : engineLabel(chapter, segments);
    const gearbox = misfiled ? null : gearboxLabel(chapter, segments);
    const skip = engine && engine !== chapter.title ? (HALF_NAME.test(segments[1]) ? 3 : 2) : gearbox && gearbox !== chapter.title ? 2 : 1;
    const trail: string[] = [];
    if (!misfiled) {
      for (const segment of segments.slice(skip, -1)) {
        const name = pageTitle(segment);
        if (name !== title && name !== trail[trail.length - 1]) trail.push(name);
      }
    }
    pages.push({
      url: `${index.base}${path}/`,
      title,
      trail,
      chapter: misfiled ? 'Maintenance' : chapter.title,
      kind: misfiled ? 'maint' : (chapter.kind as ChapterKind),
      engine,
      gearbox,
      order,
      foldedTitle: fold(title).replace(/[-–]/g, ' '),
      foldedTrail: fold(trail.join(' ')).replace(/[-–]/g, ' '),
    });
  });
  // "Protect": the armoured cars of the police. Nobody looks for those.
  const ordinary = pages.filter((p) => !/\bprotect\b/i.test(p.chapter));
  return ordinary.length > 0 ? ordinary : pages;
}

/** The engines a manual has separate parts for (none: the whole manual is for one engine, or for all alike). */
export function engineParts(pages: readonly ManualPage[]): string[] {
  const names = new Set(pages.map((p) => p.engine).filter((n): n is string => n !== null));
  return names.size >= 2 ? [...names] : [];
}

/** The same for gearboxes. */
export function gearboxParts(pages: readonly ManualPage[]): string[] {
  const names = new Set(pages.map((p) => p.gearbox).filter((n): n is string => n !== null));
  return names.size >= 2 ? [...names] : [];
}

interface PartFeatures {
  cylinders: number | null;
  diesel: boolean | null;
  displacements: number[];
  kws: number[];
  valves: number | null;
  injection: EngineInfo['injection'];
  gas: boolean;
  odd: boolean;
}

function partFeatures(label: string): PartFeatures {
  const t = fold(label);
  const cyl = /(\d{1,2})\s*-?\s*(?:cyl|zyl)/.exec(t);
  const diesel = /diesel|\btdi\b|\bsdi\b|\bpd\b|unit inj|glow|distributor|common rail/.test(t);
  const petrol = !diesel && /injection|fsi|tsi|mpi|motronic|simos|petrol|natural gas/.test(t);
  const valves = /(\d)\s*-?\s*valve/.exec(t);
  const power = /\/\s*((?:\d{2,3}\s*[;,]?\s*)+)kw/.exec(t);
  return {
    cylinders: cyl ? Number(cyl[1]) : null,
    diesel: diesel ? true : petrol ? false : null,
    displacements: [...t.matchAll(/(?:^|[^\d.])(\d)[.,](\d)(?!\d)/g)].map((m) => Number(`${m[1]}.${m[2]}`)),
    kws: power ? [...power[1].matchAll(/\d{2,3}/g)].map((m) => Number(m[0])) : [],
    valves: valves ? Number(valves[1]) : null,
    injection: /unit inj|\bpd\b/.test(t) ? 'unit' : /distributor/.test(t) ? 'pump' : /common rail|\bcr\b/.test(t) ? 'rail' : null,
    gas: /natural gas|lpg|cng/.test(t),
    odd: /mexico|brazil|motronic|simos/.test(t),
  };
}

function scorePart(p: PartFeatures, e: EngineInfo): number {
  let score = 0;
  const compare = <T,>(a: T | null, b: T | null, right: number, wrong: number) => {
    if (a === null || b === null) return;
    score += a === b ? right : -wrong;
  };
  compare(p.diesel, e.diesel, 10, 40);
  compare(p.cylinders, e.cylinders, 4, 20);
  compare(p.valves, e.valves, 8, 6);
  compare(p.injection, e.injection, 10, 12);
  if (p.displacements.length && e.displacement !== null) score += p.displacements.includes(e.displacement) ? 10 : -12;
  if (p.kws.length && e.kw !== null) score += p.kws.includes(e.kw) ? 12 : -10;
  if (e.valves === null && p.valves === 5) score -= 3;
  if (p.gas) score -= 8;
  if (p.odd) score -= 3;
  return score;
}

function rateEngineParts(parts: readonly string[], car: ManualCar): { label: string; score: number }[] {
  const engine = engineOf(car);
  if (engine.displacement === null && engine.kw === null && engine.diesel === null) return [];
  return parts.map((label) => ({ label, score: scorePart(partFeatures(label), engine) })).sort((a, b) => b.score - a.score);
}

/** The likelier engines first. */
export function rankEngineParts(parts: readonly string[], car: ManualCar): string[] {
  const rated = rateEngineParts(parts, car);
  return rated.length > 0 ? rated.map((r) => r.label) : [...parts];
}

/** The engine parts that fit this car (several, when the manual can't tell them apart), or [] when unsure. */
export function guessEngineParts(parts: readonly string[], car: ManualCar): string[] {
  const scored = rateEngineParts(parts, car);
  if (!scored.length || scored[0].score < 10) return [];
  return scored.filter((s) => s.score >= scored[0].score - 2).map((s) => s.label);
}

/**
 * Only the pages for these engines and gearboxes, and everything that isn't about one engine or gearbox.
 * None chosen of either: no limit.
 */
export function forParts(pages: readonly ManualPage[], chosen: readonly string[]): ManualPage[] {
  const keep = new Set(chosen);
  const anyEngine = !pages.some((p) => p.engine !== null && keep.has(p.engine));
  const anyGearbox = !pages.some((p) => p.gearbox !== null && keep.has(p.gearbox));
  return pages.filter(
    (p) => (p.engine === null || anyEngine || keep.has(p.engine)) && (p.gearbox === null || anyGearbox || keep.has(p.gearbox)),
  );
}

// ---------------------------------------------------------------------------
// Searching, in English or Croatian
// ---------------------------------------------------------------------------
/** Beginnings of Croatian workshop words (without accents) → what the manuals call it. */
const CROATIAN: [string, string[]][] = [
  ['prednj', ['front']],
  ['zadnj', ['rear']],
  ['straznj', ['rear']],
  ['lijev', ['left']],
  ['desn', ['right']],
  ['gornj', ['upper', 'top']],
  ['donj', ['lower', 'bottom']],
  ['zupcast', ['toothed', 'timing']],
  ['lanac', ['chain']],
  ['lanca', ['chain']],
  ['remen', ['belt']],
  ['kaise', ['belt']],
  ['zatezac', ['tensioner', 'tensioning']],
  ['spaner', ['tensioner', 'tensioning']],
  ['vodena', ['coolant', 'water']],
  ['vodene', ['coolant', 'water']],
  ['vodenu', ['coolant', 'water']],
  ['pump', ['pump']],
  ['rashladn', ['coolant', 'cooling']],
  ['antifriz', ['coolant']],
  ['hladnjak', ['radiator', 'cooler']],
  ['termostat', ['thermostat']],
  ['ventilator', ['fan', 'blower']],
  ['ulje', ['oil']],
  ['ulja', ['oil']],
  ['uljn', ['oil']],
  ['karter', ['sump', 'oil pan']],
  ['filter', ['filter', 'cleaner']],
  ['filtar', ['filter', 'cleaner']],
  ['filtr', ['filter', 'cleaner']],
  ['zrak', ['air']],
  ['goriv', ['fuel']],
  ['naft', ['fuel', 'diesel']],
  ['peludn', ['pollen', 'cabin']],
  ['pelud', ['pollen', 'cabin']],
  ['kabin', ['pollen', 'cabin']],
  ['svjecic', ['spark plug', 'glow plug']],
  ['grijac', ['glow plug', 'preglow', 'heater']],
  ['kocnic', ['brake']],
  ['kocion', ['brake']],
  ['kocen', ['brak']],
  ['plocic', ['pad', 'lining']],
  ['disk', ['disc', 'disk']],
  ['bubanj', ['drum']],
  ['celjust', ['caliper']],
  ['rucna', ['handbrake', 'parking brake']],
  ['rucn', ['handbrake', 'parking brake', 'manual']],
  ['odzrac', ['bleed']],
  ['kvacil', ['clutch']],
  ['lamel', ['clutch']],
  ['korp', ['clutch']],
  ['zamasnjak', ['flywheel']],
  ['zamasnjac', ['flywheel']],
  ['mjenjac', ['gearbox', 'transmission']],
  ['poluosovin', ['drive shaft', 'axle shaft', 'driveshaft']],
  ['homokinet', ['constant velocity', 'joint', 'cv']],
  ['manzet', ['boot', 'gaiter']],
  ['diferencijal', ['differential', 'final drive']],
  ['kardan', ['propshaft', 'propeller shaft']],
  ['amortizer', ['shock absorber', 'strut', 'damper']],
  ['opruga', ['spring']],
  ['opruge', ['spring']],
  ['ovjes', ['suspension']],
  ['vilic', ['wishbone', 'control arm', 'suspension arm', 'fork']],
  ['rame', ['wishbone', 'control arm', 'suspension arm']],
  ['ramena', ['wishbone', 'control arm', 'suspension arm']],
  ['kugl', ['ball joint', 'joint', 'swivel']],
  ['lezaj', ['bearing']],
  ['glavcin', ['hub']],
  ['stabilizator', ['anti roll', 'stabiliser', 'stabilizer']],
  ['stangic', ['link', 'coupling rod']],
  ['spon', ['track rod', 'tie rod']],
  ['letv', ['steering rack', 'steering gear', 'steering box']],
  ['volan', ['steering']],
  ['upravljac', ['steering', 'control unit']],
  ['servo', ['servo', 'power steering']],
  ['geometrij', ['alignment', 'axle']],
  ['kotac', ['wheel']],
  ['kotaca', ['wheel']],
  ['gum', ['tyre', 'tire', 'rubber']],
  ['motor', ['engine', 'motor']],
  ['glav', ['cylinder head', 'head']],
  ['brtv', ['gasket', 'seal']],
  ['semering', ['oil seal', 'seal']],
  ['radilic', ['crankshaft']],
  ['bregast', ['camshaft']],
  ['ventil', ['valve']],
  ['podizac', ['tappet', 'lifter', 'regulator']],
  ['klip', ['piston']],
  ['klipnjac', ['conrod', 'connecting rod']],
  ['kompresij', ['compression']],
  ['dizn', ['injector', 'nozzle']],
  ['brizgalj', ['injector', 'nozzle']],
  ['turbin', ['turbo']],
  ['turbo', ['turbo']],
  ['interkuler', ['charge air', 'intercooler']],
  ['usis', ['intake']],
  ['ispuh', ['exhaust']],
  ['auspuh', ['exhaust']],
  ['lonac', ['silencer', 'exhaust']],
  ['katalizator', ['catalytic']],
  ['senzor', ['sensor', 'sender']],
  ['osjetnik', ['sensor', 'sender']],
  ['akumulator', ['battery']],
  ['baterij', ['battery']],
  ['alternator', ['alternator', 'generator']],
  ['anlaser', ['starter']],
  ['pokretac', ['starter']],
  ['osigurac', ['fuse']],
  ['relej', ['relay']],
  ['shem', ['wiring', 'diagram']],
  ['elektri', ['electr', 'wiring']],
  ['instalacij', ['wiring', 'harness']],
  ['svjetl', ['light', 'lamp']],
  ['far', ['headlight', 'headlamp']],
  ['zmigav', ['turn signal', 'indicator']],
  ['zarulj', ['bulb']],
  ['brisac', ['wiper']],
  ['klim', ['air condition', 'refrigerant']],
  ['kompresor', ['compressor']],
  ['grijanj', ['heat']],
  ['vrata', ['door']],
  ['brav', ['lock']],
  ['prozor', ['window']],
  ['retrovizor', ['mirror']],
  ['hauba', ['bonnet', 'hood', 'lid']],
  ['haube', ['bonnet', 'hood', 'lid']],
  ['gepek', ['boot', 'tailgate', 'rear lid']],
  ['prtljaz', ['boot', 'tailgate', 'luggage']],
  ['branik', ['bumper']],
  ['sjedal', ['seat']],
  ['pojas', ['belt']],
  ['airbag', ['airbag']],
  ['mjerac', ['gauge', 'sender']],
  ['moment', ['torques', 'tighten', 'torque spec', 'torque setting']],
  ['greska', ['fault']],
  ['gresk', ['fault']],
  ['kod', ['code']],
  ['servis', ['service', 'maintenance']],
  ['interval', ['interval']],
  ['kolicin', ['capacit', 'quantity']],
  ['podac', ['data']],
  ['zamjen', ['replac', 'renew', 'remov', 'chang']],
  ['skid', ['remov', 'dismantl']],
  ['rastav', ['dismantl', 'disassembl']],
  ['montaz', ['install', 'assembl']],
  ['podesav', ['adjust']],
  ['podesi', ['adjust']],
  ['provjer', ['check', 'test']],
  ['ispust', ['drain']],
  ['punjenj', ['fill', 'charg']],
];
/** The same thing under another English name (VW's "toothed belt" is everyone else's timing belt). */
const ENGLISH: Record<string, string[]> = {
  timing: ['toothed', 'camshaft drive'],
  toothed: ['timing'],
  water: ['coolant'],
  serpentine: ['poly v', 'ribbed'],
  rotor: ['disc', 'disk'],
  disc: ['disk', 'rotor'],
  caliper: ['calliper'],
  pads: ['pad', 'lining'],
  shock: ['shock absorber', 'strut', 'damper'],
  strut: ['shock absorber'],
  transmission: ['gearbox'],
  gearbox: ['transmission'],
  driveshaft: ['drive shaft', 'axle shaft'],
  wishbone: ['control arm', 'track control', 'transverse link'],
  cv: ['constant velocity'],
  pan: ['sump'],
  sump: ['oil pan'],
  hood: ['bonnet'],
  trunk: ['boot lid', 'rear lid', 'luggage'],
  headlight: ['headlamp'],
  muffler: ['silencer'],
  alternator: ['generator'],
  wiring: ['current flow', 'circuit diagram'],
  tire: ['tyre'],
  torque: ['tighten'],
  cabin: ['pollen'],
};
/** Small words that would only get in the way. */
const IGNORED = new Set(['na', 'za', 'u', 'i', 'od', 's', 'sa', 'motora', 'auta', 'the', 'of', 'a', 'and', 'for', 'kako', 'how', 'to']);

/** What a typed word may be called in the manual; itself always included. */
export function alternatives(word: string): string[] {
  const w = fold(word);
  const croatian = CROATIAN.filter(([start]) => w.startsWith(start) && (start.length >= 4 || w.length <= start.length + 2)).flatMap(([, english]) => english);
  const singular = w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w;
  return [...new Set([w, singular, ...(ENGLISH[w] ?? ENGLISH[singular] ?? []), ...croatian])];
}

function wordScore(page: ManualPage, options: readonly string[]): number {
  let best = 0;
  options.forEach((o, i) => {
    const at = page.foldedTitle.indexOf(o);
    const rank = Math.min(i, 4) * 0.4; // the first meaning before the others
    if (at >= 0) best = Math.max(best, (at === 0 || page.foldedTitle[at - 1] === ' ' ? 10 : 6) - rank);
    else if (page.foldedTrail.includes(o)) best = Math.max(best, 4 - rank);
    else if (fold(page.chapter).includes(o)) best = Math.max(best, 2 - rank / 4);
  });
  return best;
}

/** Pages that have every typed word (in either language), best first; when none has them all, the closest ones. */
export function searchManual(pages: readonly ManualPage[], query: string, limit = 60): ManualPage[] {
  const words = fold(query)
    .split(/[^a-z0-9.]+/)
    .filter((w) => w && !IGNORED.has(w));
  if (words.length === 0) return [];
  const options = words.map(alternatives);
  const hits: { page: ManualPage; score: number; matched: number }[] = [];
  for (const page of pages) {
    let score = 0;
    let matched = 0;
    for (const o of options) {
      const s = wordScore(page, o);
      if (s === 0) continue;
      matched++;
      score += s;
    }
    if (matched > 0) hits.push({ page, score: score + usefulness(page), matched });
  }
  const most = hits.reduce((m, h) => Math.max(m, h.matched), 0);
  return hits
    .filter((h) => h.matched === most)
    .sort((a, b) => b.score - a.score || a.page.order - b.page.order)
    .slice(0, limit)
    .map((h) => h.page);
}

/** Pages that tell how to do something, before drawings, notes and lists. */
function usefulness(page: ManualPage): number {
  const t = page.foldedTitle;
  let score = 0;
  if (/remov|install|replac|renew|chang|drain|fill|bleed|adjust|tension|capacit/.test(t)) score += 2;
  if (/special tool|general|note|safety|danger|risk|suggestion|warning|preface|introduction/.test(t)) score -= 3;
  score -= Math.min(page.trail.length, 6) * 0.2;
  score -= Math.min(t.split(' ').length, 12) * 0.1; // the shorter title is usually the plainer one
  // the car's own engine first, then the maintenance book
  if (page.engine) score += 3;
  else if (page.kind === 'maint') score += 1.5;
  return score;
}

// ---------------------------------------------------------------------------
// Jobs: what to look at for a service, brakes, the clutch…
// ---------------------------------------------------------------------------
interface TaskRule {
  label: string;
  /** matches the page's title, or the headings above it ("Coolant pump › Removing") */
  title: RegExp;
  not?: RegExp;
  /** only in chapters of these kinds… */
  kinds?: ChapterKind[];
  /** …or anywhere with a title like this */
  elsewhere?: RegExp;
  /** the headings above don't count */
  titleOnly?: boolean;
}

export interface ManualJob {
  id: string;
  label: string;
  /** what to look for on the internet */
  topic: string;
  tasks: TaskRule[];
}

const ENGINE_KINDS: ChapterKind[] = ['eng', 'maint', 'gen'];

export const MANUAL_JOBS: ManualJob[] = [
  {
    id: 'small-service',
    label: 'Small service',
    topic: 'oil and filter change',
    tasks: [
      {
        label: 'Engine oil and filter',
        title: /\boil (capacit|filter|spec|change|level|grade|service|drain)|engine oil\b|(drain|chang|fill|top).*\boil\b/,
        not: /seal|transmission|gear|steering|refrigerant|final drive|pressure|separator|axle|differential|cooler|compressor|haldex|coupling|poison|risk|danger|safety|pump|temperature|vapour|hydraulic|notes|consumption/,
        kinds: ENGINE_KINDS,
        elsewhere: /engine oil/,
      },
      { label: 'Air filter', title: /\bair (filter|cleaner)|intake filter/, not: /pollen|dust|passenger|recirc/ },
      { label: 'Fuel filter', title: /fuel filter|diesel filter|fuel system filter/ },
      { label: 'Pollen filter', title: /pollen|cabin (air )?filter|micro ?filter|interior (air )?filter|passenger compartment filter|dust filter/ },
      { label: 'Spark plugs', title: /spark plug/, not: /connector|thread/ },
      { label: 'Service intervals', title: /(service|maintenance|inspection|change).*(interval|schedule|table|indicator|list|work)|interval.*(service|display)|maintenance$/, not: /battery/, titleOnly: true },
    ],
  },
  {
    id: 'big-service',
    label: 'Big service',
    topic: 'timing belt replacement',
    tasks: [
      { label: 'Timing belt or chain', title: /toothed belt|timing (belt|chain|gear|case)|cam(shaft)? (drive )?(belt|chain)|chain (drive|tension)|\btiming (check|adjust)|valve timing|camshaft timing/, not: /ribbed|poly|v belt|injection timing/ },
      { label: 'Water pump', title: /(coolant|water) pump/, not: /aux|circulation|additional|electr|relay|run on|after/ },
      { label: 'Auxiliary belt', title: /poly ?v|ribbed|\bv belt|drive belt|accessory belt|(alternator|compressor|auxiliary|fan).*\bbelt\b|multi.*belt/, not: /toothed|timing|seat|safety|height/ },
      { label: 'Thermostat', title: /thermostat|coolant regulator/, not: /heater|air cond/ },
      { label: 'Coolant', title: /coolant.*(drain|fill|bleed|chang|capacit|mixture|replac|circuit)|(drain|fill|bleed|chang|replac).*(coolant|cooling system)/, not: /pump|pipe|hose|thermostat|sender|temperature|radiator/ },
      { label: 'Shaft oil seals', title: /(crankshaft|camshaft).*seal|oil seal|radial seal|sealing flange/, not: /gear|differential|drive shaft|steering|input|output|selector|flange shaft|driver/, kinds: ENGINE_KINDS, elsewhere: /(crankshaft|camshaft).*seal/ },
    ],
  },
  {
    id: 'brakes',
    label: 'Brakes',
    topic: 'brake pads and discs replacement',
    tasks: [
      { label: 'Pads', title: /brake (pad|lining|shoe|block)|\bpads?\b/, not: /sensor|contact|knee|seat|rubber|head|filler|crash/ },
      { label: 'Discs and drums', title: /brake (disc|disk|drum|rotor)/ },
      { label: 'Calipers', title: /cal+iper|brake cylinder|brake carrier/ },
      { label: 'Handbrake', title: /hand ?brake|parking brake/ },
      { label: 'Bleeding and fluid', title: /bleed|brake fluid/, not: /steering|coolant|cooling|fuel|suspension|clutch|convertible|roof/ },
      { label: 'ABS and wheel sensors', title: /\babs\b|wheel speed|speed sensor|pulse (generator|sensor)/, not: /transmission|road|input|output/ },
    ],
  },
  {
    id: 'clutch',
    label: 'Clutch & gearbox',
    topic: 'clutch replacement',
    tasks: [
      { label: 'Clutch', title: /clutch/, not: /magnetic|compressor|multi|pulley|switch on|k\d|lamella|overrun|freewheel/ },
      { label: 'Flywheel', title: /flywheel/ },
      { label: 'Gearbox in and out', title: /(remov|install|detach|attach|replac).*(gearbox|transmission)$|(gearbox|transmission) (remov|install|replac)|(remov|install).*(gearbox|transmission)\b/, not: /mount|oil|control|cover|selector|lever|seal|sensor|support|cable|pan|sump|switch|cooler|line|housing|shaft|gear wheel/ },
      { label: 'Gear oil', title: /(gear ?box|gear|transmission|final drive|differential|axle|atf).*(oil|fluid|atf)|\batf\b/, not: /seal|cooler|pressure|temperature|pump|pipe|strainer/ },
      { label: 'Drive shafts', title: /drive ?shaft|constant velocity|cv joint|joint (boot|gaiter|protective)|axle shaft|output shaft|propshaft|propeller shaft/, not: /oil seal|clutch/ },
    ],
  },
  {
    id: 'suspension',
    label: 'Suspension',
    topic: 'suspension replacement',
    tasks: [
      { label: 'Shock absorbers and springs', title: /shock absorber|suspension strut|spring strut|\bstrut|coil spring|damper strut|\bsprings?\b/, not: /clutch|valve|vibration|gas|bonnet|tailgate|lid|mass|flap|door|door|seat|timing|tension|hood|brake/ },
      { label: 'Arms and joints', title: /wishbone|control arm|track control|suspension (arm|link)|transverse link|trailing arm|ball joint|swivel|guide link|transverse arm|semi trailing/ },
      { label: 'Wheel bearings', title: /wheel bearing|wheel hub|hub (and|carrier|bearing)|bearing.*hub/ },
      { label: 'Anti-roll bar', title: /anti ?roll|stabili[sz]er|coupling rod|drop link/ },
      { label: 'Steering', title: /steering (rack|gear|box|column)|track rod|tie rod|power steering|steering pump|power assisted/ },
      { label: 'Wheel alignment', title: /alignment|axle geometry|wheel geometry|\btoe\b|camber|tracking/, not: /headl|door|radar|camera/ },
    ],
  },
  {
    id: 'engine',
    label: 'Engine',
    topic: 'engine repair',
    tasks: [
      { label: 'Injectors', title: /injector|unit inj|injection (nozzle|pump|valve)|nozzle/, not: /washer|windscreen|headl|air|vent/ },
      { label: 'Glow plugs', title: /glow ?plug|preglow|glow period/ },
      { label: 'Turbo and intake', title: /turbo|charge (air|pressure)|intercooler|intake (manifold|system|pipe)|supercharg/ },
      { label: 'Cylinder head', title: /cylinder head/ },
      { label: 'Valves and compression', title: /compression|valve (clearance|gear|stem|seat|guide|adjust)|camshaft|tappet|lifter/, not: /seal|sensor|coil/ },
      { label: 'EGR and exhaust', title: /\begr\b|exhaust gas re|exhaust|catalytic|particul|lambda|oxygen sensor/, not: /valve seat|camshaft/ },
      { label: 'Taking the engine out', title: /(remov|install).*\bengine$|engine.*(remov|install)|(remov|install).*\bengine \(/, not: /cover|mount|wiring|under|noise|control|compartment/ },
    ],
  },
  {
    id: 'electrics',
    label: 'Electrics',
    topic: 'wiring diagram',
    tasks: [
      { label: 'Wiring diagrams', title: /wiring|circuit diagram|current flow/, not: /harness repair/ },
      { label: 'Fuses and relays', title: /fuse|relay/, not: /diffuse/ },
      { label: 'Battery', title: /battery/, not: /key|remote/ },
      { label: 'Alternator and starter', title: /alternator|starter\b|generator\b/, not: /belt|lock|hall|signal|sender|pulse/ },
      { label: 'Lights', title: /headl|head lamp|\blamps?\b|\blights?\b|bulb|turn signal|indicator/, not: /warning|control lamp|indicator lamp|interval/ },
      { label: 'Wipers', title: /wiper|windscreen wash|washer (pump|system|jet|nozzle)/ },
      { label: 'Windows and locks', title: /window (regulator|lift|motor)|central lock|door lock|lock cylinder/ },
    ],
  },
  {
    id: 'data',
    label: 'Torques & data',
    topic: 'torque specs and capacities',
    tasks: [
      { label: 'Torques', title: /torque|tighten/, not: /converter|support|reaction|wrench|rod|bracket|sensor/ },
      { label: 'Engine data', title: /engine (data|number|code|identification)|technical data|specifications?$|test (and|&) adjust|adjusting (data|values)|checking and adjusting values|^engine$/, not: /remov|install|compressor|thread|sealant/ },
      { label: 'Capacities and fluids', title: /capacit|fluids?\b|lubricant|\bfilling quant/, not: /battery|brake fluid level|washer/ },
      { label: 'Fault codes', title: /fault (table|code|memory)|\bdtc|trouble code|self ?diagnosis/ },
    ],
  },
  {
    id: 'cooling',
    label: 'Cooling & A/C',
    topic: 'air conditioning repair',
    tasks: [
      { label: 'Radiator and fan', title: /radiator|coolant fan|viscous|cooling fan|expansion tank/ , not: /grille|air outlet/ },
      { label: 'Hoses and leaks', title: /coolant (hose|pipe|system|leak)|cooling system|coolant.*(diagram|connection)/ },
      { label: 'Heater', title: /heater|heat exchanger|blower/, not: /seat|auxiliary|lambda|mirror|window|rear/ },
      { label: 'Air conditioning', title: /air condition|refrigerant|compressor|condenser|evaporator/, not: /air suspension|belt pulley tension/ },
    ],
  },
  {
    id: 'body',
    label: 'Body & interior',
    topic: 'interior and body panel removal',
    tasks: [
      { label: 'Doors', title: /\bdoors?\b/, not: /mirror|fuel|loudspeaker/ },
      { label: 'Bonnet and boot', title: /bonnet|boot lid|tailgate|rear lid|\bhood\b|trunk|luggage compartment lid/ },
      { label: 'Bumpers and wings', title: /bumper|\bwings?\b|fender|lock carrier|front end/ },
      { label: 'Glass and mirrors', title: /windscreen|window glass|\bglass\b|mirror|rear window|side window/, not: /wash|wip/ },
      { label: 'Seats and trim', title: /\bseats?\b|\btrim\b|dash panel|dashboard|centre console|center console|instrument panel/, not: /valve seat|seat belt pre/ },
    ],
  },
];

export function manualJob(id: string | null | undefined): ManualJob | undefined {
  return MANUAL_JOBS.find((j) => j.id === id);
}

export interface TaskPages {
  label: string;
  pages: ManualPage[];
}

/** The manual's pages for each task of a job; tasks without pages are left out. */
export function jobPages(pages: readonly ManualPage[], job: ManualJob): TaskPages[] {
  return job.tasks
    .map((task) => {
      const hits: { page: ManualPage; score: number }[] = [];
      for (const page of pages) {
        if (task.kinds && !task.kinds.includes(page.kind) && !task.elsewhere?.test(page.foldedTitle)) continue;
        if (task.not?.test(page.foldedTitle)) continue;
        const inTitle = task.title.test(page.foldedTitle);
        const inTrail = !inTitle && !task.titleOnly && task.title.test(page.foldedTrail) && !task.not?.test(page.foldedTrail);
        if (!inTitle && !inTrail) continue;
        hits.push({ page, score: (inTitle ? 10 : 0) + usefulness(page) });
      }
      hits.sort((a, b) => b.score - a.score || a.page.order - b.page.order);
      // the same title may come from several chapters of the same engine; once is enough
      const seen = new Set<string>();
      const unique = hits.filter(({ page }) => {
        const key = `${page.engine ?? page.chapter}|${page.trail.join('>')}|${page.title}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return { label: task.label, pages: unique.map((h) => h.page) };
    })
    .filter((t) => t.pages.length > 0);
}

// ---------------------------------------------------------------------------
// Elsewhere
// ---------------------------------------------------------------------------
/** "Volkswagen Passat B5.5 1.9 TDI timing belt replacement" */
export function webQuery(car: ManualCar, topic: string): string {
  const engine = (car.engine ?? '').replace(/\s*\d+\s*kw.*$/i, '').replace(/\(.*\)/, '').trim();
  const generation = (car.generation ?? '').replace(/\(.*\)/, '').trim();
  return [car.make, car.model, generation, engine || (car.year ? String(car.year) : ''), topic].filter(Boolean).join(' ');
}

export const youtubeUrl = (query: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
export const googleUrl = (query: string) => `https://www.google.com/search?q=${encodeURIComponent(query)}`;
