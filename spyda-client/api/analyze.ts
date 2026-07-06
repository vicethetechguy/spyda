import { analyzeDesign } from './_utils';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { base64Image, aiProvider } = req.body;

    if (!base64Image) {
      return res.status(400).json({ error: 'Upload a design image first.' });
    }

    const result = await analyzeDesign(base64Image, aiProvider);
    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
