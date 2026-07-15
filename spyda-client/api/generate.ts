import { generateDesign } from './_utils.js';
import { runGenerationQa } from './qa.js';
import formidable from 'formidable';
import { readFile } from 'node:fs/promises';

declare const process: {
  env: Record<string, string | undefined>;
};

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

  let recipe;
  try {
    recipe = JSON.parse(String(recipeText));
  } catch (error: any) {
    throw new Error(`Spyda could not read the generation recipe JSON: ${error?.message || 'Invalid JSON.'}`);
  }
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

    let result = await generateDesign({ recipe });
    let qa = await runGenerationQa({ recipe, generatedImage: result.image });

    // QA gate: one automatic corrective retry when the output fails layout/size checks.
    // A second image generation can exceed a serverless request window.
    // Keep it opt-in; the first result and QA report still return to the user.
    const autoRetryEnabled = process.env.SPYDA_QA_AUTO_RETRY === 'true';
    if (autoRetryEnabled && qa.ok && qa.passed === false && result.image) {
      const corrections = [...(qa.suggestions || []), ...(qa.issues || [])].slice(0, 5);
      if (corrections.length) {
        const retryRecipe = {
          ...recipe,
          qaCorrections: {
            instruction: 'The previous attempt failed Spyda\'s layout QA gate. Regenerate with the same recipe, fixing every listed violation. Replacement atoms must match the original atom\'s exact visible size, position, and footprint.',
            violations: corrections,
          },
        };
        try {
          const retryResult = await generateDesign({ recipe: retryRecipe });
          if (retryResult.image) {
            const retryQa = await runGenerationQa({ recipe, generatedImage: retryResult.image });
            const firstScore = qa.score ?? 0;
            const retryScore = retryQa.ok ? (retryQa.score ?? 0) : -1;
            if (retryQa.ok && (retryQa.passed || retryScore > firstScore)) {
              result = retryResult;
              qa = { ...retryQa, retried: true };
            } else {
              qa = { ...qa, retried: true };
            }
          }
        } catch {
          // Keep the first result if the corrective retry fails outright.
        }
      }
    }

    return res.status(200).json({ ...result, qa });
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
