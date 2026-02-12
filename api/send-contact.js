const nodemailer = require('nodemailer');

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// SMTP + app config from Vercel env
const SMTP_HOST   = process.env.SMTP_HOST;
const SMTP_PORT   = Number(process.env.SMTP_PORT || 587);
const SMTP_USER   = process.env.SMTP_USER;
const SMTP_PASS   = process.env.SMTP_PASS;
const FROM_EMAIL  = process.env.FROM_EMAIL || 'bamboo.admin@gjsdillon.co.uk';
const TO_CONTACT  = process.env.TO_CONTACT || 'info@gjsdillon.co.uk';

// Multi-origin CORS allow-list (supports both staging and live)
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

// Brevo SMTP transport
const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: { user: SMTP_USER, pass: SMTP_PASS }
});

module.exports = async (req, res) => {
  // CORS
  const allowOrigin = resolveCorsOrigin(req);
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');

    // Fields from your form
    const {
      firstName = '',
      lastName = '',
      email = '',
      newsletter = false,            // checkbox
      phone = '',
      preferredMethods = [],         // array of 'Email' | 'Phone' | 'Text Message'
      company = '',
      message = '',
      gdprConsent = false,           // required checkbox
      reasonForContact = '',         // select
      page = '',                     // page URL
      utm_source = '',
      utm_medium = '',
      utm_campaign = ''
    } = body;

    // Basic validation
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Invalid email' });
    if (!firstName && !lastName)    return res.status(400).json({ error: 'Missing name' });
    if (!gdprConsent)               return res.status(400).json({ error: 'GDPR consent required' });

    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    const safeList = (arr) => Array.isArray(arr) ? arr.map(escapeHtml).join(', ') : escapeHtml(String(arr || ''));

    const html = `<!doctype html>
<html><body>
  <h2>Website contact</h2>

  ${page ? `<p><strong>From page:</strong> ${escapeHtml(page)}</p>` : ''}
  <p><strong>Name:</strong> ${escapeHtml(firstName)} ${escapeHtml(lastName)}</p>
  <p><strong>Email:</strong> ${escapeHtml(email)}</p>
  ${phone ? `<p><strong>Phone:</strong> ${escapeHtml(phone)}</p>` : ''}

  ${company ? `<p><strong>Company:</strong> ${escapeHtml(company)}</p>` : ''}
  ${reasonForContact ? `<p><strong>Reason for contact:</strong> ${escapeHtml(reasonForContact)}</p>` : ''}

  ${preferredMethods && preferredMethods.length
    ? `<p><strong>Preferred contact method:</strong> ${safeList(preferredMethods)}</p>` : ''}

  <p><strong>GDPR consent:</strong> ${gdprConsent ? 'Yes' : 'No'}</p>
  <p><strong>Newsletter opt-in:</strong> ${newsletter ? 'Yes' : 'No'}</p>

  <h3>Message</h3>
  <p>${escapeHtml(message)}</p>

  <hr>
  <p><strong>Client info:</strong> IP ${escapeHtml(ip)} · UA ${escapeHtml(ua)}</p>
  ${utm_source || utm_medium || utm_campaign
    ? `<p><strong>UTM:</strong> ${escapeHtml([utm_source, utm_medium, utm_campaign].filter(Boolean).join(' / '))}</p>` : ''}
</body></html>`;

    await transporter.sendMail({
      from: FROM_EMAIL,
      to: TO_CONTACT,
      subject: `Website contact${reasonForContact ? ' — ' + reasonForContact : ''}`,
      html,
      replyTo: email,
      headers: { 'X-Origin': 'standard-contact' }
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('send-contact error', err);
    res.status(500).json({ error: 'Failed to send contact email' });
  }
};
