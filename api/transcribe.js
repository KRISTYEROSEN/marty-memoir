export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { audioUrl } = req.body;
    if (!audioUrl) return res.status(400).json({ error: 'no audioUrl' });

    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) return res.status(500).json({ error: 'could not fetch audio' });
    const audioBuffer = await audioRes.arrayBuffer();

    const formData = new FormData();
    formData.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), 'audio.wav');
    formData.append('model_id', 'scribe_v1');

    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
      },
      body: formData,
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: err });
    }

    const data = await response.json();
    res.status(200).json({ transcript: data.text || '' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}