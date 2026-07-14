

import { put, list } from '@vercel/blob';
 
export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { blobs } = await list({ prefix: 'book/' });
      if (blobs.length === 0) return res.status(200).json({ book: null });
      const r = await fetch(blobs[0].url);
      const data = await r.json();
      return res.status(200).json({ book: data });
    }
    if (req.method === 'POST') {
      const body = req.body;
      await put('book/draft.json', JSON.stringify(body), {
        access: 'public',
        contentType: 'application/json',
        allowOverwrite: true,
      });
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
 