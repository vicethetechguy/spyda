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

async function fileToDataUrl(file: any) {
  const buffer = await readFile(file.filepath);
  const mimeType = file.mimetype || 'image/jpeg';
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

async function readMultipartRecipe(req: any) {
  const form = formidable({
    multiples: true,
    maxFiles: 8,
    maxFileSize: 8 * 1024 * 1024,
    maxTotalFileSize: 24 * 1024 * 1024,
  });

  const [fields, files] = await form.parse(req);
  const recipeText = firstValue(fields.recipe);
  if (!recipeText) throw new Error('Missing recipe data.');

  const recipe = JSON.parse(String(recipeText));
  const sourceFile = firstFile(files.sourceReferenceImage);
  if (sourceFile && recipe.sourceReferenceImage) {
    recipe.sourceReferenceImage.dataUrl = await fileToDataUrl(sourceFile);
  }

  const childFile = firstFile(files.childSourceImage);
  if (childFile && recipe.childSourceImage) {
    recipe.childSourceImage.dataUrl = await fileToDataUrl(childFile);
  }

  const essentialsFile = firstFile(files.essentialsImage);
  if (essentialsFile && recipe.essentialsImage) {
    recipe.essentialsImage.dataUrl = await fileToDataUrl(essentialsFile);
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
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const recipe = isMultipart(req) ? await readMultipartRecipe(req) : req.body?.recipe;
    if (!recipe) {
      return res.status(400).json({ ok: false, error: 'Missing recipe data.' });
    }

    const result = await generateDesign({ recipe });
    return res.status(200).json({ ...result, qa: { ok: false, skipped: true } });
  } catch (error: any) {
    const message = String(error?.message || 'Generation failed.');
    const isUploadLimit = /maxFileSize|maxTotalFileSize|maxFieldsSize|too large|entity too large/i.test(message);
    return res.status(isUploadLimit ? 413 : 500).json({
      ok: false,
      error: isUploadLimit
        ? 'The generation package was too large. Spyda has reduced image uploads, but try again with smaller replacement images if this repeats.'
        : message,
    });
  }
}
