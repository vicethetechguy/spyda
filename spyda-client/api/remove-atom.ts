import formidable from 'formidable';
import { readFile } from 'node:fs/promises';
import { imageModel } from './models.js';
import { isGptImageModel, mapOutputSize, mapQuality } from './_utils.js';

declare const process: {
  env: Record<string, string | undefined>;
};

export const config = {
  maxDuration: 120,
  api: {
    bodyParser: false,
  },
};

function firstValue(value: any) {
  return Array.isArray(value) ? value[0] : value;
}

function firstFile(value: any) {
  return Array.isArray(value) ? value[0] : value;
}

async function fileToBlob(file: any) {
  const buffer = await readFile(file.filepath);
  return new Blob([buffer], { type: file.mimetype || 'image/png' });
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const openaiKey = process.env.OPENAI_API_KEY || '';
    if (!openaiKey) {
      return res.status(500).json({ ok: false, error: 'OPENAI_API_KEY is not configured.' });
    }

    const form = formidable({
      multiples: false,
      maxFiles: 2,
      maxFileSize: 6 * 1024 * 1024,
      maxTotalFileSize: 12 * 1024 * 1024,
    });

    const [fields, files] = await form.parse(req);
    const imageFile = firstFile(files.image);
    const maskFile = firstFile(files.mask);
    const component = JSON.parse(String(firstValue(fields.component) || '{}'));
    const imageSize = String(firstValue(fields.imageSize) || '');

    if (!imageFile || !maskFile) {
      return res.status(400).json({ ok: false, error: 'Missing image or mask.' });
    }

    const model = imageModel || 'gpt-image-2';
    const prompt = `Remove the selected flyer element and naturally reconstruct the background behind it.
Match the exact surrounding background, texture, lighting, shadows, gradients, borders, and visual style.
Do not redesign the flyer. Do not add new text. Only clean the masked area.
Element being removed:
${JSON.stringify(component, null, 2)}`;

    const editForm = new FormData();
    editForm.append('model', model);
    editForm.append('prompt', prompt);
    editForm.append('image', await fileToBlob(imageFile), imageFile.originalFilename || 'spyda-base.png');
    editForm.append('mask', await fileToBlob(maskFile), 'spyda-mask.png');
    editForm.append('quality', mapQuality('premium', model));
    editForm.append('output_format', 'png');

    if (isGptImageModel(model)) {
      editForm.append('size', mapOutputSize('', imageSize, model));
    }

    const response = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: editForm,
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        ok: false,
        error: errorPayload.error?.message || 'OpenAI image cleanup failed.',
      });
    }

    const payload = await response.json();
    return res.status(200).json({
      ok: true,
      mode: 'openai-inpaint',
      model,
      image: payload.data?.[0]?.b64_json || payload.data?.[0]?.url || null,
    });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error?.message || 'Could not clean this atom.' });
  }
}
