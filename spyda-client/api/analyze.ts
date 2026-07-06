import { analyzeDesign } from './_utils';

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const formData = await req.formData();
    const designFile = formData.get('design') || formData.get('file');
    const aiProvider = formData.get('aiProvider') as string;

    if (!designFile) {
      return new Response(JSON.stringify({ error: 'Upload a design image first.' }), { status: 400 });
    }

    const result = await analyzeDesign(designFile as File, aiProvider);
    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
