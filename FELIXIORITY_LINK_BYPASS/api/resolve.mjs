import { resolveShortlink, publicError } from '../lib/resolve.mjs';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, message: 'Gunakan metode POST.' });
  }
  const body = req.body;
  if (!body || typeof body.url !== 'string') return res.status(400).json({ ok: false, message: 'URL harus diisi.' });
  try {
    const outcome = await resolveShortlink(body.url);
    return res.status(outcome.ok ? 200 : 422).json(outcome);
  } catch (e) {
    const { status, body: output } = publicError(e);
    return res.status(status).json(output);
  }
}
