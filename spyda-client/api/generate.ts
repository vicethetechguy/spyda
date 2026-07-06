import { generateDesign } from './_utils.js';

export default async function handler(req: any, res: any) {
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
