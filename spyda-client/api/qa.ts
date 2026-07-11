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

export type GenerationQaReport = {
  ok: boolean;
  skipped?: boolean;
  passed?: boolean;
  retried?: boolean;
  score?: number;
  layoutMatch?: string;
  textMatch?: string;
  assetMatch?: string;
  sizeMatch?: string;
  issues?: string[];
  suggestions?: string[];
  error?: string;
};

function normalizeQaReport(raw: any): GenerationQaReport {
  const score = Number(raw?.score);
  const issues = Array.isArray(raw?.issues) ? raw.issues.filter(Boolean).map(String) : [];
  const suggestions = Array.isArray(raw?.suggestions) ? raw.suggestions.filter(Boolean).map(String) : [];
  const passed = typeof raw?.passed === "boolean"
    ? raw.passed
    : Number.isFinite(score)
      ? score >= 70
      : issues.length === 0;

  return {
    ok: true,
    skipped: false,
    passed,
    score: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : undefined,
    layoutMatch: raw?.layoutMatch ? String(raw.layoutMatch) : undefined,
    textMatch: raw?.textMatch ? String(raw.textMatch) : undefined,
    assetMatch: raw?.assetMatch ? String(raw.assetMatch) : undefined,
    sizeMatch: raw?.sizeMatch ? String(raw.sizeMatch) : undefined,
    issues,
    suggestions,
  };
}

export async function runGenerationQa({ recipe, generatedImage }: { recipe: any; generatedImage: string | null }): Promise<GenerationQaReport> {
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
        sizeLock: atom.sizeLock,
      }))
    : [];

  const replacementAssets = Array.isArray(recipe?.referenceImages)
    ? recipe.referenceImages.slice(0, 8).map((image: any) => ({
        replaces: image.originalContent || image.sectionName,
        originalBoundingBox: image.originalBoundingBox,
        uploadedAssetName: image.name,
      }))
    : [];

  const prompt = `You are Spyda's generation QA gate.
Compare image 1 (the parent Source flyer) with image 2 (the newly generated flyer).
The generated flyer must preserve the Source layout exactly, with only the requested replacements applied IN PLACE at the SAME SIZE.

Run this checklist and fail any violation:
1. Top logo is fully visible and not cropped.
2. Footer / contact details are not cut off at the bottom edge.
3. Any QR code from the Source remains visible and scannable-looking.
4. The main subject/product does not grow beyond its region in the Source.
5. The headline region has not expanded or shrunk.
6. REPLACEMENT SIZE: every replacement text/logo/image occupies the same visible footprint (width, height, position) as the atom it replaced in the Source. A replacement logo rendered larger or smaller than the original logo region is a FAIL. A replacement spilling outside the flyer edge or overlapping neighbors is a FAIL.
7. Protected assets (logos, photos, QR codes, badges, icons) are not recolored, redrawn, or decorated.
8. Output aspect ratio matches the Source aspect ratio.
9. Nothing important sits outside the canvas or safe area.

Replacement assets used this round (each must match its original footprint):
${JSON.stringify(replacementAssets, null, 2)}

Required non-deleted atoms and replacements:
${JSON.stringify(expectedAtoms, null, 2)}

Be strict on sizing, concise in wording. Return ONLY valid JSON:
{
  "passed": true,
  "score": 0,
  "layoutMatch": "short note",
  "textMatch": "short note",
  "assetMatch": "short note",
  "sizeMatch": "short note on replacement size fidelity",
  "issues": ["most important mismatches, worst first"],
  "suggestions": ["specific corrective instruction for regeneration, e.g. 'shrink the replacement logo to the original top-left logo footprint'"]
}
Set "passed" to false when any checklist item fails. Score 0-100 for overall reference fidelity.`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(25000),
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
    return normalizeQaReport(extractJson(payload.choices?.[0]?.message?.content || "{}"));
  } catch (error: any) {
    return { ok: false, skipped: true, error: error?.message || "QA failed." };
  }
}
