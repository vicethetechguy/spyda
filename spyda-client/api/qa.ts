import { extractJson } from "./_utils.js";
import { analysisModel } from "./models.js";

declare const process: {
  env: Record<string, string | undefined>;
};

function asImageInputUrl(image: string) {
  if (!image) return "";
  if (image.startsWith("http") || image.startsWith("data:image/")) return image;
  return `data:image/png;base64,${image}`;
}

export async function runGenerationQa({ recipe, generatedImage }: { recipe: any; generatedImage: string | null }) {
  const openaiKey = process.env.OPENAI_API_KEY || "";
  const sourceImage = recipe?.sourceReferenceImage?.dataUrl;

  if (!openaiKey || !sourceImage || !generatedImage || process.env.SPYDA_QA_ENABLED === "false") {
    return { ok: false, skipped: true };
  }

  const expectedAtoms = Array.isArray(recipe?.editableComponents)
    ? recipe.editableComponents
      .filter((atom: any) => !atom?.deleted)
      .slice(0, 45)
      .map((atom: any) => ({
        name: atom.name,
        type: atom.type,
        content: atom.content,
        replacement: atom.replacement,
        boundingBox: atom.boundingBox,
      }))
    : [];

  const prompt = `You are Spyda's generation QA reviewer.
Compare image 1 (reference flyer) with image 2 (generated flyer).
Judge whether the generated flyer preserves the reference layout, hierarchy, aspect ratio, text intent, required replacements, logos/assets, colors, and visible design atoms.
Be concise. Return ONLY valid JSON:
{
  "ok": true,
  "score": 0,
  "layoutMatch": "short note",
  "textMatch": "short note",
  "assetMatch": "short note",
  "sizeMatch": "short note",
  "issues": ["most important mismatch"],
  "suggestions": ["highest impact fix"]
}

Required non-deleted atoms and replacements:
${JSON.stringify(expectedAtoms, null, 2)}`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: analysisModel,
        temperature: 0,
        response_format: { type: "json_object" },
        max_tokens: 700,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: sourceImage } },
            { type: "image_url", image_url: { url: asImageInputUrl(generatedImage) } },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { ok: false, skipped: true, error: err.error?.message || "QA request failed." };
    }

    const payload = await response.json();
    return extractJson(payload.choices?.[0]?.message?.content || "{}");
  } catch (error: any) {
    return { ok: false, skipped: true, error: error?.message || "QA failed." };
  }
}
