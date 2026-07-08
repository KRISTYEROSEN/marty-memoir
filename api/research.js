import { put } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.VITE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 10 }],
        messages: [{
          role: 'user',
          content: `Research Marty Kupersmith, also known by his stage name Marty Sanders, guitarist and songwriter for Jay and the Americans. Search multiple times to build a rich profile:

1. Search "Marty Sanders Jay and the Americans" - his music career, when he joined, hits
2. Search "Jay and the Americans band members history" - the other band members, lineup changes, tours
3. Search "Marty Kupersmith songwriter" - songs he wrote, who recorded them
4. Search "Marty Kupersmith Warwick NY snake" - his reptile work, herpetology
5. Search "Jay and the Americans Come a Little Bit Closer This Magic Moment" - the stories behind the hits

Compile EVERYTHING you find into a detailed research dossier. Include:
- Career timeline with dates
- Names of band members and collaborators
- Song titles, chart positions, stories behind songs
- The reptile/snake work
- Any interviews, quotes, or anecdotes
- Any notable public photos you find described (describe what they show and include URLs if available)

Write it as a detailed factual dossier. Only include what you actually found in searches - do not invent anything.`
        }]
      })
    });

    const data = await response.json();
    const dossier = data.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');

    await put('research/dossier.json', JSON.stringify({ dossier, updated: Date.now() }), {
      access: 'public',
      contentType: 'application/json',
      allowOverwrite: true,
    });

    res.status(200).json({ ok: true, dossier });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}