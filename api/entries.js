import { list } from '@vercel/blob';

export default async function handler(req, res) {
  try {
    const { blobs } = await list({ prefix: 'entries/' });
    const entries = await Promise.all(
      blobs.map(async (b) => {
        const r = await fetch(b.url, {
          headers: { authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
        });
        return r.json();
      })
    );
    entries.sort((a, b) => a.id - b.id);
    res.status(200).json(entries);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}