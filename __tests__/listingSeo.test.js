/**
 * @jest-environment node
 */
const seo = require('../lib/listing-seo');
const listing = require('../api/listing');
const sitemap = require('../api/sitemap');

function call(handler, query) {
  return new Promise(resolve => {
    const res = {
      statusCode: 200, headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      end(body) { resolve({ code: this.statusCode, headers: this.headers, body: body || '' }); }
    };
    handler({ query, headers: {} }, res);
  });
}

const list = seo.readProperties();
const first = list[0];

describe('listing pages', () => {
  it('gives every property a unique address and title', () => {
    expect(new Set(list.map(seo.propertyPath)).size).toBe(list.length);
    expect(new Set(list.map(p => seo.pageTitle(p, list))).size).toBe(list.length);
  });

  it('keeps titles and descriptions within search-result lengths', () => {
    for (const p of list) {
      expect(seo.pageTitle(p, list).length).toBeLessThanOrEqual(70);
      expect(seo.metaDescription(p).length).toBeLessThanOrEqual(160);
    }
  });

  it('renders title, description, canonical and structured data on the server', async () => {
    const r = await call(listing, { slug: seo.propertyPath(first).replace('/property/', '') });
    expect(r.code).toBe(200);
    expect(r.body).toContain('<title>' + seo.escHtml(seo.pageTitle(first, list)) + '</title>');
    expect(r.body).toContain('<link rel="canonical" href="' + seo.propertyUrl(first) + '"');
    const ld = JSON.parse(r.body.match(/application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    expect(ld[0]['@type']).toBe('RealEstateListing');
    expect(ld[0].url).toBe(seo.propertyUrl(first));
  });

  it('301s old and partial addresses to the one true address', async () => {
    const want = seo.propertyPath(first);
    for (const q of [{ slug: String(first.id) }, { id: String(first.id), legacy: '1' }]) {
      const r = await call(listing, q);
      expect(r.code).toBe(301);
      expect(r.headers.Location).toBe(want);
    }
  });

  it('returns a real 404 for a property that has gone', async () => {
    const r = await call(listing, { slug: '1-gone' });
    expect(r.code).toBe(404);
  });

  it('lists every property in the sitemap', async () => {
    const r = await call(sitemap, {});
    expect((r.body.match(/<url>/g) || []).length).toBe(list.length + 1);
  });

  it('matches the browser slug helper in index.html', () => {
    const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
    const src = html.match(/function gjsSlugify[\s\S]*?\n/)[0] + html.match(/function gjsPropertyPath[\s\S]*?\n/)[0];
    const fn = new Function(src + '; return gjsPropertyPath;')();
    for (const p of list) expect(fn(p)).toBe(seo.propertyPath(p));
  });
});
