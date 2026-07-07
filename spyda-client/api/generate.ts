import { generateDesign } from './_utils.js';
import formidable from 'formidable';
import { readFile } from 'node:fs/promises';

export const config = {
  maxDuration: 300,
  api: {
    bodyParser: false,
  },
};

function isMultipart(req: any) {
  return String(req.headers?.['content-type'] || '').includes('multipart/form-data');
}

function firstValue(value: any) {
  return Array.isArray(value) ? value[0] : value;
}

function firstFile(value: any) {
  return Array.isArray(value) ? value[0] : value;
}

function fileToDataUrl(file: any) {
  return readFile(file.filepath).then((buffer) => {
    const mimeType = file.mimetype || 'image/jpeg';
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  });
}

async function readMultipartRecipe(req: any) {
  const form = formidable({
    multiples: true,
    maxFiles: 8,
    maxFileSize: 4 * 1024 * 1024,
    maxTotalFileSize: 12 * 1024 * 1024,
  });

  const [fields, files] = await form.parse(req);
  const recipeText = firstValue(fields.recipe);
  if (!recipeText) throw new Error('Missing recipe data.');

  const recipe = JSON.parse(String(recipeText));
  const sourceFile = firstFile(files.sourceReferenceImage);

  if (sourceFile && recipe.sourceReferenceImage) {
    recipe.sourceReferenceImage.dataUrl = await fileToDataUrl(sourceFile);
  }

  if (Array.isArray(recipe.referenceImages)) {
    for (const image of recipe.referenceImages) {
      const fieldName = image.fieldName;
      const uploadedFile = fieldName ? firstFile(files[fieldName]) : null;
      if (uploadedFile) {
        image.dataUrl = await fileToDataUrl(uploadedFile);
      }
    }
  }

  return recipe;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const recipe = isMultipart(req) ? await readMultipartRecipe(req) : req.body?.recipe;
    if (!recipe) {
      return res.status(400).json({ error: 'Missing recipe data.' });
    }

    const result = await generateDesign({ recipe });
    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
