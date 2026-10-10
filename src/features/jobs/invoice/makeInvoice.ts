// Builds the invoice's content from a job (pure) and hands the PDF to the phone.
import { formatMoney } from '@/domain/money';
import { formatQuantity, toMilli } from '@/domain/quantity';
import { formatDate, todayIso } from '@/domain/dates';
import { unitPrice } from '@/domain/jobs';
import type { Settings } from '@/features/settings/api';
import type { Job, JobLine } from '../api';
import { jobCar } from '../JobsListPage';
import type { InvoiceData } from './InvoiceDocument';

export function buildInvoiceData({
  job,
  number,
  lines,
  settings,
}: {
  job: Job;
  number: string;
  lines: JobLine[];
  settings: Settings;
}): InvoiceData {
  const rows = lines.map((l) => {
    const qty = toMilli(l.qty);
    return {
      description: l.description,
      qty: formatQuantity(qty, l.kind === 'stock' ? (l.unit ?? undefined) : undefined),
      unitPrice: formatMoney(unitPrice(l.sale_price_cents, qty)),
      amount: formatMoney(l.sale_price_cents),
    };
  });
  if (job.labor_price_cents > 0) {
    rows.push({ description: 'Labor', qty: '1', unitPrice: formatMoney(job.labor_price_cents), amount: formatMoney(job.labor_price_cents) });
  }
  const { due, paid, outstanding } = job.totals;
  return {
    title: settings.invoice_title,
    number,
    date: formatDate(job.invoice_date ?? todayIso()),
    jobRef: job.ref,
    workshop: {
      name: settings.workshop_name,
      address: settings.address,
      phone: settings.phone,
      email: settings.email,
      website: settings.website,
      iban: settings.iban,
      logo: settings.logo_data_url,
    },
    customer: { name: job.customer?.name ?? '', phone: job.customer?.phone ?? null },
    car: jobCar(job) || null,
    vin: job.car_vin,
    description: job.description,
    lines: rows,
    total: formatMoney(due),
    paid: paid > 0 ? formatMoney(paid) : null,
    outstanding: outstanding > 0 ? formatMoney(outstanding) : null,
    footer: settings.invoice_footer,
  };
}

function pdfFileName(name: string) {
  return `${name.replace(/[\\/:*?"<>|]+/g, '-')}.pdf`;
}

/** On a phone: the share sheet with the PDF file (WhatsApp, mail, save to Files). Elsewhere: a normal download. */
export async function shareOrDownload(blob: Blob, name: string) {
  const file = new File([blob], pdfFileName(name), { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      // fall back to download
    }
  }
  downloadPdf(blob, name);
}

export function downloadPdf(blob: Blob, name: string) {
  const fileName = pdfFileName(name);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
