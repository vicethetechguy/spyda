import { generateDesign } from './_utils';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { recipe } = req.body;
    if (!recipe) {
      return res.status(400).json({ error: 'Missing recipe data.' });
    }

    const result = await generateDesign({ recipe });
    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
