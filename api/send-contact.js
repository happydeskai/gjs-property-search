const nodemailer = require('nodemailer');

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function nl2br(str) {
  return escapeHtml(String(str || '')).replace(/\n/g, '<br>');
}
// UK postcode -> canonical "AA9A 9AA" form, or '' if it doesn't look like one.
function normalisePostcode(str) {
  const compact = String(str || '').toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(compact)) return '';
  return compact.slice(0, -3) + ' ' + compact.slice(-3);
}

const SMTP_HOST   = process.env.SMTP_HOST;
const SMTP_PORT   = Number(process.env.SMTP_PORT || 587);
const SMTP_USER   = process.env.SMTP_USER;
const SMTP_PASS   = process.env.SMTP_PASS;
const FROM_EMAIL  = process.env.FROM_EMAIL || 'bamboo.admin@gjsdillon.co.uk';
const TO_CONTACT  = process.env.TO_CONTACT || 'info@gjsdillon.co.uk';
// CRM intake address (Flight). Currently the UAT/test system — set the TO_CRM env var
// in Vercel to switch to the live address. Comma-separate for multiple recipients,
// or set it to an empty string to turn the CRM copy off entirely.
const TO_CRM      = process.env.TO_CRM === undefined
  ? '6aa15b6a07cc4-gjs-dillon-uat@uat-app.co.uk'
  : process.env.TO_CRM;

const ALLOW_ORIGINS = (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || '*')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

function resolveCorsOrigin(req) {
  const origin = req.headers.origin || '';
  if (ALLOW_ORIGINS.includes('*')) return '*';
  if (ALLOW_ORIGINS.includes(origin)) return origin;
  return ALLOW_ORIGINS[0] || '*';
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: { user: SMTP_USER, pass: SMTP_PASS }
});

module.exports = async (req, res) => {
  const allowOrigin = resolveCorsOrigin(req);
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');

    const {
      firstName = '',
      lastName = '',
      email = '',
      newsletter = false,
      phone = '',
      preferredMethods = [],
      company = '',
      propertyAddress = '',
      addressLine1 = '',
      addressLine2 = '',
      town = '',
      postcode = '',
      message = '',
      gdprConsent = false,
      reasonForContact = '',
      howHeard = '',
      page = '',
      utm_source = '',
      utm_medium = '',
      utm_campaign = ''
    } = body;

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Invalid email' });
    if (!firstName && !lastName)    return res.status(400).json({ error: 'Missing name' });
    if (!gdprConsent)               return res.status(400).json({ error: 'GDPR consent required' });

    // The current form sends the property address as separate fields, which the CRM
    // requires (it matches existing properties on postcode). The previous form sent one
    // free-text `propertyAddress`; still accept that so a cached copy of the old embed
    // doesn't start failing. Only payloads carrying the new keys are held to the new rules.
    const splitAddress = ['addressLine1', 'town', 'postcode'].some(k => k in body);
    const pc = normalisePostcode(postcode);
    if (splitAddress) {
      if (!String(addressLine1).trim()) return res.status(400).json({ error: 'Missing address line 1' });
      if (!String(town).trim())         return res.status(400).json({ error: 'Missing town' });
      if (!pc)                          return res.status(400).json({ error: 'Invalid postcode' });
    }

    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';

    const fullName = [firstName, lastName].filter(Boolean).join(' ');
    const methods  = (Array.isArray(preferredMethods) && preferredMethods.length) ? preferredMethods.join(', ') : '';
    const utm      = [utm_source, utm_medium, utm_campaign].filter(Boolean).join(' / ');

    // Single source of truth for both the plain-text and HTML bodies. The CRM parses the
    // plain-text part, so every field must appear there with exactly the same label and
    // value as in the HTML. Empty optional fields are left out of both.
    const rows = [
      ['Reason for contact', reasonForContact],
      ['Name', fullName],
      ['Email', email],
      ['Phone', phone],
      ['Company', company],
      ...(splitAddress
        ? [
            ['Address Line 1', String(addressLine1).trim()],
            ['Address Line 2', String(addressLine2).trim()],
            ['Town', String(town).trim()],
            ['Postcode', pc]
          ]
        : [['Property address enquiry relates to', propertyAddress]]),
      ['How did you hear about us', howHeard],
      ['Preferred contact method', methods],
      ['GDPR consent', gdprConsent ? 'Yes' : 'No'],
      ['Newsletter opt-in', newsletter ? 'Yes' : 'No']
    ].filter(([, value]) => value);

    const contextRows = [
      ['IP', ip],
      ['User-Agent', ua],
      ['UTM', utm]
    ].filter(([, value]) => value);

    const heading = `Website contact${reasonForContact ? ' — ' + reasonForContact : ''}`;

    const text = [
      heading,
      page ? `From page: ${page}` : '',
      ...rows.map(([label, value]) => `${label}: ${value}`),
      '',
      'Message:',
      String(message || ''),
      '',
      contextRows.length ? '— Context —' : '',
      ...contextRows.map(([label, value]) => `${label}: ${value}`)
    ].filter(Boolean).join('\n');

    const html = `<!doctype html>
<html><body style="margin:0;padding:16px;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;">
  <h2 style="margin:0 0 12px 0;font-size:18px;">${escapeHtml(heading)}</h2>
  ${page ? `<p style="margin:0 0 10px 0;"><strong>From page:</strong> <a href="${escapeHtml(page)}" style="color:#0b5fff;text-decoration:none;">${escapeHtml(page)}</a></p>` : ''}

  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:700px;border-collapse:collapse;margin:0 0 12px 0;">
    <tbody>
      ${rows.map(([label, value]) => `<tr><td style="padding:6px 0;width:220px;"><strong>${escapeHtml(label)}</strong></td><td style="padding:6px 0;">${escapeHtml(value)}</td></tr>`).join('\n      ')}
    </tbody>
  </table>

  <div style="margin:12px 0 0 0;">
    <h3 style="margin:0 0 8px 0;font-size:16px;">Message</h3>
    <div style="font-size:15px;line-height:1.5;background:#fafafa;border:1px solid #eee;border-radius:6px;padding:10px;">
      ${nl2br(message)}
    </div>
  </div>

  ${contextRows.length ? `
  <div style="margin:14px 0 0 0;">
    <h3 style="margin:0 0 8px 0;font-size:16px;">Context</h3>
    ${contextRows.map(([label, value]) => `<p style="margin:0 0 6px 0;"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`).join('\n    ')}
  </div>` : ''}
</body></html>`;

    const subject = heading;
    const mail = { from: FROM_EMAIL, subject, html, text, replyTo: email };

    // Primary recipient — must succeed; a failure here still returns 500 as before.
    await transporter.sendMail({
      ...mail,
      to: TO_CONTACT,
      headers: { 'X-Origin': 'standard-contact' }
    });

    // CRM copy — best effort. Never fail the visitor's submission because the CRM is down.
    if (TO_CRM) {
      try {
        await transporter.sendMail({
          ...mail,
          to: TO_CRM,
          headers: { 'X-Origin': 'standard-contact-crm' }
        });
      } catch (crmErr) {
        console.error('send-contact CRM copy failed', crmErr);
      }
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('send-contact error', err);
    res.status(500).json({ error: 'Failed to send contact email' });
  }
};
