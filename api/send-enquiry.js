// Serverless handler for Vercel / Netlify (Node). Sends an HTML email to Kato's parse address.
// Uses nodemailer. Install: npm i nodemailer
//
// Environment variables required (set these in Vercel dashboard):
// SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, FROM_EMAIL, PARSE_EMAIL (optional)
//
// Note: For production, replace Access-Control-Allow-Origin '*' with your site origin.

const nodemailer = require('nodemailer');

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const PARSE_EMAIL = process.env.PARSE_EMAIL || 'gjs-dillon-limited-393@parse.agents-society.com';
const FROM_EMAIL = process.env.FROM_EMAIL || 'no-reply@yourdomain.com';
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT || 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT),
  secure: Number(SMTP_PORT) === 465,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS
  }
});

module.exports = async (req, res) => {
  // CORS: allow requests from any origin (change '*' to your origin in production)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    // Handle preflight
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');

    const {
      firstName = '',
      lastName = '',
      email = '',
      phone = '',
      message = '',
      mailingList = false,
      propertyId = '',
      propertyTitle = ''
    } = body;

    // Basic validation
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      res.status(400).json({ error: 'Invalid email' });
      return;
    }
    if (!firstName && !lastName) {
      res.status(400).json({ error: 'Missing name' });
      return;
    }

    // Build meta tags required by Kato.
    const metaLines = [];
    if (firstName) metaLines.push(`<meta property="as:contactForename" content="${escapeHtml(firstName)}">`);
    if (lastName)  metaLines.push(`<meta property="as:contactSurname" content="${escapeHtml(lastName)}">`);
    metaLines.push(`<meta property="as:contactEmail" content="${escapeHtml(email)}">`);
    if (phone) metaLines.push(`<meta property="as:contactTelephone" content="${escapeHtml(phone)}">`);
    if (propertyId) metaLines.push(`<meta property="as:properties" content="${escapeHtml(String(propertyId))}">`);
    if (message) metaLines.push(`<meta property="as:enquiryMessage" content="${escapeHtml(message)}">`);
    if (mailingList) metaLines.push(`<meta property="as:mailingListOptIn" content="1">`); // optional custom meta

    const metaBlock = metaLines.join('\n  ');

    const htmlBody = `<!doctype html>
<html>
<head>
  ${metaBlock}
</head>
<body>
  <h2>Web enquiry</h2>
  <p><strong>Property:</strong> ${escapeHtml(propertyTitle || propertyId)}</p>
  <p><strong>Name:</strong> ${escapeHtml(firstName)} ${escapeHtml(lastName)}</p>
  <p><strong>Email:</strong> ${escapeHtml(email)}</p>
  ${phone ? `<p><strong>Phone:</strong> ${escapeHtml(phone)}</p>` : ''}
  ${mailingList ? `<p><strong>Mailing list opt-in:</strong> Yes</p>` : ''}
  <h3>Message</h3>
  <p>${escapeHtml(message)}</p>
</body>
</html>`;

    const mailOptions = {
      from: FROM_EMAIL,
      to: PARSE_EMAIL,
      subject: `Website enquiry${propertyId ? ` — property ${propertyId}` : ''}`,
      html: htmlBody,
      replyTo: email,
      headers: {
        'X-Origin': 'property-site'
      }
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('send-enquiry error', err);
    res.status(500).json({ error: 'send_failed' });
  }
};
