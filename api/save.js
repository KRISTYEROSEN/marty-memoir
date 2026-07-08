import { put } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const entry = req.body;
    const blob = await put(`entries/${entry.id}.json`, JSON.stringify(entry), {
      access: 'public',
      contentType: 'application/json',
      allowOverwrite: true,
    });
    res.status(200).json({ ok: true, url: blob.url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}