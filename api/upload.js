import { handleUpload } from '@vercel/blob/client';

export default async function handler(req, res) {
  try {
    const jsonResponse = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ['audio/wav', 'audio/mp4', 'audio/webm', 'application/json'],
        addRandomSuffix: true,
      }),
      onUploadCompleted: async () => {},
    });
    return res.status(200).json(jsonResponse);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
}