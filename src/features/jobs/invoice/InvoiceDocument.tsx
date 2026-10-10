// The PDF invoice / job sheet, rendered on the phone. Loaded only when an invoice is made (big library).
import { Document, Font, Image, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';

const base = import.meta.env.BASE_URL;
// Roboto (bundled, Latin subset): the built-in PDF fonts lack č, ć and đ.
Font.register({
  family: 'Roboto',
  fonts: [
    { src: `${base}fonts/Roboto-Regular.ttf` },
    { src: `${base}fonts/Roboto-Bold.ttf`, fontWeight: 'bold' },
  ],
});
Font.registerHyphenationCallback((word) => [word]);

export interface InvoiceData {
  title: string;
  number: string;
  date: string;
  jobRef: string;
  workshop: {
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    iban: string | null;
    logo: string | null;
  };
  customer: { name: string; phone: string | null };
  car: string | null;
  vin: string | null;
  description: string;
  lines: { description: string; qty: string; unitPrice: string; amount: string }[];
  total: string;
  paid: string | null;
  outstanding: string | null;
  footer: string | null;
}

const s = StyleSheet.create({
  page: { fontFamily: 'Roboto', fontSize: 10, padding: 40, color: '#1f2328' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  logo: { width: 90, height: 90, objectFit: 'contain' },
  workshop: { textAlign: 'right', maxWidth: 260 },
  workshopName: { fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
  muted: { color: '#59636e' },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 'bold' },
  meta: { textAlign: 'right' },
  boxes: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  box: { flex: 1, borderWidth: 1, borderColor: '#d1d9e0', borderRadius: 4, padding: 8 },
  label: { fontSize: 8, color: '#59636e', marginBottom: 2, textTransform: 'uppercase' },
  bold: { fontWeight: 'bold' },
  work: { marginBottom: 16 },
  tableHead: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#1f2328', paddingBottom: 4, marginBottom: 2 },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: '#d1d9e0', paddingVertical: 4 },
  cDesc: { flex: 1, paddingRight: 8 },
  cQty: { width: 60, textAlign: 'right' },
  cUnit: { width: 75, textAlign: 'right' },
  cAmount: { width: 80, textAlign: 'right' },
  totals: { marginTop: 10, marginLeft: 'auto', width: 220 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  grand: { fontSize: 13, fontWeight: 'bold', borderTopWidth: 1, borderColor: '#1f2328', paddingTop: 4, marginTop: 2 },
  pay: { marginTop: 24 },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, textAlign: 'center', color: '#59636e', fontSize: 9 },
});

function InvoiceDocument({ data }: { data: InvoiceData }) {
  const w = data.workshop;
  return (
    <Document title={`${data.title} ${data.number}`} author={w.name}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          {w.logo ? <Image src={w.logo} style={s.logo} /> : <View />}
          <View style={s.workshop}>
            <Text style={s.workshopName}>{w.name}</Text>
            {w.address && <Text>{w.address}</Text>}
            {w.phone && <Text>{w.phone}</Text>}
            {w.email && <Text>{w.email}</Text>}
            {w.website && <Text>{w.website}</Text>}
          </View>
        </View>

        <View style={s.titleRow}>
          <Text style={s.title}>{data.title}</Text>
          <View style={s.meta}>
            <Text>
              No. <Text style={s.bold}>{data.number}</Text>
            </Text>
            <Text>Date {data.date}</Text>
            <Text style={s.muted}>Job {data.jobRef}</Text>
          </View>
        </View>

        <View style={s.boxes}>
          <View style={s.box}>
            <Text style={s.label}>Customer</Text>
            <Text style={s.bold}>{data.customer.name}</Text>
            {data.customer.phone && <Text>{data.customer.phone}</Text>}
          </View>
          <View style={s.box}>
            <Text style={s.label}>Car</Text>
            <Text style={s.bold}>{data.car ?? '—'}</Text>
            {data.vin && <Text style={s.muted}>VIN {data.vin}</Text>}
          </View>
        </View>

        <View style={s.work}>
          <Text style={s.label}>Work done</Text>
          <Text>{data.description}</Text>
        </View>

        <View style={s.tableHead}>
          <Text style={[s.cDesc, s.bold]}>Description</Text>
          <Text style={[s.cQty, s.bold]}>Qty</Text>
          <Text style={[s.cUnit, s.bold]}>Unit price</Text>
          <Text style={[s.cAmount, s.bold]}>Amount</Text>
        </View>
        {data.lines.map((l, i) => (
          <View key={i} style={s.row} wrap={false}>
            <Text style={s.cDesc}>{l.description}</Text>
            <Text style={s.cQty}>{l.qty}</Text>
            <Text style={s.cUnit}>{l.unitPrice}</Text>
            <Text style={s.cAmount}>{l.amount}</Text>
          </View>
        ))}

        <View style={s.totals}>
          <View style={[s.totalRow, s.grand]}>
            <Text>Total</Text>
            <Text>{data.total}</Text>
          </View>
          {data.paid && (
            <View style={s.totalRow}>
              <Text style={s.muted}>Paid</Text>
              <Text style={s.muted}>{data.paid}</Text>
            </View>
          )}
          {data.outstanding && (
            <View style={s.totalRow}>
              <Text style={s.bold}>To pay</Text>
              <Text style={s.bold}>{data.outstanding}</Text>
            </View>
          )}
        </View>

        {w.iban && data.outstanding && (
          <View style={s.pay}>
            <Text style={s.label}>Payment</Text>
            <Text>
              IBAN <Text style={s.bold}>{w.iban}</Text>, reference {data.number}
            </Text>
          </View>
        )}

        {data.footer && <Text style={s.footer}>{data.footer}</Text>}
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(data: InvoiceData): Promise<Blob> {
  return pdf(<InvoiceDocument data={data} />).toBlob();
}
