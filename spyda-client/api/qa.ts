import { extractJson } from "./_utils.js";
import { analysisModel } from "./models.js";
import { applyDesignEdits, enforceDesignConstraints, type DesignEditIntent } from "../src/core/constraint-engine.js";
import { parseDesignDocument } from "../src/core/design-document.js";
import { validateDesignFidelity, validateRenderedDimensions, type FidelityReport, type RenderedDimensionReport } from "../src/core/validation-engine.js";
import { buildApprovedDifferenceContract, buildGenerationQaPrompt, findMissingRequiredText } from "./qa-contract.js";
import { runOcr } from "./_ocr_service.js";

declare const process: {
  env: Record<string, string | undefined>;
};

function asImageInputUrl(image: string) {
  if (!image) return "";
  if (image.startsWith("http") || image.startsWith("data:image/")) return image;
  return `data:image/png;base64,${image}`;
}

function settleWithin<T>(promise: Promise<T>, milliseconds: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>(resolve => setTimeout(() => resolve(null), milliseconds)),
  ]);
}

export type GenerationQaReport = {
  ok: boolean;
  skipped?: boolean;
  pending?: boolean;
  passed?: boolean;
  retried?: boolean;
  score?: number;
  layoutMatch?: string;
  textMatch?: string;
  assetMatch?: string;
  sizeMatch?: string;
  categoryScores?: Record<string, number>;
  approvedChangesApplied?: string[];
  unapprovedChanges?: string[];
  hardGateFailures?: Array<{ code: string; message: string; region?: string }>;
  issues?: string[];
  suggestions?: string[];
  structural?: FidelityReport;
  dimensions?: RenderedDimensionReport;
  error?: string;
};

function runDeterministicValidation(recipe: any, generatedImage: string | null) {
  if (!recipe?.designDocument || !generatedImage) return {};
  try {
    const reference = parseDesignDocument(recipe.designDocument);
    const intents: DesignEditIntent[] = [];
    for (const edit of Array.isArray(recipe.textEdits) ? recipe.textEdits : []) {
      if (edit?.objectId) intents.push({ objectId: String(edit.objectId), property: "text", value: edit.to || "" });
    }
    for (const asset of Array.isArray(recipe.pastedAssets) ? recipe.pastedAssets : []) {
      if (asset?.objectId) intents.push({ objectId: String(asset.objectId), property: "assetRef", value: asset.name || "replacement-asset" });
    }
    const edited = applyDesignEdits(reference, intents);
    const constrained = enforceDesignConstraints(reference, edited.document);
    return {
      structural: validateDesignFidelity(reference, constrained.document),
      dimensions: validateRenderedDimensions(reference.canvas, generatedImage),
      constraintIssues: [...edited.violations, ...constrained.violations],
    };
  } catch {
    return {};
  }
}

export function normalizeQaReport(raw: any): GenerationQaReport {
  const categoryScores = Object.fromEntries(
    Object.entries(raw?.categoryScores || {})
      .map(([key, value]) => [key, Math.max(0, Math.min(100, Math.round(Number(value))))])
      .filter(([, value]) => Number.isFinite(value)),
  );
  const categoryValues = Object.values(categoryScores) as number[];
  const reportedScore = Number(raw?.score);
  const categoryScore = categoryValues.length ? Math.min(...categoryValues) : reportedScore;
  let score = Number.isFinite(reportedScore) && Number.isFinite(categoryScore)
    ? Math.min(reportedScore, categoryScore)
    : Number.isFinite(reportedScore) ? reportedScore : categoryScore;
  const issues = Array.isArray(raw?.issues) ? raw.issues.filter(Boolean).map(String) : [];
  const suggestions = Array.isArray(raw?.suggestions) ? raw.suggestions.filter(Boolean).map(String) : [];
  const approvedChangesApplied = Array.isArray(raw?.approvedChangesApplied) ? raw.approvedChangesApplied.filter(Boolean).map(String) : [];
  const unapprovedChanges = Array.isArray(raw?.unapprovedChanges) ? raw.unapprovedChanges.filter(Boolean).map(String) : [];
  const hardGateFailures = Array.isArray(raw?.hardGateFailures)
    ? raw.hardGateFailures.filter(Boolean).map((failure: any) => ({
        code: String(failure?.code || "qa-failure"),
        message: String(failure?.message || failure || "QA hard gate failed."),
        region: failure?.region ? String(failure.region) : undefined,
      }))
    : [];
  if (hardGateFailures.length || unapprovedChanges.length) score = Math.min(Number.isFinite(score) ? score : 89, 89);
  const passed = raw?.passed === true
    && hardGateFailures.length === 0
    && unapprovedChanges.length === 0
    && Number.isFinite(score)
    && score >= 95;

  return {
    ok: true,
    skipped: false,
    passed,
    score: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : undefined,
    categoryScores,
    approvedChangesApplied,
    unapprovedChanges,
    hardGateFailures,
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
  const deterministic = runDeterministicValidation(recipe, generatedImage);
  // In composite mode the child source already contains every replacement at
  // its final position/size, so it is the expected-output baseline.
  const sourceImage = recipe?.compositeMode
    ? (recipe?.childSourceImage?.dataUrl || recipe?.sourceReferenceImage?.dataUrl)
    : recipe?.sourceReferenceImage?.dataUrl;

  if (!openaiKey || !sourceImage || !generatedImage || process.env.SPYDA_QA_ENABLED === "false") {
    return { ok: false, skipped: true, structural: deterministic.structural, dimensions: deterministic.dimensions };
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

  const compositeNote = recipe?.compositeMode
    ? `Image 1 is the expected-output baseline: it ALREADY contains every replacement asset pasted at its final, correct position and size. The generated flyer must keep each of those assets at exactly that position and size — any pasted asset that moved, grew, or shrank relative to image 1 is a FAIL.\n`
    : "";

  const legacyPrompt = `You are Spyda's generation QA gate.
Compare image 1 (the parent Source flyer) with image 2 (the newly generated flyer).
${compositeNote}The generated flyer must preserve the Source layout exactly, with only the requested replacements applied IN PLACE at the SAME SIZE.

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
  const prompt = buildGenerationQaPrompt(recipe) || legacyPrompt;

  try {
    const qaRequest = fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(18000),
      headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: analysisModel,
        temperature: 0,
        response_format: { type: "json_object" },
        max_tokens: 800,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: sourceImage, detail: "low" } },
            { type: "image_url", image_url: { url: asImageInputUrl(generatedImage), detail: "low" } },
          ],
        }],
      }),
    });
    const [response, generatedOcr] = await Promise.all([
      qaRequest,
      settleWithin(runOcr(generatedImage).catch(() => null), 8000),
    ]);

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { ok: false, skipped: true, error: err.error?.message || "QA request failed." };
    }

    const payload = await response.json();
    const report = normalizeQaReport(extractJson(payload.choices?.[0]?.message?.content || "{}"));
    const dimensionIssue = deterministic.dimensions?.passed === false ? deterministic.dimensions.issue : null;
    const missingText = generatedOcr?.enabled
      ? findMissingRequiredText(buildApprovedDifferenceContract(recipe), generatedOcr.fullText)
      : [];
    const textGateFailures = missingText.map(item => ({
      code: "required-text-missing",
      message: `Required text was not detected: "${item.value}"`,
      region: item.atom,
    }));
    const hardGateFailures = [...(report.hardGateFailures || []), ...textGateFailures];
    return {
      ...report,
      passed: Boolean(report.passed && deterministic.dimensions?.passed !== false && textGateFailures.length === 0),
      score: textGateFailures.length ? Math.min(report.score ?? 89, 89) : report.score,
      hardGateFailures,
      structural: deterministic.structural,
      dimensions: deterministic.dimensions,
      issues: [
        ...(report.issues || []),
        ...(report.unapprovedChanges || []).map(change => `Unapproved change: ${change}`),
        ...hardGateFailures.map(failure => `${failure.message}${failure.region ? ` (${failure.region})` : ""}`),
        ...(dimensionIssue ? [dimensionIssue] : []),
      ],
    };
  } catch (error: any) {
    return { ok: false, skipped: true, structural: deterministic.structural, dimensions: deterministic.dimensions, error: error?.message || "QA failed." };
  }
}
