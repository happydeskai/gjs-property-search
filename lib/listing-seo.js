// Shared helpers for the search-engine friendly listing pages.
//
// Each property gets its own address on the firm's domain, e.g.
//   https://listings.gjsdillon.co.uk/property/426611-31-pump-street-worcester
// with a proper <title>, meta description, canonical link and structured data
// (schema.org RealEstateListing) rendered on the server, so Google credits the
// listing to gjsdillon.co.uk instead of a vercel.app address.

const fs = require('fs');
const path = require('path');

// The address Google should treat as the real home of the listings.
// Override with the SITE_ORIGIN environment variable if the domain ever changes.
const SITE_ORIGIN = (process.env.SITE_ORIGIN || 'https://listings.gjsdillon.co.uk').replace(/\/+$/, '');
const MAIN_SITE = 'https://www.gjsdillon.co.uk';

const ROOT = path.join(__dirname, '..');

function readProperties() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'properties.json'), 'utf8'));
}

function readTemplate(name) {
  return fs.readFileSync(path.join(ROOT, name), 'utf8');
}

// Same rules as slugify() in index.html and property.html: keep them in sync.
function slugify(s) {
  return String(s || '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

function propertyPath(p) {
  const slug = slugify([p.address, p.town].filter(Boolean).join(' '));
  return '/property/' + encodeURIComponent(String(p.id)) + (slug ? '-' + slug : '');
}

function propertyUrl(p) {
  return SITE_ORIGIN + propertyPath(p);
}

// Pulls the numeric listing id out of "426611-31-pump-street-worcester" or "426611".
function idFromParam(param) {
  const m = String(param || '').match(/^(\d+)/);
  return m ? m[1] : null;
}

function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// JSON inside <script> must not be able to close the tag.
function jsonForScript(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

function tenureLabel(p) {
  if (p.to_let && p.for_sale) return 'To Let / For Sale';
  if (p.to_let) return 'To Let';
  if (p.for_sale) return 'For Sale';
  return '';
}

function typeLabel(p) {
  const t = Array.isArray(p.types) ? p.types.filter(Boolean) : [];
  return t.length ? t.join(' & ') : 'Commercial property';
}

function sizeLabel(p) {
  const a = Number(p.size_from_sqft) || 0;
  const b = Number(p.size_to_sqft) || 0;
  const fmt = n => n.toLocaleString('en-GB');
  if (a && b && a !== b) return fmt(Math.min(a, b)) + ' - ' + fmt(Math.max(a, b)) + ' sq ft';
  if (a || b) return fmt(a || b) + ' sq ft';
  return '';
}

function priceLabel(p) {
  const parts = [];
  if (p.to_let && p.rent) parts.push(String(p.rent));
  if (p.for_sale && p.price) parts.push(String(p.price));
  return parts.join(' / ');
}

function truncate(s, max) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.-]+$/, '') + '…';
}

// e.g. "Retail To Let, 31 Pump Street, Worcester | GJS Dillon"
// When two listings share an address and type (e.g. two office suites in one
// building), pass the full list and the size is added so each title is unique.
function pageTitle(p, list) {
  const what = [typeLabel(p), tenureLabel(p)].filter(Boolean).join(' ');
  let where = [p.address, p.town].filter(Boolean).join(', ');
  if (Array.isArray(list) && sizeLabel(p) && list.some(q => q !== p && q.address === p.address
      && q.town === p.town && typeLabel(q) === typeLabel(p) && tenureLabel(q) === tenureLabel(p))) {
    where += ' (' + sizeLabel(p) + ')';
  }
  const full = what + ', ' + where + ' | GJS Dillon';
  if (full.length <= 70) return full;
  const shorter = what + ', ' + where;
  return shorter.length <= 70 ? shorter : truncate(shorter, 70);
}

// e.g. "Retail premises in central location. 583 sq ft to let in Worcester, £15,000 per annum. GJS Dillon."
function metaDescription(p) {
  const bits = [];
  const summary = String(p.summary || '').trim().replace(/[.\s]+$/, '');
  if (summary) bits.push(summary + '.');
  const size = sizeLabel(p);
  const ten = tenureLabel(p).toLowerCase();
  const line = [size, ten, p.town ? 'in ' + p.town : ''].filter(Boolean).join(' ');
  const price = priceLabel(p);
  if (line) bits.push(line.charAt(0).toUpperCase() + line.slice(1) + (price ? ', ' + price : '') + '.');
  if (String(p.status || '').toLowerCase() === 'under offer') bits.push('Under offer.');
  bits.push('GJS Dillon commercial property.');
  return truncate(bits.join(' '), 160);
}

function heroSentence(p) {
  if (!p.description) return '';
  const s = String(p.description).match(/[^.!?]+[.!?]+/g) || [];
  return s.length ? s[0].trim() : String(p.description);
}

// Only a single, plain amount ("£725,000", "£800,000 Offers Over"). Ranges, "per sq ft"
// and "On Application" return null so we never state a wrong price to Google.
function numberFromMoney(s) {
  const t = String(s || '').replace(/,/g, '');
  const all = t.match(/£\s*\d+(?:\.\d+)?/g) || [];
  if (all.length !== 1 || /sq\s*ft|psf|per\s*sq/i.test(t)) return null;
  return Number(all[0].replace(/[£\s]/g, ''));
}

function structuredData(p, list) {
  const url = propertyUrl(p);
  const address = {
    '@type': 'PostalAddress',
    streetAddress: p.address || undefined,
    addressLocality: p.town || undefined,
    postalCode: p.postcode || undefined,
    addressRegion: 'Worcestershire',
    addressCountry: 'GB'
  };
  const place = {
    '@type': 'Place',
    name: [p.address, p.town].filter(Boolean).join(', '),
    address
  };
  if (Number.isFinite(p.lat) && Number.isFinite(p.lon)) {
    place.geo = { '@type': 'GeoCoordinates', latitude: p.lat, longitude: p.lon };
  }
  const size = Number(p.size_to_sqft) || Number(p.size_from_sqft) || 0;
  if (size) {
    place.floorSize = { '@type': 'QuantitativeValue', value: size, unitCode: 'FTK', unitText: 'sq ft' };
  }

  const offers = [];
  const availability = String(p.status || '').toLowerCase() === 'under offer'
    ? 'https://schema.org/LimitedAvailability' : 'https://schema.org/InStock';
  const seller = { '@type': 'RealEstateAgent', name: 'GJS Dillon', url: MAIN_SITE + '/' };
  if (p.to_let) {
    const o = { '@type': 'Offer', businessFunction: 'http://purl.org/goodrelations/v1#LeaseOut', availability, seller, url };
    const rent = /per\s*annum|pa\b/i.test(String(p.rent || '')) ? numberFromMoney(p.rent) : null;
    if (rent) {
      o.priceSpecification = { '@type': 'UnitPriceSpecification', price: rent, priceCurrency: 'GBP', unitText: 'per annum' };
    }
    offers.push(o);
  }
  if (p.for_sale) {
    const o = { '@type': 'Offer', businessFunction: 'http://purl.org/goodrelations/v1#Sell', availability, seller, url };
    const price = numberFromMoney(p.price);
    if (price) { o.price = price; o.priceCurrency = 'GBP'; }
    offers.push(o);
  }

  const listing = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    '@id': url + '#listing',
    url,
    name: pageTitle(p, list).replace(/ \| GJS Dillon$/, ''),
    description: metaDescription(p),
    about: place,
    provider: seller
  };
  if (Array.isArray(p.images) && p.images.length) listing.image = p.images.slice(0, 6);
  if (p.last_updated) {
    const d = String(p.last_updated).replace(' ', 'T');
    if (!isNaN(Date.parse(d))) listing.dateModified = d.slice(0, 10);
  }
  if (offers.length) listing.offers = offers.length === 1 ? offers[0] : offers;

  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'GJS Dillon', item: MAIN_SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'Property search', item: SITE_ORIGIN + '/' },
      { '@type': 'ListItem', position: 3, name: [p.address, p.town].filter(Boolean).join(', '), item: url }
    ]
  };

  return JSON.parse(JSON.stringify([listing, breadcrumbs])); // drops undefined fields
}

// True on Vercel preview builds and local runs: those must never be indexed.
function isNonProduction() {
  return process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production';
}

module.exports = {
  SITE_ORIGIN, MAIN_SITE,
  readProperties, readTemplate,
  slugify, propertyPath, propertyUrl, idFromParam,
  escHtml, jsonForScript,
  pageTitle, metaDescription, heroSentence, tenureLabel, typeLabel, sizeLabel, priceLabel,
  structuredData, isNonProduction
};
