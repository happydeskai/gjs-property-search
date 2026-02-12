const nodemailer = require('nodemailer');

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function nl2br(str) {
  return escapeHtml(String(str || '')).replace(/\n/g, '<br>');
}
function safeList(arr) {
  return Array.isArray(arr) ? arr.map(escapeHtml).join(', ') : escapeHtml(String(arr || ''));
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

    const fullName = [firstName, lastName].filter(Boolean).join(' ');
    const methods  = (Array.isArray(preferredMethods) && preferredMethods.length) ? preferredMethods.join(', ') : '';

    // Plain-text (machine-friendly)
    const text = [
      `Website contact${reasonForContact ? ' — ' + reasonForContact : ''}`,
      page ? `From page: ${page}` : '',
      `Name: ${fullName}`,
      `Email: ${email}`,
      phone ? `Phone: ${phone}` : '',
      company ? `Company: ${company}` : '',
      methods ? `Preferred contact method: ${methods}` : '',
      `GDPR consent: ${gdprConsent ? 'Yes' : 'No'}`,
      `Newsletter opt-in: ${newsletter ? 'Yes' : 'No'}`,
      '',
      'Message:',
      String(message || ''),
      '',
      ip || ua ? '— Context —' : '',
      ip ? `IP: ${ip}` : '',
      ua ? `User-Agent: ${ua}` : '',
      (utm_source || utm_medium || utm_campaign)
        ? `UTM: ${[utm_source, utm_medium, utm_campaign].filter(Boolean).join(' / ')}`
        : ''
    ].filter(Boolean).join('\n');

    // Simple HTML (human-friendly, minimal markup)
    const html = `<!doctype html>
<html><body style="margin:0;padding:16px;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;">
  <h2 style="margin:0 0 12px 0;font-size:18px;">Website contact${reasonForContact ? ' — ' + escapeHtml(reasonForContact) : ''}</h2>
  ${page ? `<p style="margin:0 0 10px 0;"><strong>From page:</strong> <a href="${escapeHtml(page)}" style="color:#0b5fff;text-decoration:none;">${escapeHtml(page)}</a></p>` : ''}

  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:700px;border-collapse:collapse;margin:0 0 12px 0;">
    <tbody>
      <tr><td style="padding:6px 0;width:220px;"><strong>Name</strong></td><td style="padding:6px 0;">${escapeHtml(fullName)}</td></tr>
      <tr><td style="padding:6px 0;"><strong>Email</strong></td><td style="padding:6px 0;"><a href="mailto:${escapeHtml(email)}" style="color:#0b5fff;text-decoration:none;">${escapeHtml(email)}</a></td></tr>
      ${phone ? `<tr><td style="padding:6px 0;"><strong>Phone</strong></td><td style="padding:6px 0;">${escapeHtml(phone)}</td></tr>` : ''}
      ${company ? `<tr><td style="padding:6px 0;"><strong>Company</strong></td><td style="padding:6px 0;">${escapeHtml(company)}</td></tr>` : ''}
      ${(Array.isArray(preferredMethods) && preferredMethods.length) ? `<tr><td style="padding:6px 0;"><strong>Preferred contact method</strong></td><td style="padding:6px 0;">${safeList(preferredMethods)}</td></tr>` : ''}
      ${reasonForContact ? `<tr><td style="padding:6px 0;"><strong>Reason for contact</strong></td><td style="padding:6px 0;">${escapeHtml(reasonForContact)}</td></tr>` : ''}
      <tr><td style="padding:6px 0;"><strong>GDPR consent</strong></td><td style="padding:6px 0;">${gdprConsent ? 'Yes' : 'No'}</td></tr>
      <tr><td style="padding:6px 0;"><strong>Newsletter opt‑in</strong></td><td style="padding:6px 0;">${newsletter ? 'Yes' : 'No'}</td></tr>
    </tbody>
  </table>

  <div style="margin:12px 0 0 0;">
    <h3 style="margin:0 0 8px 0;font-size:16px;">Message</h3>
    <div style="font-size:15px;line-height:1.5;background:#fafafa;border:1px solid #eee;border-radius:6px;padding:10px;">
      ${nl2br(message)}
    </div>
  </div>

  ${(ip || ua || utm_source || utm_medium || utm_campaign) ? `
  <div style="margin:14px 0 0 0;">
    <h3 style="margin:0 0 8px 0;font-size:16px;">Context</h3>
    ${ip ? `<p style="margin:0 0 6px 0;"><strong>IP:</strong> ${escapeHtml(ip)}</p>` : ''}
    ${ua ? `<p style="margin:0 0 6px 0;"><strong>User‑Agent:</strong> ${escapeHtml(ua)}</p>` : ''}
    ${(utm_source || utm_medium || utm_campaign) ? `<p style="margin:0 0 6px 0;"><strong>UTM:</strong> ${escapeHtml([utm_source, utm_medium, utm_campaign].filter(Boolean).join(' / '))}</p>` : ''}
  </div>` : ''}
</body></html>`;

    await transporter.sendMail({
      from: FROM_EMAIL,
      to: TO_CONTACT,
      subject: `Website contact${reasonForContact ? ' — ' + reasonForContact : ''}`,
      html,
      text,         // plain-text for Flight/any parser
      replyTo: email,
      headers: { 'X-Origin': 'standard-contact' }
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('send-contact error', err);
    res.status(500).json({ error: 'Failed to send contact email' });
  }
};
