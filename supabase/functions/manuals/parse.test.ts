import { describe, expect, it } from 'vitest';
import { SLUG, UnreadableManual, decodeEntities, indexUrl, parseManual, parseManualList } from './parse';

const loc = (path: string) => `<url><loc>https://workshop-manuals.com/${path}</loc></url>`;

const sitemap = `<?xml version="1.0"?><urlset>
${loc('volkswagen/passat-b5/fullindex/')}
${loc('volkswagen/passat-b5/fullindex/chapter-1/')}
${loc('volkswagen/passat-b5/engine/oil/oil_capacities/')}
${loc('volkswagen/passat-b5/engine/belt/toothed_belt/')}
${loc('volkswagen/passat-b5/brake_systems/pads/brake_pads/')}
${loc('skoda/octavia/not_ours/')}
</urlset>`;

const html = `<nav class="crumbs" aria-label="Breadcrumb"><ol><li>
  <a href="https://workshop-manuals.com/volkswagen/">Volkswagen</a></li></ol></nav>
<ul class="chap"><li class="g-eng"><a href="/volkswagen/passat-b5/engine/oil/oil_capacities/"><i></i><b>01</b><span>Engine &amp; oil</span></a></li>
<li class="g-brake"><a href="/volkswagen/passat-b5/brake_systems/pads/brake_pads/"><i></i><b>02</b><span>Brake systems</span></a></li>
<li class="g-new"><a href="/volkswagen/passat-b5/not/there/"><i></i><b>03</b><span>Missing</span></a></li></ul>
<h1 class="h1">Passat B5 (1996-2005): chapter index</h1>`;

describe('the list of manuals', () => {
  it('takes the manuals’ names and nothing else', () => {
    const xml = `<sitemapindex>
      <sitemap><loc>https://workshop-manuals.com/sitemap-core.xml</loc></sitemap>
      <sitemap><loc>https://workshop-manuals.com/sitemap-volkswagen_passat_b5.xml</loc></sitemap>
      <sitemap><loc>https://workshop-manuals.com/sitemap-chrysler_town_&amp;_country_awd_v6-38l_vin_l.xml</loc></sitemap>
      <sitemap><loc>https://workshop-manuals.com/sitemap-audi_a4_mk1.xml</loc></sitemap>
      <sitemap><loc>https://workshop-manuals.com/sitemap-../evil.xml</loc></sitemap>
      <sitemap><loc>https://workshop-manuals.com/other.xml</loc></sitemap>
    </sitemapindex>`;
    expect(parseManualList(xml)).toEqual(['audi_a4_mk1', 'chrysler_town_&_country_awd_v6-38l_vin_l', 'volkswagen_passat_b5']);
  });

  it('only accepts names that can’t lead anywhere else', () => {
    for (const bad of ['', 'a', '../x', 'a/b', 'a b', 'A', 'x?y', 'https://x', '.hidden']) expect(SLUG.test(bad)).toBe(false);
    expect(SLUG.test('bmw_3_series_e46_320d_m47tu_tour')).toBe(true);
  });
});

describe('a manual', () => {
  it('becomes its title, chapters and pages', () => {
    expect(indexUrl(sitemap)).toBe('https://workshop-manuals.com/volkswagen/passat-b5/fullindex/');
    expect(parseManual('volkswagen_passat_b5', sitemap, html)).toEqual({
      slug: 'volkswagen_passat_b5',
      title: 'Volkswagen Passat B5 (1996-2005)',
      base: 'https://workshop-manuals.com/volkswagen/passat-b5/',
      chapters: [
        { title: 'Engine & oil', kind: 'eng', start: 0 },
        { title: 'Brake systems', kind: 'brake', start: 2 },
      ],
      pages: ['engine/oil/oil_capacities', 'engine/belt/toothed_belt', 'brake_systems/pads/brake_pads'],
    });
  });

  it('works when the pages spell the address differently from the list', () => {
    const bmw = `<urlset>${loc('bmw/3_Series_E46/320d_TOUR/fullindex/')}${loc('bmw/3_series_e46/320d_tour/1_repair/oil/')}</urlset>`;
    const manual = parseManual('bmw_x', bmw, '<li class="g-gen"><a href="/bmw/3_series_e46/320d_tour/1_repair/oil/"><span>Repair</span></a></li><h1>3 Series E46</h1>');
    expect(manual.base).toBe('https://workshop-manuals.com/bmw/3_series_e46/320d_tour/');
    expect(manual.pages).toEqual(['1_repair/oil']);
    expect(manual.chapters).toEqual([{ title: 'Repair', kind: 'gen', start: 0 }]);
  });

  it('keeps pages that come before the first chapter', () => {
    const only = html.replace(/<li class="g-eng">[\s\S]*?<\/li>/, '');
    expect(parseManual('x', sitemap, only).chapters).toEqual([
      { title: 'General', kind: 'gen', start: 0 },
      { title: 'Brake systems', kind: 'brake', start: 2 },
    ]);
  });

  it('refuses what it can’t read', () => {
    expect(() => parseManual('x', '<urlset></urlset>', html)).toThrow(UnreadableManual);
    expect(() => parseManual('x', `<urlset>${loc('a/b/fullindex/')}</urlset>`, html)).toThrow(UnreadableManual);
  });
});

describe('entities', () => {
  it('are decoded', () => {
    expect(decodeEntities('a &amp; b &#39;c&#x27; &unknown; &#0;')).toBe("a & b 'c' &unknown; &#0;");
  });
});
