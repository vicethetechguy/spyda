import process from "node:process";
import { analysisModel, groqAnalysisModel, imageModel } from './_utils.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  return res.status(200).json({
    ok: true,
    hasApiKey: Boolean(process.env.OPENAI_API_KEY),
    hasOpenAiApiKey: Boolean(process.env.OPENAI_API_KEY),
    hasGroqApiKey: Boolean(process.env.GROQ_API_KEY),
    imageModel,
    analysisModel,
    groqAnalysisModel,
  });
}
