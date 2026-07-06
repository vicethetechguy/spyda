import { runOcr } from './_utils.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { base64Image } = req.body;

    if (!base64Image) {
      return res.status(400).json({ ok: false, error: 'Upload a design image first.' });
    }

    const ocr = await runOcr(base64Image);
    return res.status(200).json({ ok: true, ocr });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error.message || 'OCR failed.' });
  }
}
