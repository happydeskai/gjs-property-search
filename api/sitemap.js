// /sitemap.xml: the property search page plus every listing on its own address.
// Rebuilt with each deployment, so it follows the hourly feed update.
const seo = require('../lib/listing-seo');

function lastmod(p) {
  const d = String(p.last_updated || '').replace(' ', 'T');
  return isNaN(Date.parse(d)) ? null : d.slice(0, 10);
}

module.exports = (req, res) => {
  const list = seo.readProperties();
  const dates = list.map(lastmod).filter(Boolean).sort();
  const urls = [
    { loc: seo.SITE_ORIGIN + '/', lastmod: dates[dates.length - 1] || null }
  ].concat(list.map(p => ({ loc: seo.propertyUrl(p), lastmod: lastmod(p) })));

  const body = '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.map(u => '  <url><loc>' + seo.escHtml(u.loc) + '</loc>'
        + (u.lastmod ? '<lastmod>' + u.lastmod + '</lastmod>' : '') + '</url>').join('\n')
    + '\n</urlset>\n';

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600');
  res.end(body);
};
