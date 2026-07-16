import formidable from 'formidable';
import { readFile } from 'node:fs/promises';
import { runGenerationQa } from './qa.js';

export const config = {
  maxDuration: 60,
  api: { bodyParser: false },
};

function firstValue(value: any) {
  return Array.isArray(value) ? value[0] : value;
}

function firstFile(value: any) {
  return Array.isArray(value) ? value[0] : value;
}

async function fileToDataUrl(file: any) {
  const buffer = await readFile(file.filepath);
  return `data:${file.mimetype || 'image/webp'};base64,${buffer.toString('base64')}`;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const form = formidable({
      multiples: false,
      maxFiles: 2,
      maxFileSize: 8 * 1024 * 1024,
      maxTotalFileSize: 16 * 1024 * 1024,
    });
    const [fields, files] = await form.parse(req);
    const recipeText = firstValue(fields.recipe);
    if (!recipeText) return res.status(400).json({ ok: false, error: 'Missing QA recipe.' });

    const recipe = JSON.parse(String(recipeText));
    const childSourceFile = firstFile(files.childSourceImage);
    const generatedFile = firstFile(files.generatedImage);
    if (!childSourceFile || !generatedFile) {
      return res.status(400).json({ ok: false, error: 'Missing QA comparison images.' });
    }

    recipe.childSourceImage = {
      ...(recipe.childSourceImage || {}),
      dataUrl: await fileToDataUrl(childSourceFile),
    };
    const generatedImage = await fileToDataUrl(generatedFile);
    const qa = await runGenerationQa({ recipe, generatedImage });
    return res.status(200).json({ ok: true, qa });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: String(error?.message || 'Generation QA failed.'),
    });
  }
}
