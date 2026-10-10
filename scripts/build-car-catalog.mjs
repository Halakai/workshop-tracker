// Builds the car catalogue migration (makes, models, generations, engines) from data/car-catalog/*.txt.
//   node scripts/build-car-catalog.mjs <migration file to write>
//
// Data format (one file per make or group of makes):
//   @Volkswagen | volkswagen.svg        a make, with its logo in public/car-logos/ (optional)
//   Golf                                a model (no indent)
//    IV (1J) 1997-2003                  a generation (1 space): name, then years ("2019-" = still made)
//     P: 1.4 16V 55/75; 1.6 74/100      engines (2 spaces): fuel code, then "name kW/PS" separated by ";"
//   Fuel codes: P petrol · D diesel · L LPG · C CNG · H hybrid · PH plug-in hybrid · E electric
//   Lines starting with # are comments.
// Engines are shown as "1.6 74 kW (100 HP)". The script refuses kW/PS pairs that don't fit (1 kW = 1.36 PS),
// which catches most typos.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const FUELS = { P: 'Petrol', D: 'Diesel', L: 'LPG', C: 'CNG', H: 'Hybrid', PH: 'Plug-in hybrid', E: 'Electric' };
const DIR = 'data/car-catalog';
const LOGOS = 'public/car-logos';
const THIS_YEAR = new Date().getFullYear();

const makes = [];
const errors = [];

for (const file of readdirSync(DIR).filter((f) => f.endsWith('.txt')).sort()) {
  let make = null;
  let model = null;
  let gen = null;
  readFileSync(join(DIR, file), 'utf8')
    .split(/\r?\n/)
    .forEach((raw, i) => {
      const where = `${file}:${i + 1}`;
      const line = raw.replace(/\s+$/, '');
      if (!line.trim() || line.trim().startsWith('#')) return;
      if (line.startsWith('@')) {
        const [name, logo] = line.slice(1).split('|').map((s) => s.trim());
        if (makes.some((m) => m.name.toLowerCase() === name.toLowerCase())) errors.push(`${where}: make ${name} twice`);
        if (logo && !existsSync(join(LOGOS, logo))) errors.push(`${where}: no logo file ${LOGOS}/${logo}`);
        make = { name, logo: logo || null, models: [] };
        makes.push(make);
        model = gen = null;
      } else if (!line.startsWith(' ')) {
        if (!make) return errors.push(`${where}: model before any make`);
        const name = line.trim();
        if (make.models.some((m) => m.name.toLowerCase() === name.toLowerCase())) errors.push(`${where}: model ${name} twice`);
        model = { name, gens: [] };
        make.models.push(model);
        gen = null;
      } else if (/^ \S/.test(line)) {
        if (!model) return errors.push(`${where}: generation before any model`);
        const m = /^ (.+?)\s+(\d{4})-(\d{4})?$/.exec(line);
        if (!m) return errors.push(`${where}: generation needs "name 1997-2003": ${line.trim()}`);
        const [, name, from, to] = m;
        const y1 = Number(from);
        const y2 = to ? Number(to) : null;
        if (y1 < 1945 || y1 > THIS_YEAR + 1 || (y2 !== null && (y2 < y1 || y2 > THIS_YEAR + 1))) errors.push(`${where}: odd years ${from}-${to ?? ''}`);
        if (model.gens.some((g) => g.name.toLowerCase() === name.toLowerCase())) errors.push(`${where}: generation ${name} twice`);
        gen = { name, from: y1, to: y2, engines: [] };
        model.gens.push(gen);
      } else {
        if (!gen) return errors.push(`${where}: engines before any generation`);
        const m = /^\s+(PH|[PDLCHE]):\s*(.+)$/.exec(line);
        if (!m) return errors.push(`${where}: engine line needs "P: name kW/PS; …": ${line.trim()}`);
        const fuel = FUELS[m[1]];
        for (const part of m[2].split(';').map((s) => s.trim()).filter(Boolean)) {
          const e = /^(.*?)\s*(\d{2,4})\/(\d{2,4})$/.exec(part);
          if (!e) {
            errors.push(`${where}: engine needs "name kW/PS": ${part}`);
            continue;
          }
          const [, label, kw, ps] = e;
          const ratio = Number(ps) / Number(kw);
          if (ratio < 1.33 || ratio > 1.4) errors.push(`${where}: ${part}: ${kw} kW is not ${ps} PS (should be about ${Math.round(kw * 1.3596)})`);
          const name = `${label ? label + ' ' : ''}${kw} kW (${ps} HP)`;
          if (gen.engines.some((x) => x.name.toLowerCase() === name.toLowerCase() && x.fuel === fuel)) {
            errors.push(`${where}: engine ${name} twice`);
            continue;
          }
          gen.engines.push({ name, fuel, kw: Number(kw) });
        }
      }
    });
}

for (const file of readdirSync(LOGOS).filter((f) => f.endsWith('.svg'))) {
  if (!makes.some((m) => m.logo === file)) errors.push(`${LOGOS}/${file} is not used by any make`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  console.error(`\n${errors.length} problem(s); nothing written.`);
  process.exit(1);
}

const q = (s) => (s === null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const rows = (list) => list.join(',\n  ');
const models = makes.flatMap((mk) => mk.models.map((mo) => ({ mk, mo })));
const gens = models.flatMap(({ mk, mo }) => mo.gens.map((g) => ({ mk, mo, g })));
const engines = gens.flatMap(({ mk, mo, g }) => g.engines.map((e) => ({ mk, mo, g, e })));

const sql = `-- Car makes, models, generations and engines for type-ahead on the car and job forms.
-- GENERATED by scripts/build-car-catalog.mjs from data/car-catalog/*.txt: change the data and rebuild, don't edit.
-- Rows that already exist (same name, ignoring case) are left alone, so this can be re-run safely.
-- ${makes.length} makes, ${models.length} models, ${gens.length} generations, ${engines.length} engines.

insert into public.car_makes (name, logo) values
  ${rows(makes.map((m) => `(${q(m.name)}, ${q(m.logo)})`))}
on conflict do nothing;

insert into public.car_models (make_id, name)
select mk.id, v.name
from (values
  ${rows(models.map(({ mk, mo }) => `(${q(mk.name)}, ${q(mo.name)})`))}
) as v (make, name)
join public.car_makes mk on lower(mk.name) = lower(v.make)
on conflict do nothing;

insert into public.car_generations (model_id, name, year_from, year_to)
select mo.id, v.name, v.year_from, v.year_to
from (values
  ${rows(gens.map(({ mk, mo, g }) => `(${q(mk.name)}, ${q(mo.name)}, ${q(g.name)}, ${g.from}, ${g.to ?? 'null::integer'})`))}
) as v (make, model, name, year_from, year_to)
join public.car_makes mk on lower(mk.name) = lower(v.make)
join public.car_models mo on mo.make_id = mk.id and lower(mo.name) = lower(v.model)
on conflict do nothing;

insert into public.car_engines (generation_id, name, fuel, power_kw)
select g.id, v.name, v.fuel, v.power_kw
from (values
  ${rows(engines.map(({ mk, mo, g, e }) => `(${q(mk.name)}, ${q(mo.name)}, ${q(g.name)}, ${q(e.name)}, ${q(e.fuel)}, ${e.kw})`))}
) as v (make, model, generation, name, fuel, power_kw)
join public.car_makes mk on lower(mk.name) = lower(v.make)
join public.car_models mo on mo.make_id = mk.id and lower(mo.name) = lower(v.model)
join public.car_generations g on g.model_id = mo.id and lower(g.name) = lower(v.generation)
on conflict do nothing;
`;

const out = process.argv[2];
if (!out) {
  console.log(`OK: ${makes.length} makes, ${models.length} models, ${gens.length} generations, ${engines.length} engines (pass a file name to write the migration).`);
} else {
  writeFileSync(out, sql);
  console.log(`Wrote ${out}: ${makes.length} makes, ${models.length} models, ${gens.length} generations, ${engines.length} engines.`);
}
