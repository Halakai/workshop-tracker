import { describe, expect, it } from 'vitest';
import { bestManual, engineOf, findManuals, manualPrefixes, manualTitle, type ManualCar } from './manuals';

// names as the site spells them
const VW = [
  'volkswagen_golf_mk3',
  'volkswagen_golf_mk4',
  'volkswagen_golf_mk5',
  'volkswagen_golf_plus',
  'volkswagen_golf_gls_l4-19l_dsl_turbo_alh',
  'volkswagen_passat_b3',
  'volkswagen_passat_b5',
  'volkswagen_passat_b6',
  'volkswagen_passat_nms',
  'volkswagen_passat_sedan_l4-20l_dsl_turbo_bhw',
  'volkswagen_cc_357',
  'volkswagen_polo_mk4',
  'volkswagen_polo_india',
];
const best = (car: ManualCar, slugs: string[]) => {
  const b = bestManual(findManuals(car, slugs));
  return b && `${b.fit} ${b.slug}`;
};

describe('which manual fits a car', () => {
  it('goes by the generation', () => {
    expect(best({ make: 'Volkswagen', model: 'Passat', generation: 'B5.5 (3BG)', yearFrom: 2000, yearTo: 2005 }, VW)).toBe('exact volkswagen_passat_b5');
    expect(best({ make: 'Volkswagen', model: 'Passat', generation: 'B6 (3C)', yearFrom: 2005, yearTo: 2010 }, VW)).toBe('exact volkswagen_passat_b6');
    expect(best({ make: 'volkswagen', model: 'GOLF', generation: 'IV (1J)' }, VW)).toBe('exact volkswagen_golf_mk4');
    expect(best({ make: 'VW', model: 'Golf', generation: 'V (1K)' }, VW)).toBe('exact volkswagen_golf_mk5');
  });

  it('never offers another generation as the right one', () => {
    expect(best({ make: 'Volkswagen', model: 'Golf', generation: 'VIII (CD)', yearFrom: 2019 }, VW)).toBeNull();
    expect(best({ make: 'Volkswagen', model: 'Passat', generation: 'B9 (CJ)', yearFrom: 2023 }, VW)).toBeNull();
    expect(best({ make: 'Audi', model: 'A1', generation: 'GB', yearFrom: 2018 }, ['audi_a1'])).toBeNull();
    expect(best({ make: 'Opel', model: 'Astra', generation: 'K', yearFrom: 2015 }, ['vauxhall_astra', 'vauxhall_astra_h'])).toBeNull();
  });

  it('doesn’t mix up models that start alike', () => {
    expect(best({ make: 'Volkswagen', model: 'Golf Plus', generation: '5M' }, VW)).toBe('exact volkswagen_golf_plus');
    expect(findManuals({ make: 'Volkswagen', model: 'Golf', generation: 'IV (1J)' }, VW)[0].slug).toBe('volkswagen_golf_mk4');
    expect(best({ make: 'Volkswagen', model: 'Polo', generation: 'IV (9N)' }, VW)).toBe('exact volkswagen_polo_mk4');
  });

  it('knows cars under another name, and cars with the same technology', () => {
    expect(best({ make: 'Volkswagen', model: 'Bora', generation: '1J' }, VW)).toBe('exact volkswagen_golf_mk4');
    expect(best({ make: 'Volkswagen', model: 'Passat CC', generation: '35' }, VW)).toBe('exact volkswagen_cc_357');
    expect(best({ make: 'Audi', model: 'A4', generation: 'B6 (8E)' }, ['audi_a4_mk1', 'audi_a4_mk2'])).toBe('exact audi_a4_mk2');
    expect(best({ make: 'Peugeot', model: '407', generation: '6' }, ['citroen_c5_x7_2008_2017', 'peugeot_405_l4-1905cc_19l'])).toBe('related citroen_c5_x7_2008_2017');
    expect(best({ make: 'Opel', model: 'Zafira', generation: 'B' }, ['vauxhall_astra_g', 'vauxhall_astra_h'])).toBe('related vauxhall_astra_h');
  });

  it('goes by the years in a name', () => {
    const c5 = ['citroen_c5_2001_2004', 'citroen_c5_ii_2004_2008', 'citroen_c5_x7_2008_2017'];
    expect(best({ make: 'Citroën', model: 'C5', generation: 'I', year: 2002, yearFrom: 2001, yearTo: 2008 }, c5)).toBe('exact citroen_c5_2001_2004');
    expect(best({ make: 'Citroën', model: 'C5', generation: 'I', year: 2006, yearFrom: 2001, yearTo: 2008 }, c5)).toBe('exact citroen_c5_ii_2004_2008');
    expect(best({ make: 'Citroën', model: 'C5', generation: 'II', yearFrom: 2008, yearTo: 2017 }, c5)).toBe('exact citroen_c5_x7_2008_2017');
    const v70 = ['volvo_v70_1997_factory', 'volvo_v70_2000_factory', 'volvo_v70_2008_factory'];
    expect(best({ make: 'Volvo', model: 'V70', generation: 'II', yearFrom: 2000, yearTo: 2007 }, v70)).toBe('exact volvo_v70_2000_factory');
    const focus = ['ford_focus_1999_081998122004', 'ford_focus_200475_072004', 'ford_focus_2007_factory'];
    expect(best({ make: 'Ford', model: 'Focus', generation: 'I', yearFrom: 1998, yearTo: 2004 }, focus)).toBe('exact ford_focus_1999_081998122004');
    expect(best({ make: 'Ford', model: 'Focus', generation: 'III', yearFrom: 2011, yearTo: 2018 }, focus)).toBeNull();
  });

  it('finds the BMW with the car’s engine', () => {
    const e46 = ['bmw_3_series_e46_316i_n40_sal', 'bmw_3_series_e46_320d_m47_sal', 'bmw_3_series_e46_320d_m47tu_tour', 'bmw_3_series_e46_m3_s54_coupe', 'bmw_3_series_e90_320d_m47t2_sal'];
    expect(best({ make: 'BMW', model: '3 Series', generation: 'E46', engine: '320d 2.0 110 kW (150 HP)' }, e46)).toBe('exact bmw_3_series_e46_320d_m47_sal');
    expect(best({ make: 'BMW', model: '3 Series', generation: 'E46' }, e46)).not.toContain('m3');
  });

  it('says nothing about cars without a manual', () => {
    expect(best({ make: 'Renault', model: 'Megane', generation: 'II' }, ['renault_fuego_l4-1565cc_95_cid'])).toBeNull();
    expect(findManuals({ make: '', model: '' }, VW)).toEqual([]);
    expect(findManuals({ make: 'Volkswagen', model: '' }, VW)).toEqual([]);
  });

  it('looks for makes under the site’s names', () => {
    expect(manualPrefixes('Opel')).toEqual(['vauxhall']);
    expect(manualPrefixes('Škoda')).toEqual(['skoda']);
    expect(manualPrefixes('Mercedes-Benz')).toEqual(['mercedes_benz']);
    expect(manualPrefixes('Land Rover')).toContain('landrover');
    expect(manualPrefixes(null)).toEqual([]);
  });
});

describe('names of manuals', () => {
  it('reads well', () => {
    expect(manualTitle('volkswagen_passat_b5')).toBe('Volkswagen Passat B5');
    expect(manualTitle('skoda_octavia_mk2')).toBe('Škoda Octavia Mk2');
    expect(manualTitle('skoda_superb_ii')).toBe('Škoda Superb II');
    expect(manualTitle('citroen_c5_ii_2004_2008')).toBe('Citroën C5 II (2004–2008)');
    expect(manualTitle('bmw_3_series_e46_320d_m47tu_tour')).toBe('BMW 3 Series E46 320d M47TU Touring');
    expect(manualTitle('ford_focus_200475_072004')).toBe('Ford Focus (2004–)');
    expect(manualTitle('volkswagen_golf_gls_l4-19l_dsl_turbo_alh')).toBe('Volkswagen Golf Gls L4 1.9 diesel Turbo Alh');
  });
});

describe('the car’s engine', () => {
  it('is read from its name', () => {
    expect(engineOf({ engine: '1.9 TDI 96 kW (130 HP)', make: 'Volkswagen', year: 2003 })).toMatchObject({ displacement: 1.9, kw: 96, diesel: true, cylinders: 4, injection: 'unit' });
    expect(engineOf({ engine: 'V6 2.5 TDI 120 kW (163 HP)', make: 'Audi' })).toMatchObject({ displacement: 2.5, diesel: true, cylinders: 6 });
    expect(engineOf({ engine: '1.8 T 110 kW (150 HP)', make: 'Volkswagen' })).toMatchObject({ displacement: 1.8, diesel: false, valves: 5 });
    expect(engineOf({ engine: '1.4 16V 55 kW (75 HP)', make: 'Volkswagen' })).toMatchObject({ diesel: false, valves: 4 });
    expect(engineOf({ engine: '2.0 HDi 100 kW (136 HP)', make: 'Citroën' })).toMatchObject({ diesel: true, injection: null });
    expect(engineOf({ engine: '320d 2.0 110 kW (150 HP)', make: 'BMW' })).toMatchObject({ diesel: true, displacement: 2 });
  });

  it('tells VW’s unit injectors from the distributor pump', () => {
    expect(engineOf({ engine: '1.9 TDI 66 kW (90 HP)', make: 'Volkswagen', year: 1999 }).injection).toBe('pump');
    expect(engineOf({ engine: '1.9 TDI 81 kW (110 HP)', make: 'Škoda', year: 2000 }).injection).toBe('pump');
    expect(engineOf({ engine: '1.9 TDI 74 kW (100 HP)', make: 'Seat', year: 2002 }).injection).toBe('unit');
    expect(engineOf({ engine: '1.9 TDI 77 kW (105 HP)', make: 'Škoda', year: 2008 }).injection).toBe('unit');
  });

  it('is unknown when nothing is known', () => {
    expect(engineOf({ engine: null })).toMatchObject({ displacement: null, kw: null, diesel: null });
    expect(engineOf({ engine: null, fuel: 'Diesel' }).diesel).toBe(true);
  });
});
