// Made-up data for the demo (demo.html): a small workshop with two partners.
type Row = Record<string, unknown>;

const ME = '00000000-0000-4000-8000-000000000001';
const PARTNER = '00000000-0000-4000-8000-000000000002';
const WALLET = '00000000-0000-4000-8000-0000000000a0';
const OUTSIDE = '00000000-0000-4000-8000-0000000000a1';
const day = (ago: number) => new Date(Date.now() - ago * 86_400_000).toISOString().slice(0, 10);
const stamps = (ago = 20): Row => ({ created_at: `${day(ago)}T09:00:00Z`, created_by: ME, updated_at: `${day(ago)}T09:00:00Z`, updated_by: ME });
let n = 100;
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

export const DEMO_USER = { id: ME, email: 'demo@example.com' };

const profiles: Row[] = [
  { id: ME, display_name: 'Ivan', email: 'demo@example.com', role: 'admin', is_active: true, default_share_bp: 5000, ...stamps(200) },
  { id: PARTNER, display_name: 'Marko', email: 'marko@example.com', role: 'member', is_active: true, default_share_bp: 5000, ...stamps(200) },
];

const accounts: Row[] = [
  { id: WALLET, kind: 'wallet', partner_id: null, ...stamps(200) },
  { id: OUTSIDE, kind: 'external', partner_id: null, ...stamps(200) },
  { id: id(), kind: 'partner', partner_id: ME, ...stamps(200) },
  { id: id(), kind: 'partner', partner_id: PARTNER, ...stamps(200) },
];

const contacts: Row[] = [
  { id: id(), name: 'Ana Horvat', phone: '091 234 5678', notes: null, ...stamps() },
  { id: id(), name: 'Petar Novak', phone: '098 765 4321', notes: null, ...stamps() },
  { id: id(), name: 'Auto Kuća Sjever', phone: null, notes: null, ...stamps() },
];
const contact = (i: number) => ({ id: contacts[i].id, name: contacts[i].name, phone: contacts[i].phone });

const car = (ref: string, values: Row): Row => ({
  id: id(),
  ref,
  asking_price_cents: null,
  buyer_id: null,
  buyer: null,
  colour: 'Grey',
  fuel: 'Diesel',
  listing_url: null,
  mileage_km: 214000,
  notes: null,
  purchase_date: day(40),
  sale_date: null,
  sale_mileage_km: null,
  seller_id: contacts[2].id,
  seller: contact(2),
  settled_at: null,
  status_changed_at: `${day(30)}T09:00:00Z`,
  vin: null,
  ...stamps(40),
  ...values,
});
const cars: Row[] = [
  car('CAR-003', { make: 'Volkswagen', model: 'Golf', generation: 'IV (1J)', year: 2002, engine: '1.9 TDI 96 kW (130 HP)', plate: 'ZG1234AB', status: 'in_repair' }),
  car('CAR-002', { make: 'Škoda', model: 'Octavia', generation: 'II (1Z)', year: 2008, engine: '1.9 TDI 77 kW (105 HP)', plate: 'ČK555CD', status: 'listed', asking_price_cents: 420000 }),
  car('CAR-001', { make: 'BMW', model: '3 Series', generation: 'E46', year: 2003, engine: '320d 2.0 110 kW (150 HP)', plate: null, status: 'sold', sale_date: day(60), buyer: contact(0), settled_at: `${day(50)}T09:00:00Z` }),
];
const car_summaries: Row[] = [
  { car_id: cars[0].id, purchase_cents: 90000, stock_cents: 8200, parts_cents: 21500, other_costs_cents: 4300, sale_cents: 0, sale_count: 0 },
  { car_id: cars[1].id, purchase_cents: 260000, stock_cents: 4100, parts_cents: 38000, other_costs_cents: 9000, sale_cents: 0, sale_count: 0 },
  { car_id: cars[2].id, purchase_cents: 180000, stock_cents: 6000, parts_cents: 42000, other_costs_cents: 7000, sale_cents: 310000, sale_count: 1 },
];

const job = (ref: string, customer: number, values: Row): Row => ({
  id: id(),
  ref,
  customer_id: contacts[customer].id,
  customer: contact(customer),
  car_vin: null,
  done_on: null,
  invoice_date: null,
  invoice_number: null,
  notes: null,
  settled_at: null,
  ...stamps(6),
  ...values,
});
const jobs: Row[] = [
  job('JOB-012', 0, { car_make: 'Volkswagen', car_model: 'Passat', car_generation: 'B5.5 (3BG)', car_year: 2003, car_engine: '1.9 TDI 96 kW (130 HP)', car_plate: 'VŽ987XY', description: 'Big service: timing belt, water pump, all filters', labor_price_cents: 18000, status: 'open' }),
  job('JOB-011', 1, { car_make: 'Renault', car_model: 'Megane', car_generation: 'II', car_year: 2006, car_engine: '1.5 dCi 78 kW (106 HP)', car_plate: 'KR321EF', description: 'Front brake discs and pads', labor_price_cents: 6000, status: 'done', done_on: day(3) }),
];
const job_summaries: Row[] = [
  { job_id: jobs[0].id, lines_cents: 23400, labor_cents: 18000, payments_cents: 0, stock_cents: 0, parts_cents: 17900 },
  { job_id: jobs[1].id, lines_cents: 11500, labor_cents: 6000, payments_cents: 0, stock_cents: 0, parts_cents: 8200 },
];
const job_lines: Row[] = [
  { id: id(), job_id: jobs[0].id, kind: 'bought', description: 'Timing belt kit with water pump', qty: 1, unit: null, sale_price_cents: 16900, movement: null, purchase: { id: id(), amount_cents: 13200, from_account_id: WALLET, counterparty: 'Tokić', occurred_on: day(5) }, ...stamps(5) },
  { id: id(), job_id: jobs[0].id, kind: 'bought', description: 'Filters: oil, air, fuel, pollen', qty: 1, unit: null, sale_price_cents: 6500, movement: null, purchase: { id: id(), amount_cents: 4700, from_account_id: WALLET, counterparty: 'Tokić', occurred_on: day(5) }, ...stamps(5) },
];

const category = { id: id(), name: 'Filters', code: 'FIL' };
const unit = { id: id(), name: 'pcs', whole_only: true };
const item = (name: string, part_number: string, qty: number, min: number, value: number): Row => ({
  id: id(),
  name,
  part_number,
  archived_at: null,
  brand_id: null,
  brand: { id: id(), name: 'MANN', code: 'MANN' },
  category_id: category.id,
  category,
  unit_id: unit.id,
  unit,
  location: 'Shelf A2',
  manufacturer_ref: null,
  min_qty: min,
  notes: null,
  qty_on_hand: qty,
  stock_value_cents: value,
  version: 1,
  ...stamps(90),
});
const items: Row[] = [
  item('Oil filter 1.9 TDI PD', 'FIL-MANN-001', 1, 2, 700),
  item('Air filter Octavia II', 'FIL-MANN-002', 4, 1, 4400),
  item('Engine oil 5W-40 VW 505.01', 'FLD-CAST-001', 12, 5, 8400),
];

const tool = (name: string, code: string, values: Row = {}): Row => ({
  id: id(),
  name,
  code,
  bought_from: null,
  bought_on: null,
  brand_id: null,
  brand: null,
  category_id: id(),
  category: { id: id(), name: 'Hand tools', sort_order: 1 },
  condition: 'good',
  gone_on: null,
  gone_reason: null,
  lent_on: null,
  lent_to: null,
  location: 'Cabinet 1',
  model: null,
  notes: null,
  owner_id: null,
  payment: null,
  price_cents: 4500,
  qty: 1,
  serial_number: null,
  transaction_id: null,
  warranty_until: null,
  ...stamps(90),
  ...values,
});
const tools: Row[] = [tool('Torque wrench 40–200 Nm', 'T-001'), tool('PD locking tool set T10050', 'T-002', { lent_to: 'Marko', lent_on: day(12) }), tool('Spring compressor', 'T-003')];

const txn = (values: Row): Row => ({
  id: id(),
  car_id: null,
  car: null,
  job_id: null,
  counterparty: null,
  currency: 'EUR',
  description: null,
  expense_category_id: null,
  expense_category: null,
  settlement_id: null,
  ...stamps(10),
  ...values,
});
const carOf = (c: Row) => ({ id: c.id, ref: c.ref, make: c.make, model: c.model, year: c.year });
const transactions: Row[] = [
  txn({ kind: 'deposit', category: 'deposit', amount_cents: 300000, from_account_id: accounts[2].id, to_account_id: WALLET, occurred_on: day(190) }),
  txn({ kind: 'income', category: 'car_sale', amount_cents: 310000, from_account_id: OUTSIDE, to_account_id: WALLET, occurred_on: day(60), car_id: cars[2].id, car: carOf(cars[2]), counterparty: 'Ana Horvat' }),
  txn({ kind: 'expense', category: 'car_purchase', amount_cents: 260000, from_account_id: WALLET, to_account_id: OUTSIDE, occurred_on: day(45), car_id: cars[1].id, car: carOf(cars[1]), description: 'Purchase' }),
  txn({ kind: 'expense', category: 'car_purchase', amount_cents: 90000, from_account_id: WALLET, to_account_id: OUTSIDE, occurred_on: day(40), car_id: cars[0].id, car: carOf(cars[0]), description: 'Purchase', counterparty: 'Auto Kuća Sjever' }),
  txn({ kind: 'expense', category: 'car_part', amount_cents: 21500, from_account_id: WALLET, to_account_id: OUTSIDE, occurred_on: day(22), car_id: cars[0].id, car: carOf(cars[0]), description: 'Front struts, pair', counterparty: 'Tokić' }),
  txn({ kind: 'expense', category: 'workshop_expense', amount_cents: 8900, from_account_id: WALLET, to_account_id: OUTSIDE, occurred_on: day(9), description: 'Electricity' }),
  txn({ kind: 'expense', category: 'job_part', amount_cents: 13200, from_account_id: WALLET, to_account_id: OUTSIDE, occurred_on: day(5), job_id: jobs[0].id, description: 'Timing belt kit', counterparty: 'Tokić' }),
];

const makes: [string, string, [string, [string, number, number, [string, string][]][]][]][] = [
  [
    'Volkswagen',
    'volkswagen.svg',
    [
      ['Golf', [['IV (1J)', 1997, 2003, [['1.9 TDI 96 kW (130 HP)', 'Diesel'], ['1.4 16V 55 kW (75 HP)', 'Petrol']]], ['V (1K)', 2003, 2008, [['1.9 TDI 77 kW (105 HP)', 'Diesel']]]]],
      ['Passat', [['B5 (3B)', 1996, 2000, [['1.9 TDI 81 kW (110 HP)', 'Diesel']]], ['B5.5 (3BG)', 2000, 2005, [['1.9 TDI 96 kW (130 HP)', 'Diesel'], ['1.8 T 110 kW (150 HP)', 'Petrol'], ['V6 2.5 TDI 120 kW (163 HP)', 'Diesel']]], ['B6 (3C)', 2005, 2010, [['2.0 TDI 103 kW (140 HP)', 'Diesel']]]]],
    ],
  ],
  ['Škoda', 'skoda.svg', [['Octavia', [['I (1U)', 1996, 2010, [['1.9 TDI 66 kW (90 HP)', 'Diesel']]], ['II (1Z)', 2004, 2013, [['1.9 TDI 77 kW (105 HP)', 'Diesel'], ['2.0 TDI 103 kW (140 HP)', 'Diesel']]]]]]],
  ['BMW', 'bmw.svg', [['3 Series', [['E46', 1998, 2006, [['320d 2.0 110 kW (150 HP)', 'Diesel']]]]]]],
  ['Opel', 'opel.svg', [['Astra', [['H', 2004, 2010, [['1.9 CDTI 88 kW (120 HP)', 'Diesel']]]]]]],
  ['Renault', 'renault.svg', [['Megane', [['II', 2002, 2009, [['1.5 dCi 78 kW (106 HP)', 'Diesel']]]]]]],
];
const car_makes: Row[] = [];
const car_models: Row[] = [];
const car_generations: Row[] = [];
for (const [name, logo, models] of makes) {
  const make = { id: id(), name, logo };
  car_makes.push(make);
  for (const [modelName, generations] of models) {
    const model = { id: id(), make_id: make.id, name: modelName };
    car_models.push(model);
    for (const [gen, from, to, engines] of generations) {
      car_generations.push({
        id: id(),
        model_id: model.id,
        name: gen,
        year_from: from,
        year_to: to,
        engines: engines.map(([engine, fuel]) => ({ id: id(), name: engine, fuel, power_kw: Number(/(\d+) kW/.exec(engine)?.[1] ?? 0) })),
      });
    }
  }
}

const activity_log: Row[] = [
  { id: id(), at: `${day(0)}T08:12:00Z`, actor_id: ME, entity_type: 'job', entity_id: jobs[0].id, action: 'created', summary: 'Job JOB-012 added: Ana Horvat, Volkswagen Passat' },
  { id: id(), at: `${day(3)}T16:40:00Z`, actor_id: PARTNER, entity_type: 'job', entity_id: jobs[1].id, action: 'status', summary: 'Job JOB-011 is done' },
  { id: id(), at: `${day(12)}T10:05:00Z`, actor_id: PARTNER, entity_type: 'tool', entity_id: tools[1].id, action: 'lent', summary: 'PD locking tool set T10050 lent to Marko' },
];

export const DEMO_TABLES: Record<string, Row[]> = {
  profiles,
  accounts,
  contacts,
  cars,
  car_summaries,
  jobs,
  job_summaries,
  job_lines,
  items,
  tools,
  transactions,
  car_makes,
  car_models,
  car_generations,
  activity_log,
  car_manuals: [],
  car_shares: cars.flatMap((c) => [ME, PARTNER].map((p) => ({ car_id: c.id, partner_id: p, share_bp: 5000 }))),
  job_shares: jobs.flatMap((j) => [ME, PARTNER].map((p) => ({ job_id: j.id, partner_id: p, share_bp: 5000 }))),
  settings: [{ id: true, workshop_name: 'Demo workshop', address: null, email: null, iban: null, invoice_footer: null, invoice_title: 'Invoice', last_export_at: `${day(3)}T09:00:00Z`, logo_data_url: null, phone: null, website: null, ...stamps(200) }],
};
