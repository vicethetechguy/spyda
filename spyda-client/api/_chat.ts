/**
 * The conversational design assistant behind the workspace chat.
 *
 * It reads a flyer the way a senior designer would in a chat app: in prose,
 * not as a JSON breakdown. When the person asks for a change, it does not
 * generate anything itself; it calls `propose_flyer_edit`, and the browser
 * shows that proposal with its credit cost so nobody is charged without saying
 * yes.
 */

declare const process: {
  env: Record<string, string | undefined>;
};

export type ChatRole = "user" | "assistant";

export type ChatTurn = {
  role: ChatRole;
  text: string;
  /** Data URLs of images attached to this turn. */
  images?: string[];
};

export type EditProposal = {
  instruction: string;
  summary: string;
};

export type ChatReply = {
  reply: string;
  edit: EditProposal | null;
};

export const chatModel = () => process.env.OPENAI_CHAT_MODEL || process.env.OPENAI_ANALYSIS_MODEL || "gpt-4o";

/** Images are the expensive part of a request; only the latest few travel. */
export const MAX_IMAGES_PER_REQUEST = 3;
export const MAX_TURNS_PER_REQUEST = 24;

export const SPYDA_SYSTEM_PROMPT = `You are Spyda, a senior graphic designer working inside the Spyda design app.
People upload flyers, posters and social designs and talk to you about them.

When a flyer is shared, read it like a designer would in conversation:
- Start with one sentence on what the flyer is and who it is for.
- Then cover, under short bold labels: Layout and hierarchy, Typography (name likely typefaces or close matches, weights, sizes relative to each other), Colour (list the main colours as HEX codes), Imagery, Copy (quote the visible text exactly), and What is working / What to improve.
- Be specific and visual. Refer to positions (top-left, centre band, footer).
- Keep it scannable: short paragraphs and bullet lists, no tables.

When the person asks you to change the design (new text, colours, swap a product, resize for a format, a new version), describe briefly what you will change and call the propose_flyer_edit tool with one precise instruction for an image model. Keep everything not mentioned identical. Quote any new text exactly. Never claim you already generated an image; the app generates it after the person confirms.

If they ask something general about design, answer it directly. If no flyer has been shared and they need one, ask them to import it with the paperclip.
Never invent facts about the person's business. Write in the language the person writes in.`;

export const EDIT_TOOL = {
  type: "function",
  function: {
    name: "propose_flyer_edit",
    description: "Propose an edit to the most recent flyer. The app shows it to the person with its credit cost and generates it only after they confirm.",
    parameters: {
      type: "object",
      properties: {
        instruction: {
          type: "string",
          description: "One precise instruction for an image editing model, quoting new text exactly and naming what must stay unchanged.",
        },
        summary: {
          type: "string",
          description: "A short label for the person, under 12 words, such as 'Change the headline to Grand Opening'.",
        },
      },
      required: ["instruction", "summary"],
      additionalProperties: false,
    },
  },
} as const;

function isDataImage(value: unknown): value is string {
  return typeof value === "string" && /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(value);
}

/** Validates what the browser sent and trims it to what one request may carry. */
export function readTurns(input: unknown): ChatTurn[] {
  if (!Array.isArray(input)) throw new Error("Send the conversation as a list of messages.");
  const turns = input
    .filter((turn: any) => turn && (turn.role === "user" || turn.role === "assistant"))
    .map((turn: any): ChatTurn => ({
      role: turn.role,
      text: typeof turn.text === "string" ? turn.text.slice(0, 8000) : "",
      images: Array.isArray(turn.images) ? turn.images.filter(isDataImage) : [],
    }))
    .filter(turn => turn.text.trim() || turn.images?.length)
    .slice(-MAX_TURNS_PER_REQUEST);

  if (!turns.length || turns[turns.length - 1].role !== "user") {
    throw new Error("The last message must come from you.");
  }
  return turns;
}

/** OpenAI chat messages, keeping only the newest images so the request stays small. */
export function buildChatMessages(turns: ChatTurn[]) {
  // Walk from the newest turn back, giving each its newest images until the
  // budget is spent.
  let imageBudget = MAX_IMAGES_PER_REQUEST;
  const allowance = new Map<number, number>();
  for (let index = turns.length - 1; index >= 0 && imageBudget > 0; index -= 1) {
    const count = Math.min(imageBudget, turns[index].images?.length || 0);
    if (count) {
      allowance.set(index, count);
      imageBudget -= count;
    }
  }

  const messages: any[] = [{ role: "system", content: SPYDA_SYSTEM_PROMPT }];
  turns.forEach((turn, index) => {
    const keep = allowance.get(index) || 0;
    const images = keep ? (turn.images || []).slice(-keep) : [];
    const dropped = (turn.images?.length || 0) - images.length;
    const text = [turn.text.trim(), dropped > 0 ? `[${dropped} earlier image${dropped > 1 ? "s" : ""} not resent]` : ""]
      .filter(Boolean)
      .join("\n");

    if (turn.role === "assistant") {
      messages.push({ role: "assistant", content: text || "(image)" });
      return;
    }
    messages.push({
      role: "user",
      content: [
        ...(text ? [{ type: "text", text }] : [{ type: "text", text: "Here is my flyer." }]),
        ...images.map(url => ({ type: "image_url", image_url: { url, detail: "high" } })),
      ],
    });
  });
  return messages;
}

/** Reads the model's answer, including a proposed edit if it made one. */
export function readChatCompletion(payload: any): ChatReply {
  const message = payload?.choices?.[0]?.message || {};
  const call = (message.tool_calls || []).find((item: any) => item?.function?.name === "propose_flyer_edit");
  let edit: EditProposal | null = null;
  if (call) {
    try {
      const args = JSON.parse(call.function.arguments || "{}");
      if (typeof args.instruction === "string" && args.instruction.trim()) {
        edit = {
          instruction: args.instruction.trim(),
          summary: typeof args.summary === "string" && args.summary.trim() ? args.summary.trim() : "Make this change",
        };
      }
    } catch {
      edit = null;
    }
  }
  const reply = typeof message.content === "string" ? message.content.trim() : "";
  return {
    reply: reply || (edit ? `Here is the change I would make: ${edit.summary}.` : "I could not read a reply from the model. Try again."),
    edit,
  };
}

export async function requestChatReply(turns: ChatTurn[], openaiKey: string): Promise<ChatReply> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: chatModel(),
      temperature: 0.5,
      messages: buildChatMessages(turns),
      tools: [EDIT_TOOL],
      tool_choice: "auto",
      parallel_tool_calls: false,
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || "The design assistant is unavailable right now.");
  }
  return readChatCompletion(await response.json());
}

/** The prompt the image model gets for a confirmed edit. */
export function buildEditPrompt(instruction: string) {
  return [
    "Edit the attached flyer.",
    `Change: ${instruction.trim()}`,
    "Keep everything the change does not mention exactly as it is: layout, spacing, typefaces, colours, imagery, logos and all other text.",
    "Render all text crisp and spelled exactly as given. Do not add watermarks, borders or new elements.",
  ].join("\n");
}
