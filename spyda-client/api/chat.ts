import { buildEditPrompt, readTurns, requestChatReply } from './_chat.js';
import { billingSummary, isByok, readModelMode, requireUser, sendError, withGenerationCharge } from './_billing.js';
import { imageModel, mapOutputSize, mapQuality, normalizeGeneratedImageOutput, requestOpenAiImageEdit } from './_utils.js';

declare const process: {
  env: Record<string, string | undefined>;
};

export const config = {
  maxDuration: 300,
};

function readDimensions(value: any) {
  const width = Number(value?.width);
  const height = Number(value?.height);
  return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * POST { action: 'reply', messages }            -> { ok, reply, edit }
 * POST { action: 'edit', instruction, image }   -> { ok, image, model, billing }
 *
 * Both need a signed-in caller. A reply never spends image-model money; an
 * edit charges credits before the image model runs and refunds on failure.
 */
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const body = req.body || {};
  try {
    const user = await requireUser(req);

    const openaiKey = String(req.headers?.['x-spyda-openai-key'] || '').trim() || process.env.OPENAI_API_KEY || '';
    if (!openaiKey) return res.status(500).json({ ok: false, error: 'OPENAI_API_KEY is not configured.' });

    if (body.action === 'edit') {
      const instruction = String(body.instruction || '').trim();
      const image = String(body.image || '');
      if (!instruction) return res.status(400).json({ ok: false, error: 'Say what should change.' });
      if (!image.startsWith('data:image/')) return res.status(400).json({ ok: false, error: 'Import the flyer to edit first.' });

      const model = imageModel || 'gpt-image-1.5';
      const size = mapOutputSize('flyer', '', model, readDimensions(body.dimensions), true, false);
      const { result: output, charge } = await withGenerationCharge(
        user.id,
        readModelMode(req, body.modelMode),
        isByok(req),
        async () => {
          const payload = await requestOpenAiImageEdit({
            openaiKey,
            model,
            prompt: buildEditPrompt(instruction),
            size,
            quality: mapQuality('high', model),
            referenceImages: [{ sectionId: 'flyer', dataUrl: image }],
            imageFieldName: 'image[]',
          });
          return normalizeGeneratedImageOutput(payload.data?.[0]?.b64_json || payload.data?.[0]?.url);
        },
        output => Boolean(output),
      );
      return res.status(200).json({ ok: true, image: output, model, billing: billingSummary(charge) });
    }

    const turns = readTurns(body.messages);
    const result = await requestChatReply(turns, openaiKey);
    return res.status(200).json({ ok: true, ...result });
  } catch (error: any) {
    return sendError(res, error, 'Spyda could not answer.');
  }
}
