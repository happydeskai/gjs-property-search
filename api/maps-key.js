// Serves the Google Maps JS API key to the browser from a Vercel environment
// variable, so the key stays out of the repo and can be rotated / scoped per
// environment (Preview vs Production) without a code change.
//
// NOTE: a Google Maps *browser* key is inherently public (it is visible in the
// page's network requests). The real protection is an HTTP-referrer restriction
// configured on the key in Google Cloud — see setup notes.
module.exports = (req, res) => {
  const key = process.env.GOOGLE_MAPS_API_KEY || '';
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).json({ key });
};
