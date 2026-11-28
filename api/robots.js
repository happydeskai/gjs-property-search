// /robots.txt: allow everything on the live domain and point to the sitemap.
// Preview builds are blocked so they never compete with the real listings.
const seo = require('../lib/listing-seo');

module.exports = (req, res) => {
  const allow = !seo.isNonProduction();
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600');
  res.end(allow
    ? 'User-agent: *\nAllow: /\n\nSitemap: ' + seo.SITE_ORIGIN + '/sitemap.xml\n'
    : 'User-agent: *\nDisallow: /\n');
};
