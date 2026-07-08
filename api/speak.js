export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { text } = req.body;
    const response = await fetch(
      'https://api.elevenlabs.io/v1/text-to-speech/EIsgvJT3rwoPvRFG6c4n',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
         voice_settings: { stability: 0.32, similarity_boost: 0.85, style: 0.45, use_speaker_boost: true },
        }),
      }
    );
    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: err });
    }
    const audio = await response.arrayBuffer();
    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(audio));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}