import { describe, expect, it, vi } from 'vitest';

// The fonts are loaded from BASE_URL; in tests that is the local public/ folder.
vi.stubEnv('BASE_URL', `${process.cwd().replace(/\\/g, '/')}/public/`);

describe('invoice PDF', () => {
  it('renders a real PDF with Croatian letters, the € sign and many lines', async () => {
    const { renderInvoicePdf } = await import('./InvoiceDocument');
    const blob = await renderInvoicePdf({
      title: 'Račun',
      number: '2026-001',
      date: '10.10.2026',
      jobRef: 'JOB-001',
      workshop: {
        name: 'Radionica Đurđević',
        address: 'Ulica 1, Zagreb',
        phone: '091 111 222',
        email: 'radionica@example.com',
        website: null,
        iban: 'HR12 3456 7890 1234 5678 9',
        logo: null,
      },
      customer: { name: 'Čedo Šimić', phone: '098 765 432' },
      car: 'Škoda Octavia · ZG-123-AB',
      vin: 'TMBJJ7NE0F0123456',
      description: 'Zamjena ulja i filtera, kočione pločice',
      lines: Array.from({ length: 40 }, (_, i) => ({
        description: `Dio ${i + 1}: ćevapčići žžž`,
        qty: '4.5 L',
        unitPrice: '7.00€',
        amount: '31.50€',
      })),
      total: '1 310.00€',
      paid: null,
      outstanding: '1 310.00€',
      footer: 'Nije u sustavu PDV-a.',
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    // INVOICE_OUT=path writes the PDF so it can be looked at
    if (process.env.INVOICE_OUT) (await import('node:fs')).writeFileSync(process.env.INVOICE_OUT, bytes);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(5000);
  }, 30_000);
});
