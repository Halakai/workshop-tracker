import { describe, expect, it } from 'vitest';
import { codeLetters, deriveCode, nextPartNumber, partNumberPrefix, partNumberTaken, suggest } from './codes';

describe('codes', () => {
  it('keeps letters and digits, drops accents', () => {
    expect(codeLetters('Liqui Moly')).toBe('LIQUIMOLY');
    expect(codeLetters('Škoda')).toBe('SKODA');
    expect(codeLetters('Đurđević')).toBe('DURDEVIC');
    expect(codeLetters('3M')).toBe('3M');
  });

  it('derives unique codes', () => {
    expect(deriveCode('Castrol', [])).toBe('CAST');
    expect(deriveCode('Bosch', ['BOSC'])).toBe('BOSC2');
    expect(deriveCode('Bosal', ['BOSC', 'BOSC2'])).toBe('BOSA');
    expect(deriveCode('Fluid', ['FLU'], 3)).toBe('FLU2');
    expect(deriveCode('Fluid', ['FLU', 'FLU2'], 3)).toBe('FLU3');
    expect(deriveCode('A', [])).toBe('AX');
    expect(deriveCode('!!', [])).toBe('XX');
  });

  it('builds part numbers from category and brand', () => {
    expect(partNumberPrefix('FLD', 'CAST')).toBe('FLD-CAST');
    expect(partNumberPrefix('PRT', null)).toBe('PRT');
  });

  it('continues numbering after the highest existing number', () => {
    expect(nextPartNumber('FLD-CAST', [])).toBe('FLD-CAST-001');
    expect(nextPartNumber('FLD-CAST', ['FLD-CAST-001', 'fld-cast-007', 'FLD-CASTX-009', 'PRT-001'])).toBe('FLD-CAST-008');
    expect(nextPartNumber('PRT', ['PRT-001', 'PRT-BOSC-005'])).toBe('PRT-002');
    expect(nextPartNumber('PRT', ['PRT-999'])).toBe('PRT-1000');
  });

  it('checks uniqueness case-insensitively', () => {
    expect(partNumberTaken('fld-cast-001', ['FLD-CAST-001'])).toBe(true);
    expect(partNumberTaken('FLD-CAST-002', ['FLD-CAST-001'])).toBe(false);
  });
});

describe('suggest', () => {
  const brands = ['Bosch', 'Castrol', 'Liqui Moly', 'Mobil', 'Bosal', 'Febi Bilstein'];

  it('shows prefix matches first, then contains', () => {
    expect(suggest('bo', brands)).toEqual(['Bosch', 'Bosal']);
    expect(suggest('skoda', ['Škoda', 'Seat'])).toEqual(['Škoda']);
    expect(suggest('il', brands)).toEqual(['Mobil', 'Febi Bilstein']);
    expect(suggest('mo', brands)).toEqual(['Mobil', 'Liqui Moly']);
  });

  it('shows everything (limited) for an empty query and hides an exact pick', () => {
    expect(suggest('', brands, 3)).toEqual(['Bosch', 'Castrol', 'Liqui Moly']);
    expect(suggest('Bosch', brands)).toEqual([]);
    expect(suggest('BOSCH', brands)).toEqual(['Bosch']);
  });
});
