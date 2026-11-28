// Serves each property on its own indexable address:
//   /property/<id>-<address-slug>
// It takes property.html (the page visitors already see) and adds, on the server,
// the page title, meta description, canonical link, social preview tags and
// schema.org structured data for that property. The visible page and its
// behaviour are unchanged; the browser script still fills in the details.
//
// Old addresses (/property.html?id=123 and /property-search/123) are sent here
// too and get a permanent (301) redirect to the new address.

const seo = require('../lib/listing-seo');

let cache = null;
function load() {
  // properties.json changes with each hourly feed update, which triggers a new
  // deployment, so reading it once per function instance is safe.
  if (!cache) cache = { list: seo.readProperties(), template: seo.readTemplate('property.html') };
  return cache;
}

function redirect(res, location) {
  res.statusCode = 301;
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600');
  res.end();
}

function headTags(p, list) {
  const title = seo.pageTitle(p, list);
  const desc = seo.metaDescription(p);
  const url = seo.propertyUrl(p);
  const image = Array.isArray(p.images) && p.images[0] ? p.images[0] : '';
  const e = seo.escHtml;
  const tags = [
    `<title>${e(title)}</title>`,
    `<meta name="description" content="${e(desc)}" />`,
    `<link rel="canonical" href="${e(url)}" />`,
    seo.isNonProduction() ? '<meta name="robots" content="noindex, nofollow" />' : '<meta name="robots" content="index, follow, max-image-preview:large" />',
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="GJS Dillon" />`,
    `<meta property="og:title" content="${e(title)}" />`,
    `<meta property="og:description" content="${e(desc)}" />`,
    `<meta property="og:url" content="${e(url)}" />`,
    image ? `<meta property="og:image" content="${e(image)}" />` : '',
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />`,
    `<script type="application/ld+json">${seo.jsonForScript(seo.structuredData(p, list))}</script>`
  ];
  return tags.filter(Boolean).join('\n  ');
}

// A slim GJS Dillon bar that only shows when someone opens a listing directly
// (for example from Google). Inside the Squarespace embed it stays hidden, so
// the page looks exactly as it does today.
const STANDALONE = `
<script>(function(){try{if(window.self===window.top)document.documentElement.classList.add('gjs-standalone');}catch(e){}})();</script>
<style>
  .gjs-site-bar{display:none}
  html.gjs-standalone .gjs-site-bar{display:block;background:#141414;color:#fff;font-family:'Roboto',Arial,sans-serif}
  .gjs-site-bar .in{max-width:1180px;margin:0 auto;padding:12px 32px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
  .gjs-site-bar .brand{font-family:'CenturyGothicGJS','Century Gothic',sans-serif;font-size:20px;letter-spacing:.02em;color:#fff}
  .gjs-site-bar .brand b{color:#F5B400;font-weight:400}
  .gjs-site-bar nav{display:flex;gap:20px;font-size:14px;font-weight:500}
  .gjs-site-bar nav a{color:#fff;opacity:.85}
  .gjs-site-bar nav a:hover{opacity:1;color:#F5B400}
  @media (max-width:520px){.gjs-site-bar .in{padding:10px 16px}.gjs-site-bar nav{gap:14px;font-size:13px}}
</style>
<div class="gjs-site-bar"><div class="in">
  <a class="brand" href="${seo.MAIN_SITE}/"><b>GJS</b> Dillon</a>
  <nav><a href="/">All properties</a><a href="${seo.MAIN_SITE}/">gjsdillon.co.uk</a></nav>
</div></div>`;

function renderProperty(p, template, list) {
  const e = seo.escHtml;
  let html = template;
  html = html.replace(/<title>[\s\S]*?<\/title>/i, headTags(p, list));
  html = html.replace(/<body>/i, '<body>' + STANDALONE);
  // Put the key facts in the first HTML response as well (the script fills the rest).
  html = html.replace('<h1 class="hero-title" id="prop-title">Property</h1>',
    `<h1 class="hero-title" id="prop-title">${e(p.address || 'Property')}</h1>`);
  html = html.replace('<p class="hero-desc" id="prop-desc-hero"></p>',
    `<p class="hero-desc" id="prop-desc-hero">${e(seo.heroSentence(p))}</p>`);
  return html;
}

function renderNotFound() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" />
<title>Property no longer available | GJS Dillon</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<style>body{margin:0;font-family:Roboto,Arial,sans-serif;color:#1C1C1C}.w{max-width:640px;margin:0 auto;padding:80px 24px}h1{font-family:'Century Gothic',sans-serif;font-weight:300}a.b{display:inline-block;background:#F5B400;color:#141414;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600}</style>
</head><body><div class="w"><h1>This property is no longer listed</h1>
<p>It may have been let or sold. Take a look at what is available now.</p>
<p><a class="b" href="/">See all properties</a></p></div></body></html>`;
}

module.exports = (req, res) => {
  const { list, template } = load();
  const q = req.query || {};
  const param = q.slug || q.id || '';
  const id = seo.idFromParam(param);

  if (!id) return redirect(res, '/');

  const p = list.find(x => String(x.id) === id);
  if (!p) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
    return res.end(renderNotFound());
  }

  const wanted = seo.propertyPath(p);
  // Old address styles, or a slug that no longer matches the address: 301 to the one true address.
  if (q.legacy || decodeURIComponent(String(q.slug || '')) !== wanted.replace('/property/', '')) {
    return redirect(res, wanted);
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400');
  if (seo.isNonProduction()) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.end(renderProperty(p, template, list));
};

module.exports.renderProperty = renderProperty;
