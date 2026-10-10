// Pure helpers for the files function (no Deno APIs, so they are unit-tested with Vitest).

export type EntityType = 'car' | 'job' | 'stock_movement' | 'transaction' | 'tool';
export type FileKind = 'photo' | 'receipt' | 'invoice' | 'document';

export const ENTITY_TYPES: readonly EntityType[] = ['car', 'job', 'stock_movement', 'transaction', 'tool'];
export const FILE_KINDS: readonly FileKind[] = ['photo', 'receipt', 'invoice', 'document'];

export const ROOT_FOLDER_NAME = 'Workshop Tracker';

/** A folder to find or create: a stable cache key, its name in Drive and its parent's key (null = My Drive). */
export interface FolderSpec {
  key: string;
  name: string;
  parent: string | null;
}

/** Characters Drive and most phones are happy with in names. */
export function cleanName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

export interface CarInfo {
  id: string;
  ref: string;
  year: number | null;
  make: string;
  model: string;
  plate: string | null;
}

export interface JobInfo {
  id: string;
  ref: string;
  customer: string;
  plate: string | null;
  createdYear: number;
}

export interface ToolInfo {
  id: string;
  code: string;
  name: string;
}

/**
 * The chain of folders (root first) a file goes into:
 *   Workshop Tracker/Cars/2012 Škoda Octavia ZG1234AB (CAR-001)/Photos | Receipts
 *   Workshop Tracker/Jobs/2026/JOB-001 Marko ZG-123-AB
 *   Workshop Tracker/Invoices/2026
 *   Workshop Tracker/Receipts/2026          (stock purchases, workshop expenses)
 *   Workshop Tracker/Tools/T-001 Impact wrench   (photos, receipts, manuals)
 */
export function folderChain(
  target:
    | { type: 'car'; car: CarInfo; kind: FileKind }
    | { type: 'job'; job: JobInfo; kind: FileKind }
    | { type: 'tool'; tool: ToolInfo }
    | { type: 'other'; year: number },
): FolderSpec[] {
  const root: FolderSpec = { key: 'root', name: ROOT_FOLDER_NAME, parent: null };
  if (target.type === 'tool') {
    const { tool } = target;
    return [
      root,
      { key: 'tools', name: 'Tools', parent: 'root' },
      { key: `tool:${tool.id}`, name: cleanName(`${tool.code} ${tool.name}`), parent: 'tools' },
    ];
  }
  if (target.type === 'car') {
    const { car } = target;
    const carName = cleanName(`${[car.year, car.make, car.model, car.plate].filter(Boolean).join(' ')} (${car.ref})`);
    const sub = target.kind === 'photo' ? 'Photos' : 'Receipts';
    return [
      root,
      { key: 'cars', name: 'Cars', parent: 'root' },
      { key: `car:${car.id}`, name: carName, parent: 'cars' },
      { key: `car:${car.id}/${sub}`, name: sub, parent: `car:${car.id}` },
    ];
  }
  if (target.type === 'job') {
    const { job } = target;
    if (target.kind === 'invoice') {
      return [
        root,
        { key: 'invoices', name: 'Invoices', parent: 'root' },
        { key: `invoices/${job.createdYear}`, name: String(job.createdYear), parent: 'invoices' },
      ];
    }
    return [
      root,
      { key: 'jobs', name: 'Jobs', parent: 'root' },
      { key: `jobs/${job.createdYear}`, name: String(job.createdYear), parent: 'jobs' },
      { key: `job:${job.id}`, name: cleanName([job.ref, job.customer, job.plate].filter(Boolean).join(' ')), parent: `jobs/${job.createdYear}` },
    ];
  }
  return [
    root,
    { key: 'receipts', name: 'Receipts', parent: 'root' },
    { key: `receipts/${target.year}`, name: String(target.year), parent: 'receipts' },
  ];
}

export const THUMBS_FOLDER: FolderSpec[] = [
  { key: 'root', name: ROOT_FOLDER_NAME, parent: null },
  { key: 'thumbs', name: '.thumbs', parent: 'root' },
];

/** "2026-03-12 brake pads.jpg" */
export function fileNameFor(date: string, label: string, original: string, mimeType: string): string {
  const ext = original.includes('.') ? original.slice(original.lastIndexOf('.')).toLowerCase() : extensionFor(mimeType);
  const base = cleanName(label || original.replace(/\.[^.]+$/, '')) || 'file';
  return `${date} ${base}`.slice(0, 110) + ext;
}

export function extensionFor(mimeType: string): string {
  if (mimeType === 'image/jpeg') return '.jpg';
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/webp') return '.webp';
  if (mimeType === 'application/pdf') return '.pdf';
  return '';
}

/** Signed links stay the same for a whole day (so the browser can cache images): valid until the end of tomorrow (UTC). */
export function linkExpiry(now: Date): number {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2));
  return Math.floor(d.getTime() / 1000);
}

export function signingPayload(id: string, variant: 'thumb' | 'full', exp: number): string {
  return `${id}.${variant}.${exp}`;
}

export const MAX_UPLOAD_BYTES = 9 * 1024 * 1024;
export const ALLOWED_MIME = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/;
