declare const process: {
  env: Record<string, string | undefined>;
};

export const config = {
  maxDuration: 60,
  api: {
    bodyParser: { sizeLimit: '4mb' },
  },
};

function dataUrlToBlob(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Spyda could not read the uploaded image.');
  const [, mimeType, encoded] = match;
  return new Blob([Buffer.from(encoded, 'base64')], { type: mimeType });
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const image = String(req.body?.image || '');
    if (!image.startsWith('data:image/')) {
      return res.status(400).json({ ok: false, error: 'An image upload is required.' });
    }

    const openaiKey = String(req.headers?.['x-spyda-openai-key'] || process.env.OPENAI_API_KEY || '').trim();
    if (!openaiKey) {
      return res.status(503).json({ ok: false, error: 'Background cleanup is not configured.' });
    }

    const form = new FormData();
    form.append('model', process.env.OPENAI_BACKGROUND_REMOVAL_MODEL || 'gpt-image-1.5');
    form.append('image', dataUrlToBlob(image), 'spyda-upload.png');
    form.append('prompt', 'Remove only the complete background from this uploaded asset. Preserve the main subject, logo, product, person, text, colors, proportions, and edges exactly. Return the same asset isolated on a fully transparent background. Do not add, redraw, restyle, crop, recolor, or invent anything.');
    form.append('background', 'transparent');
    form.append('output_format', 'png');
    form.append('size', 'auto');
    form.append('quality', 'low');

    const response = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: form,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || 'Background removal failed.');

    const output = payload?.data?.[0]?.b64_json || payload?.data?.[0]?.url;
    if (!output) throw new Error('Background removal did not return an image.');
    const preparedImage = String(output).startsWith('data:image/') || String(output).startsWith('http')
      ? String(output)
      : `data:image/png;base64,${output}`;

    return res.status(200).json({ ok: true, image: preparedImage });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: String(error?.message || 'Background removal failed.') });
  }
}
