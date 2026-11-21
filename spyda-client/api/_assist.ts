import { HttpError } from './_billing.js';
import type { ChatKeys, ChatProvider } from './_chat.js';

declare const process: {
  env: Record<string, string | undefined>;
};

/**
 * Spyda AI inside canvas mode. The model sees the canvas as a list of layers
 * and answers with operations on them; the browser validates every operation
 * and applies them as ordinary edit intents, so one request is one undo step
 * and nothing the model says can touch a locked layer.
 */

export const assistModels: Record<ChatProvider, () => string> = {
  groq: () => process.env.GROQ_ASSIST_MODEL || 'openai/gpt-oss-120b',
  openai: () => process.env.OPENAI_ASSIST_MODEL || process.env.OPENAI_CHAT_MODEL || 'gpt-4o',
};

const ENDPOINTS: Record<ChatProvider, { url: string; label: string }> = {
  groq: { url: 'https://api.groq.com/openai/v1/chat/completions', label: 'Groq' },
  openai: { url: 'https://api.openai.com/v1/chat/completions', label: 'OpenAI' },
};

export const ASSIST_SYSTEM_PROMPT = `You are Spyda AI, a senior graphic designer working directly on a design canvas in the Spyda app, like an assistant inside Figma.

You receive the canvas size in pixels and its layers. Positions and sizes are percentages of the canvas, 0 to 100. x and y are the TOP-LEFT corner of the box, never its centre: to centre a box of width w, use x = (100 - w) / 2. fontSize is in canvas pixels. Layers later in the list sit on top.

Do what the person asks by changing the layers. Reply with JSON only, in this shape:
{
  "reply": "one or two short sentences saying what you did",
  "operations": [
    { "op": "update", "id": "<existing layer id>", "set": { ...properties to change } },
    { "op": "create", "kind": "text" | "rect" | "circle", "name": "short layer name", "set": { ...properties } },
    { "op": "delete", "id": "<existing layer id>" },
    { "op": "background", "fill": "#RRGGBB" }
  ]
}

Properties you may set: text, fill, stroke, fontFamily, fontSize, fontWeight ("400" to "800"), textAlign ("left" | "center" | "right"), opacity (0 to 1), x, y, width, height, rotation (degrees).

Design rules:
- Keep every layer inside the canvas with at least a 6% margin unless it is a full-bleed background element.
- Build clear hierarchy: one dominant headline, supporting text clearly smaller, a call to action that stands out.
- Text boxes must be tall enough for their text: height (percent) should be at least lines x fontSize x 1.2 / canvas height x 100.
- Use a coherent palette of two or three colours plus neutrals, with strong contrast between text and what is behind it.
- Fonts available: Space Grotesk, Montserrat, Inter, Poppins, Playfair Display, Bebas Neue, DM Sans, Outfit.
- To lay out a new design, create the layers in back-to-front order (shapes first, text last).
- To put text on a shape (a button label), give the text exactly the same x, y, width and height as the shape and textAlign "center".
- Never touch layers marked locked. Only use ids that exist. Quote any text the person gives exactly.
- If the request is unclear, make a sensible design choice rather than asking, and say what you chose.`;

export type AssistLayer = Record<string, unknown>;
export type AssistInput = { instruction: string; canvas: { width: number; height: number }; layers: AssistLayer[] };
export type AssistResult = { reply: string; operations: unknown[] };

export function readAssistInput(body: any): AssistInput {
  const instruction = String(body?.instruction || '').trim().slice(0, 2000);
  if (!instruction) throw new HttpError(400, 'Tell Spyda AI what to do on the canvas.');
  const width = Number(body?.canvas?.width) || 1080;
  const height = Number(body?.canvas?.height) || 1350;
  const layers = Array.isArray(body?.layers) ? body.layers.slice(0, 120) : [];
  return { instruction, canvas: { width, height }, layers };
}

export function buildAssistMessages(input: AssistInput) {
  return [
    { role: 'system', content: ASSIST_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Canvas: ${input.canvas.width} x ${input.canvas.height} px.\nLayers:\n${JSON.stringify(input.layers)}\n\nRequest: ${input.instruction}`,
    },
  ];
}

/** The model's JSON, tolerating code fences or stray text around it. */
export function readAssistReply(text: string): AssistResult {
  const cleaned = text.replace(/<think>[\s\S]*?(<\/think>|$)/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('Spyda AI did not return changes. Try rephrasing.');
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  return {
    reply: typeof parsed.reply === 'string' && parsed.reply.trim() ? parsed.reply.trim() : 'Done.',
    operations: Array.isArray(parsed.operations) ? parsed.operations.slice(0, 80) : [],
  };
}

async function requestFrom(provider: ChatProvider, key: string, input: AssistInput): Promise<AssistResult> {
  const response = await fetch(ENDPOINTS[provider].url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: assistModels[provider](),
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: buildAssistMessages(input),
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`${ENDPOINTS[provider].label}: ${err.error?.message || 'Spyda AI is unavailable right now.'}`);
  }
  const payload = await response.json();
  return readAssistReply(String(payload?.choices?.[0]?.message?.content || ''));
}

export async function requestAssist(input: AssistInput, keys: ChatKeys, order: ChatProvider[]): Promise<AssistResult> {
  if (!order.length) throw new Error('No AI model is configured. Add GROQ_API_KEY or OPENAI_API_KEY.');
  const errors: string[] = [];
  for (const provider of order) {
    try {
      return await requestFrom(provider, keys[provider]!, input);
    } catch (error: any) {
      errors.push(String(error?.message || error));
    }
  }
  throw new Error(errors.join(' '));
}
