import { describe, expect, it } from 'vitest';
import { cleanName, fileNameFor, folderChain, invoiceLinkExpiry, invoicePayload, linkExpiry, signingPayload } from './paths';

const car = { id: 'c1', ref: 'CAR-001', year: 2012, make: 'Škoda', model: 'Octavia', plate: 'ZG1234AB' };
const job = { id: 'j1', ref: 'JOB-007', customer: 'Marko Marić', plate: 'ZG-123-AB', createdYear: 2026 };

describe('Drive folders', () => {
  it('puts car photos and receipts in the car’s folder', () => {
    expect(folderChain({ type: 'car', car, kind: 'photo' }).map((f) => f.name)).toEqual([
      'Workshop Tracker',
      'Cars',
      '2012 Škoda Octavia ZG1234AB (CAR-001)',
      'Photos',
    ]);
    expect(folderChain({ type: 'car', car, kind: 'receipt' }).at(-1)).toEqual({ key: 'car:c1/Receipts', name: 'Receipts', parent: 'car:c1' });
  });

  it('puts jobs by year and invoices in their own folder', () => {
    expect(folderChain({ type: 'job', job, kind: 'photo' }).map((f) => f.name)).toEqual([
      'Workshop Tracker',
      'Jobs',
      '2026',
      'JOB-007 Marko Marić ZG-123-AB',
    ]);
    expect(folderChain({ type: 'job', job, kind: 'invoice' }).map((f) => f.key)).toEqual(['root', 'invoices', 'invoices/2026']);
  });

  it('gives every tool its own folder', () => {
    expect(folderChain({ type: 'tool', tool: { id: 't1', code: 'T-001', name: 'Impact wrench 1/2"' } }).map((f) => f.name)).toEqual([
      'Workshop Tracker',
      'Tools',
      'T-001 Impact wrench 1 2',
    ]);
  });

  it('gives every inventory item its own folder', () => {
    expect(folderChain({ type: 'item', item: { id: 'i1', part_number: 'FLD-CAST-001', name: 'Engine oil 5W-30' } }).map((f) => f.key)).toEqual([
      'root',
      'inventory',
      'item:i1',
    ]);
    expect(folderChain({ type: 'item', item: { id: 'i1', part_number: 'FLD-CAST-001', name: 'Engine oil 5W-30' } }).at(-1)!.name).toBe(
      'FLD-CAST-001 Engine oil 5W-30',
    );
  });

  it('puts other receipts by year', () => {
    expect(folderChain({ type: 'other', year: 2026 }).map((f) => f.key)).toEqual(['root', 'receipts', 'receipts/2026']);
  });

  it('every folder’s parent comes before it', () => {
    const chain = folderChain({ type: 'car', car, kind: 'photo' });
    chain.forEach((f, i) => {
      if (f.parent) expect(chain.slice(0, i).map((x) => x.key)).toContain(f.parent);
    });
  });
});

describe('names', () => {
  it('cleans characters Drive and phones dislike', () => {
    expect(cleanName('a/b\\c: "d"?  e')).toBe('a b c d e');
  });

  it('builds dated file names', () => {
    expect(fileNameFor('2026-03-12', 'brake pads', 'IMG_1234.JPG', 'image/jpeg')).toBe('2026-03-12 brake pads.jpg');
    expect(fileNameFor('2026-03-12', '', 'receipt.pdf', 'application/pdf')).toBe('2026-03-12 receipt.pdf');
    expect(fileNameFor('2026-03-12', 'photo', 'blob', 'image/jpeg')).toBe('2026-03-12 photo.jpg');
  });
});

describe('signed links', () => {
  it('stay the same during a day and expire the day after tomorrow', () => {
    const morning = linkExpiry(new Date('2026-10-10T06:00:00Z'));
    const evening = linkExpiry(new Date('2026-10-10T22:00:00Z'));
    expect(morning).toBe(evening);
    expect(new Date(morning * 1000).toISOString()).toBe('2026-10-12T00:00:00.000Z');
  });

  it('signs id, variant and expiry together', () => {
    expect(signingPayload('abc', 'thumb', 123)).toBe('abc.thumb.123');
  });

  it('keep invoice links for a year, the same all day, and apart from photo links', () => {
    const morning = invoiceLinkExpiry(new Date('2026-10-10T06:00:00Z'));
    expect(invoiceLinkExpiry(new Date('2026-10-10T23:59:00Z'))).toBe(morning);
    expect(new Date(morning * 1000).toISOString()).toBe('2027-10-11T00:00:00.000Z');
    expect(invoicePayload('job1', 123)).toBe('invoice.job1.123');
    // a photo link's signature can't be reused as an invoice link
    expect(invoicePayload('job1', 123)).not.toBe(signingPayload('job1', 'full', 123));
  });
});
