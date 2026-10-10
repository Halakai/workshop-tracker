import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

describe('toCsv', () => {
  it('writes a header and rows with a BOM', () => {
    expect(toCsv([{ a: 1, b: 'x' }, { a: 2, b: 'y' }])).toBe('﻿a,b\r\n1,x\r\n2,y\r\n');
  });

  it('quotes commas, quotes and line breaks', () => {
    expect(toCsv([{ t: 'a,b' }, { t: 'say "hi"' }, { t: 'two\nlines' }])).toBe('﻿t\r\n"a,b"\r\n"say ""hi"""\r\n"two\nlines"\r\n');
  });

  it('writes nulls as empty and objects as JSON', () => {
    expect(toCsv([{ a: null, b: { x: 1 } }])).toBe('﻿a,b\r\n,"{""x"":1}"\r\n');
  });

  it('keeps Croatian letters and takes all columns of all rows', () => {
    expect(toCsv([{ name: 'Čedo' }, { name: 'Đuro', phone: '091' }])).toBe('﻿name,phone\r\nČedo,\r\nĐuro,091\r\n');
  });

  it('handles an empty table', () => {
    expect(toCsv([])).toBe('﻿');
  });
});
