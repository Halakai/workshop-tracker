import { describe, expect, it } from 'vitest';
import {
  MANUAL_JOBS,
  alternatives,
  engineParts,
  forParts,
  gearboxParts,
  guessEngineParts,
  jobPages,
  manualJob,
  pageTitle,
  readManual,
  searchManual,
  webQuery,
  type ManualIndex,
} from './manualSearch';

// a small manual in the shape of a real one
const index: ManualIndex = {
  slug: 'volkswagen_passat_b5',
  title: 'Volkswagen Passat B5 (1996-2005)',
  base: 'https://workshop-manuals.com/volkswagen/passat-b5/',
  chapters: [
    { title: '4-cylinder injection engine (5-valve)', kind: 'eng', start: 0 },
    { title: '4-cylinder diesel engine with distributor-type injection pump', kind: 'eng', start: 2 },
    { title: '4-cylinder diesel engine with unit injector', kind: 'eng', start: 4 },
    { title: '5-speed manual gearbox 012/01W/0A9', kind: 'trans', start: 11 },
    { title: '5-speed automatic gearbox 01V', kind: 'trans', start: 13 },
    { title: 'Protect brake systems', kind: 'brake', start: 14 },
    { title: 'Brake systems', kind: 'brake', start: 15 },
    { title: 'Running gear', kind: 'steer', start: 19 },
  ],
  pages: [
    '4_cylinder_injection_engine_5_valve/cylinder_head/removing_installing_and_tensioning_toothed_belt',
    '4_cylinder_injection_engine_5_valve/lubrication/oil_capacities',
    '4_cylinder_diesel_engine_with_distributo/cylinder_head/removing_installing_and_tensioning_toothed_belt',
    '4_cylinder_diesel_engine_with_distributo/lubrication/oil_capacities',
    '4_cylinder_diesel_engine_with_unit_injec/technical_data/engine_data',
    '4_cylinder_diesel_engine_with_unit_injec/cylinder_head/removing_installing_and_tensioning_toothed_belt',
    '4_cylinder_diesel_engine_with_unit_injec/cylinder_head/removing_and_installing_cylinder_head',
    '4_cylinder_diesel_engine_with_unit_injec/lubrication/oil_capacities',
    '4_cylinder_diesel_engine_with_unit_injec/lubrication/assembly_overview_oil_filter_bracket',
    '4_cylinder_diesel_engine_with_unit_injec/cooling_system/removing_and_installing_coolant_pump',
    '4_cylinder_diesel_engine_with_unit_injec/cooling_system/draining_and_filling_coolant',
    '5_speed_manual_gearbox_012/clutch/removing_and_installing_clutch',
    '5_speed_manual_gearbox_012/clutch/bleeding_clutch_system',
    '5_speed_automatic_gearbox_01v/gearbox/removing_and_installing_gearbox',
    'protect_brake_systems/brakes/removing_and_installing_brake_pads',
    'brake_systems/repairing_front_brakes/removing_and_installing_brake_pads_brake_caliper_hp_2',
    'brake_systems/repairing_handbrake/adjusting_handbrake',
    'brake_systems/repairing_handbrake/removing',
    'brake_systems/repairing_handbrake/removing_2',
    'running_gear/front_axle/removing_and_installing_suspension_strut',
  ],
};
const car = { make: 'Volkswagen', model: 'Passat', generation: 'B5.5 (3BG)', year: 2003, engine: '1.9 TDI 96 kW (130 HP)', fuel: 'Diesel' };
const pages = readManual(index);
const unitInjector = '4-cylinder diesel engine with unit injector';
const titles = (list: { title: string }[]) => list.map((p) => p.title);

describe('titles', () => {
  it('are made from addresses', () => {
    expect(pageTitle('removing_and_installing_oil_sump')).toBe('Removing and installing oil sump');
    expect(pageTitle('4_ra__bmw_engine_oil_service_(m47tu)')).toBe('Bmw engine oil service (m47tu)');
    expect(pageTitle('11__engine_(m47tu)')).toBe('Engine (m47tu)');
    expect(pageTitle('j__engine_and_engine_aggregates')).toBe('Engine and engine aggregates');
    expect(pageTitle('checking_abs_and_esp')).toBe('Checking ABS and ESP');
    expect(pageTitle('removing_2', true)).toBe('Removing (2)');
    expect(pageTitle('brake_caliper_hp_2')).toBe('Brake caliper hp 2');
    expect(pageTitle('100%_wrong')).toBe('100% wrong');
  });
});

describe('reading a manual', () => {
  it('gives every page its address, headings, engine and gearbox', () => {
    const belt = pages.find((p) => p.engine === unitInjector && p.title.includes('toothed belt'))!;
    expect(belt.url).toBe('https://workshop-manuals.com/volkswagen/passat-b5/4_cylinder_diesel_engine_with_unit_injec/cylinder_head/removing_installing_and_tensioning_toothed_belt/');
    expect(belt.trail).toEqual(['Cylinder head']);
    expect(pages.find((p) => p.title === 'Removing and installing clutch')!.gearbox).toBe('5-speed manual gearbox 012/01W/0A9');
    expect(titles(pages)).toContain('Removing (2)');
    expect(titles(pages)).toContain('Removing and installing brake pads brake caliper hp 2');
  });

  it('leaves out the armoured cars', () => {
    expect(pages.some((p) => p.chapter.startsWith('Protect'))).toBe(false);
  });

  it('puts engine names cut in two by a slash together', () => {
    const octavia = readManual({
      ...index,
      chapters: [
        { title: 'Drive unit', kind: 'eng', start: 0 },
        { title: 'Engine lubrication', kind: 'eng', start: 3 },
      ],
      pages: [
        'drive_unit/1.9/77_kw_tdi_pd_engine/lubrication/oil_filter',
        'drive_unit/engine_2.0/103_kw_tdi_pd_2.0/lubrication/oil_filter',
        'drive_unit/1.6/85_kw_fsi_engine/lubrication/oil_filter',
        'engine_lubrication/2_0_81_103_125_kw_tdi_cr_engine/oil_sump',
      ],
    });
    expect(engineParts(octavia)).toEqual(['1.9/77 KW TDI PD engine', '2.0/103 KW TDI PD 2.0', '1.6/85 KW FSI engine', '2.0/81 103 125 KW TDI CR engine']);
    expect(octavia[0].trail).toEqual(['Lubrication']);
    expect(guessEngineParts(engineParts(octavia), { make: 'Škoda', engine: '1.9 TDI 77 kW (105 HP)', year: 2008 })).toEqual(['1.9/77 KW TDI PD engine']);
    expect(guessEngineParts(engineParts(octavia), { make: 'Škoda', engine: '2.0 TDI 125 kW (170 HP)', year: 2011 })).toEqual(['2.0/81 103 125 KW TDI CR engine']);
  });
});

describe('the car’s engine', () => {
  it('is guessed from the manual’s parts', () => {
    const parts = engineParts(pages);
    expect(parts).toHaveLength(3);
    expect(guessEngineParts(parts, car)).toEqual([unitInjector]);
    expect(guessEngineParts(parts, { ...car, engine: '1.9 TDI 66 kW (90 HP)', year: 1998 })).toEqual(['4-cylinder diesel engine with distributor-type injection pump']);
    expect(guessEngineParts(parts, { ...car, engine: '1.8 T 110 kW (150 HP)', fuel: 'Petrol' })).toEqual(['4-cylinder injection engine (5-valve)']);
    expect(guessEngineParts(parts, { make: 'Volkswagen', model: 'Passat' })).toEqual([]);
  });

  it('leaves out the other engines, and the other gearboxes once one is chosen', () => {
    const mine = forParts(pages, [unitInjector]);
    expect(mine.filter((p) => p.title === 'Oil capacities')).toHaveLength(1);
    expect(mine.filter((p) => p.gearbox)).toHaveLength(3);
    expect(gearboxParts(pages)).toHaveLength(2);
    expect(forParts(pages, [unitInjector, '5-speed manual gearbox 012/01W/0A9']).filter((p) => p.gearbox)).toHaveLength(2);
    expect(forParts(pages, [])).toHaveLength(pages.length);
    expect(forParts(pages, ['*'])).toHaveLength(pages.length);
  });
});

describe('searching', () => {
  const mine = forParts(pages, [unitInjector]);

  it('works in English, whatever the maker calls it', () => {
    expect(searchManual(mine, 'toothed belt')[0].title).toBe('Removing installing and tensioning toothed belt');
    expect(searchManual(mine, 'timing belt')[0].title).toBe('Removing installing and tensioning toothed belt');
    expect(searchManual(mine, 'water pump')[0].title).toBe('Removing and installing coolant pump');
  });

  it('works in Croatian, with or without the letters č, ć, š, ž', () => {
    expect(searchManual(mine, 'zupčasti remen')[0].title).toBe('Removing installing and tensioning toothed belt');
    expect(searchManual(mine, 'zupcasti remen')[0].title).toBe('Removing installing and tensioning toothed belt');
    expect(searchManual(mine, 'vodena pumpa')[0].title).toBe('Removing and installing coolant pump');
    expect(searchManual(mine, 'kočione pločice')[0].title).toContain('brake pads');
    expect(searchManual(mine, 'kvačilo')[0].title).toContain('clutch');
    expect(searchManual(mine, 'glava motora')[0].title).toBe('Removing and installing cylinder head');
    expect(searchManual(mine, 'ručna')[0].title).toBe('Adjusting handbrake');
  });

  it('shows the closest pages when none has every word', () => {
    expect(searchManual(mine, 'amortizer xyz')[0].title).toBe('Removing and installing suspension strut');
    expect(searchManual(mine, 'qqqq')).toEqual([]);
    expect(searchManual(mine, '  ')).toEqual([]);
  });

  it('knows other words for the same thing', () => {
    expect(alternatives('kočnice')).toContain('brake');
    expect(alternatives('pads')).toContain('pad');
    expect(alternatives('timing')).toContain('toothed');
  });
});

describe('jobs', () => {
  const mine = forParts(pages, [unitInjector]);
  const task = (job: string, label: string) => jobPages(mine, manualJob(job)!).find((t) => t.label === label)?.pages ?? [];

  it('gather the pages for a service', () => {
    expect(titles(task('small-service', 'Engine oil and filter'))).toEqual(['Oil capacities', 'Assembly overview oil filter bracket']);
    expect(titles(task('big-service', 'Timing belt or chain'))).toEqual(['Removing installing and tensioning toothed belt']);
    expect(titles(task('big-service', 'Water pump'))).toEqual(['Removing and installing coolant pump']);
    expect(titles(task('big-service', 'Coolant'))).toEqual(['Draining and filling coolant']);
    expect(titles(task('brakes', 'Pads'))).toEqual(['Removing and installing brake pads brake caliper hp 2']);
    expect(titles(task('brakes', 'Handbrake'))).toContain('Adjusting handbrake');
    expect(titles(task('clutch', 'Clutch'))).toContain('Removing and installing clutch');
    expect(titles(task('suspension', 'Shock absorbers and springs'))).toEqual(['Removing and installing suspension strut']);
  });

  it('leave out tasks without pages', () => {
    expect(jobPages(mine, manualJob('small-service')!).map((t) => t.label)).not.toContain('Pollen filter');
    expect(manualJob('nothing')).toBeUndefined();
    expect(new Set(MANUAL_JOBS.map((j) => j.id)).size).toBe(MANUAL_JOBS.length);
  });
});

describe('looking elsewhere', () => {
  it('asks for the car and the job', () => {
    expect(webQuery(car, 'timing belt replacement')).toBe('Volkswagen Passat B5.5 1.9 TDI timing belt replacement');
    expect(webQuery({ make: 'Opel', model: 'Astra', year: 2006 }, 'brakes')).toBe('Opel Astra 2006 brakes');
  });
});
