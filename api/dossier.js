import { list } from '@vercel/blob';

export default async function handler(req, res) {
  try {
    const { blobs } = await list({ prefix: 'research/' });
    if (blobs.length === 0) {
      return res.status(200).json({ dossier: null });
    }
    const r = await fetch(blobs[0].url);
    const data = await r.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}