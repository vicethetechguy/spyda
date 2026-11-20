import Anthropic from '@anthropic-ai/sdk';
import { HttpError } from './_billing.js';
import { MOTION_CODE_CONTRACT, motionCreativeTemplate } from './_motion-template.js';

/**
 * Motion designs are written by Claude Opus 5.5 and nothing else: it reads the
 * reference design and writes canvas animation code that the app's player
 * runs and records to video.
 */

export const MOTION_MODEL = 'claude-opus-5-5';
export const MOTION_FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export const MOTION_FORMATS = {
  portrait: { width: 1080, height: 1350, label: '4:5 portrait post' },
  story: { width: 1080, height: 1920, label: '9:16 story or reel' },
  square: { width: 1080, height: 1080, label: '1:1 square post' },
} as const;

export type MotionFormat = keyof typeof MOTION_FORMATS;

export type MotionInput = {
  image: string;
  brief: string;
  format: MotionFormat;
  duration: number;
  /** The previous version's code, when the person is asking for changes to it. */
  previousCode?: string;
  /** A runtime error the player reported for the previous version. */
  runtimeError?: string;
};

export type MotionResult = { title: string; code: string };

const DATA_IMAGE = /^data:(image\/(?:png|jpe?g|webp|gif));base64,(.+)$/i;

export function readMotionInput(body: any): MotionInput {
  const image = String(body?.image || '');
  if (!DATA_IMAGE.test(image)) throw new HttpError(400, 'Import a reference design to animate.');
  const brief = String(body?.brief || '').trim().slice(0, 4000);
  const format = (Object.keys(MOTION_FORMATS) as MotionFormat[]).includes(body?.format) ? body.format as MotionFormat : 'portrait';
  const duration = Math.min(15, Math.max(4, Math.round(Number(body?.duration) || 8)));
  const previousCode = typeof body?.previousCode === 'string' && body.previousCode.trim() ? body.previousCode.slice(0, 120_000) : undefined;
  const runtimeError = typeof body?.runtimeError === 'string' && body.runtimeError.trim() ? body.runtimeError.slice(0, 2000) : undefined;
  return { image, brief, format, duration, previousCode, runtimeError };
}

/** The request, built apart from the call so it can be tested without the network. */
export function buildMotionRequest(input: MotionInput) {
  const [, mediaType, data] = DATA_IMAGE.exec(input.image)!;
  const size = MOTION_FORMATS[input.format];
  const lines = [
    `Canvas: ${size.width} x ${size.height} pixels (${size.label}). Duration: ${input.duration} seconds.`,
    input.brief ? `The brief:\n${input.brief}` : 'The brief: animate this design for the brand in the reference.',
  ];
  if (input.previousCode) {
    lines.push(
      input.runtimeError
        ? `The previous version failed in the player with this error:\n${input.runtimeError}\nFix it and keep everything else.`
        : 'Revise the previous version below to follow the brief. Keep what the brief does not ask to change.',
      `Previous version:\n\`\`\`javascript\n${input.previousCode}\n\`\`\``,
    );
  }

  return {
    model: MOTION_MODEL,
    max_tokens: 64000,
    betas: [MOTION_FALLBACK_BETA],
    fallbacks: 'default' as const,
    output_config: { effort: 'high' as const },
    // The two fixed parts come first and are cached; only the brief changes.
    system: [
      { type: 'text' as const, text: motionCreativeTemplate() },
      { type: 'text' as const, text: MOTION_CODE_CONTRACT, cache_control: { type: 'ephemeral' as const } },
    ],
    messages: [
      {
        role: 'user' as const,
        content: [
          {
            type: 'image' as const,
            source: { type: 'base64' as const, media_type: mediaType.toLowerCase().replace('jpg', 'jpeg') as 'image/jpeg', data },
          },
          { type: 'text' as const, text: lines.join('\n\n') },
        ],
      },
    ],
  };
}

/** Pulls the title and the code out of the model's reply. */
export function readMotionReply(text: string): MotionResult {
  const title = /^\s*TITLE:\s*(.+)$/im.exec(text)?.[1]?.trim().slice(0, 80) || 'Motion design';
  const fenced = /```(?:javascript|js)?\s*\n([\s\S]*?)```/i.exec(text);
  const code = (fenced ? fenced[1] : text).trim();
  if (!/function\s+draw\s*\(/.test(code)) {
    throw new HttpError(502, 'Claude did not return a playable animation. Your credits were refunded; try again or adjust the brief.');
  }
  return { title, code };
}

export async function generateMotion(input: MotionInput, client = new Anthropic()): Promise<MotionResult> {
  const stream = client.beta.messages.stream(buildMotionRequest(input));
  const message = await stream.finalMessage();
  if (message.stop_reason === 'refusal') {
    throw new HttpError(422, 'Claude declined to animate this design. Your credits were refunded; try a different reference or brief.');
  }
  if (message.stop_reason === 'max_tokens') {
    throw new HttpError(502, 'The animation was too long to finish. Your credits were refunded; ask for something simpler.');
  }
  const text = message.content
    .filter(block => block.type === 'text')
    .map(block => (block as { text: string }).text)
    .join('\n');
  return readMotionReply(text);
}
