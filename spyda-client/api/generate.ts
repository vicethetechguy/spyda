import { generateDesign } from './_utils.js';
import { runGenerationQa } from './qa.js';

export const config = {
  runtime: 'edge',
};

async function fileToDataUrl(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(arrayBuffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:${file.type || 'image/jpeg'};base64,${btoa(binary)}`;
}

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const contentType = req.headers.get('content-type') || '';
    let recipe: any = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const recipeText = formData.get('recipe');
      if (!recipeText) throw new Error('Missing recipe data.');
      recipe = JSON.parse(recipeText.toString());

      const sourceFile = formData.get('sourceReferenceImage') as File | null;
      if (sourceFile && sourceFile.size > 0 && recipe.sourceReferenceImage) {
        recipe.sourceReferenceImage.dataUrl = await fileToDataUrl(sourceFile);
      }

      const childFile = formData.get('childSourceImage') as File | null;
      if (childFile && childFile.size > 0 && recipe.childSourceImage) {
        recipe.childSourceImage.dataUrl = await fileToDataUrl(childFile);
      }

      const essentialsFile = formData.get('essentialsImage') as File | null;
      if (essentialsFile && essentialsFile.size > 0 && recipe.essentialsImage) {
        recipe.essentialsImage.dataUrl = await fileToDataUrl(essentialsFile);
      }

      if (Array.isArray(recipe.referenceImages)) {
        for (const image of recipe.referenceImages) {
          const fieldName = image.fieldName;
          if (fieldName) {
            const uploadedFile = formData.get(fieldName) as File | null;
            if (uploadedFile && uploadedFile.size > 0) {
              image.dataUrl = await fileToDataUrl(uploadedFile);
            }
          }
        }
      }
    } else {
      const body = await req.json();
      recipe = body?.recipe;
    }

    if (!recipe) {
      return new Response(JSON.stringify({ error: 'Missing recipe data.' }), { status: 400 });
    }

    const result = await generateDesign({ recipe });
    const qa = await runGenerationQa({ recipe, generatedImage: result.image }).catch((error: any) => ({
      ok: false,
      skipped: true,
      error: error?.message || 'QA failed.',
    }));

    return new Response(JSON.stringify({ ...result, qa }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
