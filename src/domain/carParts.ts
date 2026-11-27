// Parts bought for our own cars (docs/PLAN.md §13, V2): each kind of part has its own extra fields, kept in
// car_parts.details as text. The database checks the kinds (migration 20261127100000_car_services.sql).

export type PartKind =
  | 'tyres'
  | 'wheels'
  | 'battery'
  | 'oil'
  | 'filter'
  | 'brakes'
  | 'wipers'
  | 'bulbs'
  | 'suspension'
  | 'timing'
  | 'clutch'
  | 'plugs'
  | 'coolant'
  | 'other';

export type PartState = 'fitted' | 'stored' | 'gone';

export const PART_STATES: { value: PartState; label: string }[] = [
  { value: 'fitted', label: 'On the car' },
  { value: 'stored', label: 'Stored' },
  { value: 'gone', label: 'Gone' },
];

export interface DetailField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'choice' | 'date';
  options?: { value: string; label: string }[];
  placeholder?: string;
  suffix?: string;
  hint?: string;
  /** how the value reads in a part's one-line summary, e.g. (v) => `×${v}` */
  short?: (value: string, label: string) => string;
}

export interface PartKindInfo {
  value: PartKind;
  label: string;
  /** the name a new part of this kind starts with */
  name: string;
  fields: DetailField[];
}

const choice = (...pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));
const AXLE = choice(['front', 'Front'], ['rear', 'Rear'], ['both', 'Front and rear']);
const count: DetailField = { key: 'count', label: 'How many', type: 'number', placeholder: '4', short: (v) => `×${v}` };

export const PART_KINDS: PartKindInfo[] = [
  {
    value: 'tyres',
    label: 'Tyres',
    name: 'Tyres',
    fields: [
      { key: 'season', label: 'Season', type: 'choice', options: choice(['summer', 'Summer'], ['winter', 'Winter'], ['all_season', 'All-season']) },
      { key: 'size', label: 'Size', type: 'text', placeholder: '205/55 R16' },
      { key: 'load_speed', label: 'Load and speed index', type: 'text', placeholder: '91V' },
      {
        key: 'dot',
        label: 'DOT',
        type: 'text',
        placeholder: '3823',
        hint: 'The last 4 digits of the DOT code on the sidewall: week and year made (3823 = week 38 of 2023).',
        short: (v) => dotLabel(v) ?? `DOT ${v}`,
      },
      count,
      { key: 'tread_mm', label: 'Tread depth', type: 'number', suffix: 'mm', placeholder: '7', short: (v) => `${v} mm tread` },
      { key: 'on_rims', label: 'On rims', type: 'choice', options: choice(['yes', 'On rims'], ['no', 'Tyres only']) },
    ],
  },
  {
    value: 'wheels',
    label: 'Wheels / rims',
    name: 'Wheels',
    fields: [
      { key: 'material', label: 'Material', type: 'choice', options: choice(['alloy', 'Alloy'], ['steel', 'Steel']) },
      { key: 'diameter', label: 'Diameter', type: 'text', placeholder: '16"' },
      { key: 'width', label: 'Width', type: 'text', placeholder: '6.5J' },
      { key: 'pcd', label: 'Bolt pattern (PCD)', type: 'text', placeholder: '5x112' },
      { key: 'offset', label: 'Offset', type: 'text', placeholder: 'ET45' },
      { key: 'center_bore', label: 'Centre bore', type: 'text', suffix: 'mm', placeholder: '57.1', short: (v) => `CB ${v}` },
      count,
    ],
  },
  {
    value: 'battery',
    label: 'Battery',
    name: 'Battery',
    fields: [
      { key: 'capacity_ah', label: 'Capacity', type: 'number', suffix: 'Ah', placeholder: '74', short: (v) => `${v} Ah` },
      { key: 'cca', label: 'Cold cranking', type: 'number', suffix: 'A', placeholder: '680', short: (v) => `${v} A` },
      { key: 'technology', label: 'Type', type: 'choice', options: choice(['standard', 'Standard'], ['efb', 'EFB'], ['agm', 'AGM']) },
      { key: 'warranty_until', label: 'Warranty until', type: 'date', short: (v) => `warranty to ${v.split('-').reverse().join('.')}` },
    ],
  },
  {
    value: 'oil',
    label: 'Engine oil',
    name: 'Engine oil',
    fields: [
      { key: 'viscosity', label: 'Viscosity', type: 'text', placeholder: '5W-30' },
      { key: 'spec', label: 'Approval', type: 'text', placeholder: 'VW 504.00 / 507.00' },
      { key: 'litres', label: 'Amount', type: 'number', suffix: 'L', placeholder: '4.3', short: (v) => `${v} L` },
    ],
  },
  {
    value: 'filter',
    label: 'Filter',
    name: 'Filter',
    fields: [
      {
        key: 'filter_type',
        label: 'Which filter',
        type: 'choice',
        options: choice(['oil', 'Oil'], ['air', 'Air'], ['fuel', 'Fuel'], ['cabin', 'Cabin / pollen'], ['dpf', 'DPF']),
        short: (_v, label) => `${label} filter`,
      },
    ],
  },
  {
    value: 'brakes',
    label: 'Brakes',
    name: 'Brakes',
    fields: [
      {
        key: 'what',
        label: 'What',
        type: 'choice',
        options: choice(['pads', 'Pads'], ['discs', 'Discs'], ['pads_discs', 'Pads and discs'], ['shoes', 'Shoes / drums'], ['fluid', 'Brake fluid']),
      },
      { key: 'axle', label: 'Axle', type: 'choice', options: AXLE },
      { key: 'disc_size', label: 'Disc size', type: 'text', placeholder: '288 × 25 mm' },
    ],
  },
  {
    value: 'wipers',
    label: 'Wiper blades',
    name: 'Wiper blades',
    fields: [
      { key: 'position', label: 'Where', type: 'choice', options: choice(['front', 'Front'], ['rear', 'Rear'], ['both', 'Front and rear']) },
      { key: 'length', label: 'Length', type: 'text', placeholder: '600 + 475 mm' },
    ],
  },
  {
    value: 'bulbs',
    label: 'Bulbs',
    name: 'Bulbs',
    fields: [
      { key: 'bulb_type', label: 'Bulb', type: 'text', placeholder: 'H7, H4, W5W…' },
      { key: 'position', label: 'Where', type: 'text', placeholder: 'Low beam, left' },
      count,
    ],
  },
  {
    value: 'suspension',
    label: 'Shocks & suspension',
    name: 'Shock absorbers',
    fields: [
      { key: 'what', label: 'What', type: 'text', placeholder: 'Shocks, springs, control arm, links…' },
      { key: 'axle', label: 'Axle', type: 'choice', options: AXLE },
      { key: 'side', label: 'Side', type: 'choice', options: choice(['left', 'Left'], ['right', 'Right'], ['both', 'Both']) },
    ],
  },
  {
    value: 'timing',
    label: 'Timing belt / chain',
    name: 'Timing belt kit',
    fields: [
      { key: 'kit', label: 'Kit includes', type: 'text', placeholder: 'Belt, tensioner, idler, water pump' },
      { key: 'next_km', label: 'Change again at', type: 'number', suffix: 'km', placeholder: '330000', short: (v) => `next at ${v} km` },
    ],
  },
  {
    value: 'clutch',
    label: 'Clutch',
    name: 'Clutch kit',
    fields: [
      { key: 'kit', label: 'Kit includes', type: 'text', placeholder: 'Disc, pressure plate, release bearing' },
      { key: 'flywheel', label: 'Flywheel', type: 'choice', options: choice(['dual_mass', 'Dual-mass, new'], ['solid', 'Solid conversion'], ['kept', 'Old one kept']) },
    ],
  },
  {
    value: 'plugs',
    label: 'Spark / glow plugs',
    name: 'Plugs',
    fields: [{ key: 'plug_type', label: 'Type', type: 'choice', options: choice(['spark', 'Spark plugs'], ['glow', 'Glow plugs']) }, count],
  },
  {
    value: 'coolant',
    label: 'Coolant & fluids',
    name: 'Coolant',
    fields: [
      {
        key: 'fluid',
        label: 'Which',
        type: 'choice',
        options: choice(['coolant', 'Coolant'], ['gearbox', 'Gearbox oil'], ['steering', 'Power steering'], ['adblue', 'AdBlue'], ['other', 'Other']),
      },
      { key: 'spec', label: 'Spec', type: 'text', placeholder: 'G12++, 75W-90…' },
      { key: 'litres', label: 'Amount', type: 'number', suffix: 'L', placeholder: '5', short: (v) => `${v} L` },
    ],
  },
  { value: 'other', label: 'Other', name: '', fields: [] },
];

export function partKind(kind: string): PartKindInfo {
  return PART_KINDS.find((k) => k.value === kind) ?? PART_KINDS[PART_KINDS.length - 1];
}

export function partStateLabel(state: string): string {
  return PART_STATES.find((s) => s.value === state)?.label ?? state;
}

export type PartDetails = Record<string, string>;

/** Only the fields of this kind, trimmed, without empty ones (what goes in car_parts.details). */
export function cleanDetails(kind: string, raw: Record<string, unknown>): PartDetails {
  const out: PartDetails = {};
  for (const field of partKind(kind).fields) {
    const value = raw[field.key];
    const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
    if (!text) continue;
    if (field.type === 'number') {
      const n = text.replace(',', '.').replace(/\s/g, '');
      if (/^\d+(\.\d+)?$/.test(n)) out[field.key] = n;
    } else if (field.type === 'choice') {
      if (field.options?.some((o) => o.value === text)) out[field.key] = text;
    } else {
      out[field.key] = text;
    }
  }
  return out;
}

/** A number field that isn't a number, by field key (for the form). */
export function badNumbers(kind: string, raw: Record<string, string>): string[] {
  return partKind(kind)
    .fields.filter((f) => f.type === 'number' && raw[f.key]?.trim() && !/^\d+(\.\d+)?$/.test(raw[f.key].trim().replace(',', '.').replace(/\s/g, '')))
    .map((f) => f.key);
}

/** "3823" → "made 38/2023"; null when it isn't a DOT date. */
export function dotLabel(dot: string): string | null {
  const m = /^(\d{2})(\d{2})$/.exec(dot.trim());
  if (!m || +m[1] < 1 || +m[1] > 53) return null;
  return `made ${m[1]}/20${m[2]}`;
}

/** Age in whole years of a tyre made in DOT week/year, on a given day. */
export function dotAgeYears(dot: string, today: string): number | null {
  const m = /^(\d{2})(\d{2})$/.exec(dot.trim());
  if (!m || +m[1] < 1 || +m[1] > 53) return null;
  const made = new Date(Date.UTC(2000 + +m[2], 0, 1 + (+m[1] - 1) * 7));
  const now = new Date(`${today}T00:00:00Z`);
  return Math.floor((now.getTime() - made.getTime()) / (365.25 * 86_400_000));
}

/** One line from a part's details: "Winter · 205/55 R16 · 91V · made 38/2023 · ×4". */
export function partSummary(kind: string, details: unknown): string {
  const values = (details && typeof details === 'object' ? details : {}) as Record<string, unknown>;
  return partKind(kind)
    .fields.map((f) => {
      const v = values[f.key];
      if (typeof v !== 'string' || !v) return null;
      const label = f.options?.find((o) => o.value === v)?.label ?? v;
      if (f.short) return f.short(v, label);
      return f.suffix && f.type === 'number' ? `${v} ${f.suffix}` : label;
    })
    .filter(Boolean)
    .join(' · ');
}
