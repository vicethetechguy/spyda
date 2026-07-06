export const config = { runtime: 'edge' };

import { generateDesign } from './_utils.js';

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const formData = await req.formData();
    const recipeString = formData.get('recipe');
    const recipe = recipeString ? JSON.parse(recipeString) : {};

    const result = await generateDesign({ recipe });
    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
