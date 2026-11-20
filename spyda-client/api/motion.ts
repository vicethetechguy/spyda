import { billingSummary, requireUser, sendError, withGenerationCharge } from './_billing.js';
import { MOTION_MODEL, generateMotion, readMotionInput } from './_motion.js';

declare const process: {
  env: Record<string, string | undefined>;
};

export const config = {
  maxDuration: 300,
};

/**
 * POST { image, brief, format, duration, previousCode?, runtimeError? }
 *   -> { ok, title, code, model, billing }
 *
 * Signed-in callers only. The motion price is charged before Claude runs and
 * refunded if it fails; personal OpenAI keys do not apply, because motion runs
 * on Spyda's Anthropic account.
 */
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const user = await requireUser(req);
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ ok: false, error: 'ANTHROPIC_API_KEY is not configured, so motion design is unavailable.' });
    }
    const input = readMotionInput(req.body);
    const { result, charge } = await withGenerationCharge(
      user.id,
      'motion',
      false,
      () => generateMotion(input),
      motion => Boolean(motion.code),
    );
    return res.status(200).json({ ok: true, ...result, model: MOTION_MODEL, billing: billingSummary(charge) });
  } catch (error: any) {
    return sendError(res, error, 'Spyda could not make this motion design.');
  }
}
