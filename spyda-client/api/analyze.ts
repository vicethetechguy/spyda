import { analyzeDesign } from './_utils.js';
import { runOcr } from './_ocr_service.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { base64Image, aiProvider, sourceMetadata } = req.body;

    if (!base64Image) {
      return res.status(400).json({ error: 'Upload a design image first.' });
    }

    let ocr: any = { enabled: false, fullText: "", words: [] };
    try {
      ocr = await runOcr(base64Image);
    } catch (error: any) {
      ocr = { enabled: false, fullText: "", words: [], error: error?.message || "OCR failed." };
    }

    const result = await analyzeDesign(base64Image, aiProvider, ocr, sourceMetadata, {
      openai: String(req.headers?.['x-spyda-openai-key'] || '').trim(),
      groq: String(req.headers?.['x-spyda-groq-key'] || '').trim(),
    });
    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
