declare const process: {
  env: Record<string, string | undefined>;
};

import { analysisModel, groqAnalysisModel, imageModel } from "./models.js";
import { adaptBreakdownToDesignDocument, designDocumentToLegacyBreakdown } from "../src/core/design-document.js";
import { buildDesignIntelligence } from "../src/core/analysis-pipeline.js";
import { planRecipeRenderStrategy } from "../src/core/render-strategy.js";
import { buildApprovedDifferenceContract } from "./qa-contract.js";

export { analysisModel, groqAnalysisModel, imageModel } from "./models.js";

type OcrWord = {
  text: string;
  confidence?: number;
  box: { x: number; y: number; width: number; height: number };
};

type OcrResult = {
  enabled: boolean;
  fullText: string;
  words: OcrWord[];
  error?: string;
};

export function isGptImageModel(model: string = "") {
  return model.toLowerCase().startsWith("gpt-image");
}

function parseRequestedDimensions(value: string) {
  const match = value.match(/(\d{3,4})\s*x\s*(\d{3,4})/i);
  return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
}

export function normalizeGptImage2Dimensions(dimensions: { width: number; height: number }) {
  const sourceWidth = Math.max(1, Number(dimensions.width) || 1);
  const sourceHeight = Math.max(1, Number(dimensions.height) || 1);
  const sourcePixels = sourceWidth * sourceHeight;
  const minPixels = 655_360;
  const maxPixels = 8_294_400;
  const maxEdge = 3840;
  let scale = 1;
  if (sourcePixels < minPixels) scale = Math.sqrt((minPixels * 1.01) / sourcePixels);
  if (sourcePixels > maxPixels) scale = Math.sqrt(maxPixels / sourcePixels);
  if (Math.max(sourceWidth, sourceHeight) * scale > maxEdge) {
    scale = Math.min(scale, maxEdge / Math.max(sourceWidth, sourceHeight));
  }

  const targetWidth = sourceWidth * scale;
  const targetHeight = sourceHeight * scale;
  const targetRatio = sourceWidth / sourceHeight;
  const widthStep = Math.round(targetWidth / 16);
  const heightStep = Math.round(targetHeight / 16);
  const candidates: Array<{ width: number; height: number; score: number }> = [];

  for (let widthOffset = -3; widthOffset <= 3; widthOffset += 1) {
    for (let heightOffset = -3; heightOffset <= 3; heightOffset += 1) {
      const width = Math.max(16, (widthStep + widthOffset) * 16);
      const height = Math.max(16, (heightStep + heightOffset) * 16);
      const pixels = width * height;
      const ratio = width / height;
      if (width > maxEdge || height > maxEdge || pixels < minPixels || pixels > maxPixels || ratio > 3 || ratio < 1 / 3) continue;
      const ratioError = Math.abs(Math.log(ratio / targetRatio));
      const sizeError = Math.abs(Math.log(pixels / Math.max(minPixels, Math.min(maxPixels, targetWidth * targetHeight))));
      candidates.push({ width, height, score: ratioError * 10 + sizeError });
    }
  }

  const best = candidates.sort((a, b) => a.score - b.score)[0];
  if (best) return `${best.width}x${best.height}`;

  const fallbackWidth = Math.max(16, Math.min(maxEdge, Math.round(targetWidth / 16) * 16));
  const fallbackHeight = Math.max(16, Math.min(maxEdge, Math.round(targetHeight / 16) * 16));
  return `${fallbackWidth}x${fallbackHeight}`;
}

export function mapOutputSize(
  format: string = "",
  imageSize: string = "",
  model: string = "",
  sourceDimensions?: { width: number; height: number } | null,
  matchReference = false,
) {
  const sizeChoice = imageSize.toLowerCase();
  const normalized = format.toLowerCase();
  const portraitSize = isGptImageModel(model) ? "1024x1536" : "1024x1792";
  const landscapeSize = isGptImageModel(model) ? "1536x1024" : "1792x1024";

  if (model.toLowerCase().startsWith("gpt-image-2")) {
    const requested = matchReference && sourceDimensions
      ? sourceDimensions
      : parseRequestedDimensions(imageSize) || sourceDimensions;
    if (requested?.width && requested?.height) return normalizeGptImage2Dimensions(requested);
  }

  if (sizeChoice.includes("story") || sizeChoice.includes("reel") || sizeChoice.includes("shorts") || sizeChoice.includes("portrait") || sizeChoice.includes("4:5") || sizeChoice.includes("9:16") || sizeChoice.includes("a4-portrait") || sizeChoice.includes("1080x1920") || sizeChoice.includes("1080x1350") || sizeChoice.includes("1024x1536") || sizeChoice.includes("2480x3508")) return portraitSize;
  if (sizeChoice.includes("landscape") || sizeChoice.includes("thumbnail") || sizeChoice.includes("banner") || sizeChoice.includes("cover") || sizeChoice.includes("16:9") || sizeChoice.includes("1.91:1") || sizeChoice.includes("3:1") || sizeChoice.includes("1536x1024") || sizeChoice.includes("1280x720") || sizeChoice.includes("1920x1080") || sizeChoice.includes("3000x1000") || sizeChoice.includes("3508x2480")) return landscapeSize;
  if (sizeChoice.includes("instagram-square") || sizeChoice.includes("linkedin-post") || sizeChoice.includes("1:1")) return "1024x1024";
  if (sizeChoice.includes("1024 x 1024") || sizeChoice.includes("square")) return "1024x1024";
  if (sizeChoice.includes("portrait")) return portraitSize;
  if (sizeChoice.includes("landscape")) return landscapeSize;
  if (normalized.includes("story") || normalized.includes("9:16")) return portraitSize;
  if (normalized.includes("a4") || normalized.includes("flyer")) return portraitSize;
  if (normalized.includes("landscape")) return landscapeSize;
  return "1024x1024";
}

export function mapQuality(quality: string = "", model: string = "") {
  const normalized = quality.toLowerCase();
  if (isGptImageModel(model)) return normalized.includes("premium") ? "high" : "medium";
  return normalized.includes("premium") ? "hd" : "standard";
}

export function buildMockBreakdown() {
  return {
    design: {
      metadata: { aspectRatio: "1:1", orientation: "square", colorSpace: "RGB" },
      sections: [
        { id: "hero-section", name: "Hero", bounds: "top and center area" },
        { id: "image-section", name: "Image", bounds: "main visual area" },
      ],
      styleTokens: {
        palette: { primary: "#0F172A", secondary: "#22C55E", accent: "#F8FAFC" },
        typography: { headingFont: "Space Grotesk", bodyFont: "Montserrat" },
        spacing: "standard",
        shadows: "soft",
        gradients: "none",
        effects: "clean premium layout",
        borderRadius: "rounded",
        lighting: "soft",
        visualStyle: "Premium layout",
      },
      editableComponents: [
        {
          id: "logo",
          type: "brand",
          editable: true,
          name: "Top Logo",
          content: "Brand logo",
          style: "Small logo in the top-left corner",
          layerIndex: 0,
          boundingBox: { x: 5, y: 4, width: 18, height: 8 },
          sectionId: "hero-section",
        },
        {
          id: "hero",
          type: "text",
          editable: true,
          name: "Hero Headline",
          content: "Main headline",
          style: "Primary headline text",
          layerIndex: 1,
          boundingBox: { x: 8, y: 16, width: 84, height: 14 },
          sectionId: "hero-section",
        },
        {
          id: "image",
          type: "image",
          editable: true,
          name: "Main Subject",
          content: "Primary subject",
          style: "Main subject image in the center",
          layerIndex: 2,
          boundingBox: { x: 20, y: 34, width: 60, height: 40 },
          sectionId: "image-section",
        },
        {
          id: "cta",
          type: "action",
          editable: true,
          name: "CTA Button",
          content: "Call to action",
          style: "Button near the bottom",
          layerIndex: 3,
          boundingBox: { x: 30, y: 80, width: 40, height: 9 },
          sectionId: "image-section",
        },
      ],
    },
    notes: "Mock analysis returned because API key is missing.",
  };
}



export function formatOcrForPrompt(ocr?: OcrResult) {
  if (!ocr?.enabled || !ocr.fullText.trim()) {
    return "OCR was not available for this analysis.";
  }

  const wordPreview = ocr.words
    .slice(0, 120)
    .map((word) => `${word.text} @ x:${Math.round(word.box.x)}, y:${Math.round(word.box.y)}, w:${Math.round(word.box.width)}, h:${Math.round(word.box.height)}`)
    .join("\n");

  return `OCR full text:
${ocr.fullText}

OCR word boxes:
${wordPreview}`;
}

function getBreakdownTextCorpus(breakdown: any) {
  return JSON.stringify(breakdown || {}).toLowerCase();
}

function slugifyId(value: string, fallback: string) {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || fallback;
}

function getComponentContent(component: any) {
  return String(
    component?.content ||
    component?.current?.text ||
    component?.current?.image ||
    component?.current?.description ||
    component?.image ||
    component?.text ||
    ""
  );
}

function toEditableComponent(component: any, index: number) {
  const id = slugifyId(component?.id || component?.name || `component-${index + 1}`, `component-${index + 1}`);
  const content = getComponentContent(component);

  return {
    id,
    type: component?.type || "text",
    editable: component?.editable ?? true,
    name: component?.name || component?.id || `Component ${index + 1}`,
    content,
    style: typeof component?.style === "string"
      ? component.style
      : component?.current?.description || component?.description || "",
    layerIndex: Number.isFinite(Number(component?.layerIndex)) ? Number(component.layerIndex) : index,
    boundingBox: component?.boundingBox || component?.current?.boundingBox || component?.bounds || "approx placement",
    sectionId: component?.sectionId || "main-section",
    deleted: component?.deleted,
    current: component?.current || (content ? { text: component?.type === "text" ? content : undefined, image: component?.type !== "text" ? content : undefined } : undefined),
    replacementNeeded: component?.replacementNeeded || ["Keep as-is or replace this component."],
  };
}

function normalizeBreakdownArchitecture(breakdown: any) {
  const existingDesign = breakdown?.design || {};
  const legacyConstants = breakdown?.constants || {};
  const legacySections = Array.isArray(breakdown?.sections) ? breakdown.sections : [];
  const components = Array.isArray(existingDesign.editableComponents)
    ? existingDesign.editableComponents
    : legacySections;

  const styleTokens = existingDesign.styleTokens || {
    palette: legacyConstants.colors || {
      primary: "#0F172A",
      secondary: "#22C55E",
      accent: "#F8FAFC",
    },
    typography: {
      headingFont: legacyConstants.headingFont || "Space Grotesk",
      bodyFont: legacyConstants.bodyFont || "Montserrat",
    },
    visualStyle: legacyConstants.visualStyle || "Same as uploaded design",
  };

  const sections = Array.isArray(existingDesign.sections) && existingDesign.sections.length
    ? existingDesign.sections
    : [{ id: "main-section", name: "Main Design", bounds: "full canvas" }];

  return {
    ...breakdown,
    design: {
      metadata: existingDesign.metadata || { aspectRatio: "unknown", orientation: "unknown", colorSpace: "RGB" },
      sections,
      styleTokens,
      editableComponents: components.map(toEditableComponent),
    },
  };
}

function groupOcrWordsIntoLines(ocr?: OcrResult) {
  if (!ocr?.enabled || !ocr.words.length) return [];

  const sortedWords = [...ocr.words].sort((a, b) => {
    const yDelta = a.box.y - b.box.y;
    if (Math.abs(yDelta) > 10) return yDelta;
    return a.box.x - b.box.x;
  });

  const lines: Array<{ text: string; x: number; y: number; width: number; height: number }> = [];

  for (const word of sortedWords) {
    const lastLine = lines[lines.length - 1];
    const lineThreshold = Math.max(12, word.box.height * 0.65);

    if (!lastLine || Math.abs(lastLine.y - word.box.y) > lineThreshold) {
      lines.push({
        text: word.text,
        x: word.box.x,
        y: word.box.y,
        width: word.box.width,
        height: word.box.height,
      });
      continue;
    }

    const rightEdge = Math.max(lastLine.x + lastLine.width, word.box.x + word.box.width);
    const bottomEdge = Math.max(lastLine.y + lastLine.height, word.box.y + word.box.height);
    lastLine.text = `${lastLine.text} ${word.text}`.trim();
    lastLine.x = Math.min(lastLine.x, word.box.x);
    lastLine.y = Math.min(lastLine.y, word.box.y);
    lastLine.width = rightEdge - lastLine.x;
    lastLine.height = bottomEdge - lastLine.y;
  }

  return lines.filter((line) => line.text.replace(/\s+/g, " ").trim().length > 1);
}

function enrichBreakdownWithOcrTextAtoms(breakdown: any, ocr?: OcrResult) {
  if (!breakdown || typeof breakdown !== "object") return breakdown;

  const normalizedBreakdown = normalizeBreakdownArchitecture(breakdown);
  const components = Array.isArray(normalizedBreakdown.design?.editableComponents)
    ? normalizedBreakdown.design.editableComponents
    : [];
  const textCorpus = getBreakdownTextCorpus(breakdown);
  const ocrLines = groupOcrWordsIntoLines(ocr);
  const missingTextAtoms = [];

  for (const [index, line] of ocrLines.entries()) {
    const normalizedLine = line.text.toLowerCase().replace(/\s+/g, " ").trim();
    if (!normalizedLine || textCorpus.includes(normalizedLine)) continue;

    missingTextAtoms.push({
      id: `ocr-text-${index + 1}`,
      type: "text",
      editable: true,
      name: `OCR Text ${index + 1}`,
      content: line.text,
      style: "OCR-detected text that the vision model missed.",
      layerIndex: components.length + missingTextAtoms.length,
      boundingBox: `x:${Math.round(line.x)}, y:${Math.round(line.y)}, width:${Math.round(line.width)}, height:${Math.round(line.height)}`,
      sectionId: "ocr-detected-section",
      current: {
        text: line.text,
        description: `OCR-detected text at x:${Math.round(line.x)}, y:${Math.round(line.y)}, width:${Math.round(line.width)}, height:${Math.round(line.height)}. The vision model missed this atom, so Spyda added it automatically.`,
      },
      replacementNeeded: ["Keep as-is or replace this exact text."],
    });
  }

  return {
    ...normalizedBreakdown,
    design: {
      ...normalizedBreakdown.design,
      sections: [
        ...(normalizedBreakdown.design.sections || []),
        ...(missingTextAtoms.length && !(normalizedBreakdown.design.sections || []).some((section: any) => section.id === "ocr-detected-section")
          ? [{ id: "ocr-detected-section", name: "OCR Detected Text", bounds: "OCR inferred positions" }]
          : []),
      ],
      editableComponents: [...components, ...missingTextAtoms],
    },
    notes: [breakdown.notes, missingTextAtoms.length ? `Spyda added ${missingTextAtoms.length} OCR text atom(s) that the vision model missed.` : ""]
      .filter(Boolean)
      .join(" "),
  };
}

export function validateDesignBreakdown(breakdown: any, options: AnalysisSourceMetadata & { provider?: string } = {}) {
  const normalized = normalizeBreakdownArchitecture(breakdown || {});
  const document = adaptBreakdownToDesignDocument(normalized, {
    id: options.designId,
    provider: options.provider || "legacy-adapter",
    canvas: { width: options.width, height: options.height },
    sourceAsset: { fileName: options.fileName, mimeType: options.mimeType },
  });
  return designDocumentToLegacyBreakdown(document, normalized);
}

async function addV2DesignIntelligence(
  breakdown: any,
  base64Image: string,
  ocr: OcrResult,
) {
  const intelligence = await buildDesignIntelligence({
    breakdown,
    imageDataUrl: base64Image,
    ocrWords: ocr.words,
    environment: process.env,
  });
  return { ...breakdown, ...intelligence };
}

function getLikelyJsonObject(text: string) {
  const cleaned = String(text || "")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return cleaned;
  return cleaned.slice(start, end + 1);
}

function repairAiJson(text: string) {
  return getLikelyJsonObject(text)
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, "$1");
}

export function extractJson(text: string) {
  const jsonText = getLikelyJsonObject(text);
  try {
    return JSON.parse(jsonText);
  } catch (firstError: any) {
    try {
      return JSON.parse(repairAiJson(jsonText));
    } catch (secondError: any) {
      if (!jsonText.includes("{")) throw new Error("The model response did not include JSON.");
      throw new Error(`The model returned invalid JSON: ${secondError?.message || firstError?.message || "Could not parse response."}`);
    }
  }
}

export function normalizeAiProvider(provider: string = "") {
  return provider.toLowerCase().includes("groq") ? "groq" : "openai";
}

export function getBreakdownPrompt(ocr?: OcrResult) {
  return `You are Spyda, a visual design breakdown engine. Analyze the uploaded flyer/design following the Spyda Flyer Reconstruction Architecture.
Identify every visible component that forms the design. Capture exact visible text. Be exhaustive.
Return 16 to 35 editable atoms when the design is complex. Do not collapse multiple visible items into one vague atom.
Break down: headline, subheadline, each text block, each CTA, each logo, each icon, each badge, each product/app screenshot, each person/subject, each sticker, each background shape, each line/wave/blob/pattern, each footer/social/contact detail, and each decorative overlay.
Classify words as "text" or "action", logos as "brand", photos/products/app screens as "image", shapes/patterns/background marks as "decor", and color/font/style rules as "style".

Use the OCR data below as the source of truth for all readable text. If OCR text appears in the flyer, preserve it exactly in the matching atom and use the OCR coordinates to infer where it belongs.
${formatOcrForPrompt(ocr)}

BOUNDING BOXES ARE CRITICAL: every editableComponent must include a numeric boundingBox measured as PERCENTAGES of the full image (0-100), where x,y is the element's top-left corner and width,height is its tight visual footprint. Spyda uses these numbers to place replacement assets pixel-exactly, so measure each element carefully against the actual image. Example: a logo in the top-left tenth of the flyer is {"x": 4, "y": 3, "width": 14, "height": 6}.

Return ONLY valid JSON with no markdown formatting matching this exact architecture:
{
  "design": {
    "metadata": { "aspectRatio": "e.g. 16:9", "orientation": "portrait", "colorSpace": "RGB" },
    "sections": [
      { "id": "hero-section", "name": "Hero", "bounds": "approximate layout box" }
    ],
    "styleTokens": {
      "palette": { "primary": "dominant HEX", "secondary": "support HEX", "accent": "highlight HEX" },
      "typography": { "headingFont": "suggested font", "bodyFont": "suggested font" },
      "spacing": "dense/loose/standard",
      "shadows": "soft/hard/none",
      "gradients": "linear/radial/none",
      "effects": "glow/blur/texture",
      "borderRadius": "sharp/rounded",
      "lighting": "flat/dramatic/soft"
    },
    "editableComponents": [
      {
        "id": "unique-id",
        "type": "text|image|style|color|action|brand|decor",
        "editable": true,
        "name": "Component Name",
        "content": "exact visible text or image description",
        "style": "visual description, color, size",
        "layerIndex": 0,
        "boundingBox": { "x": 0, "y": 0, "width": 0, "height": 0 },
        "sectionId": "hero-section"
      }
    ]
  }
}`;
}

export async function analyzeDesignWithGroq(base64Image: string, prompt: string) {
  const groqKey = process.env.GROQ_API_KEY || "";
  if (!groqKey) throw new Error("GROQ_API_KEY is not configured.");

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${groqKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: groqAnalysisModel, temperature: 0.2, max_completion_tokens: 1800,
      messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: base64Image } }] }]
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq API Error: ${err}`);
  }

  const payload = await response.json();
  return { ok: true, mode: "groq", breakdown: extractJson(payload.choices?.[0]?.message?.content || "") };
}

export async function analyzeDesignWithOpenAI(base64Image: string, prompt: string) {
  const openaiKey = process.env.OPENAI_API_KEY || "";
  if (!openaiKey) throw new Error("OPENAI_API_KEY is not configured.");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: analysisModel,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: base64Image } }] }]
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || "OpenAI request failed.");
  }

  const payload = await response.json();
  return extractJson(payload.choices?.[0]?.message?.content || "");
}

export async function verifyBreakdownWithOpenAI(base64Image: string, firstBreakdown: any, ocr?: OcrResult) {
  const openaiKey = process.env.OPENAI_API_KEY || "";
  if (!openaiKey) return firstBreakdown;

  const verifierPrompt = `You are Spyda's strict design atom verifier.
Your job is to audit and expand an existing flyer breakdown. Do not summarize. Do not remove valid atoms.
Compare the uploaded flyer, OCR data, and existing breakdown. Return a complete merged JSON breakdown with every missing visible atom added.
Pay special attention to tiny footer text, logos, social/contact details, icons, stickers, price tags, app screens, badges, background shapes, shadows, gradients, borders, and decorative marks.
If the existing breakdown missed any OCR text, add it as its own text atom.

OCR data:
${formatOcrForPrompt(ocr)}

Existing breakdown:
${JSON.stringify(firstBreakdown, null, 2)}

Return ONLY valid JSON in this exact architecture:
{
  "design": {
    "metadata": { "aspectRatio": "e.g. 16:9", "orientation": "portrait", "colorSpace": "RGB" },
    "sections": [
      { "id": "hero-section", "name": "Hero", "bounds": "approximate layout box" }
    ],
    "styleTokens": {
      "palette": { "primary": "dominant HEX", "secondary": "support HEX", "accent": "highlight HEX" },
      "typography": { "headingFont": "suggested font", "bodyFont": "suggested font" },
      "spacing": "dense/loose/standard",
      "shadows": "soft/hard/none",
      "gradients": "linear/radial/none",
      "effects": "glow/blur/texture",
      "borderRadius": "sharp/rounded",
      "lighting": "flat/dramatic/soft"
    },
    "editableComponents": [
      {
        "id": "unique-id",
        "type": "text|image|style|color|action|brand|decor",
        "editable": true,
        "name": "Component Name",
        "content": "exact visible text or image description",
        "style": "visual description, color, size",
        "layerIndex": 0,
        "boundingBox": { "x": 0, "y": 0, "width": 0, "height": 0 },
        "sectionId": "hero-section"
      }
    ]
  }
}`;

  return analyzeDesignWithOpenAI(base64Image, verifierPrompt);
}

type AnalysisSourceMetadata = {
  designId?: string;
  width?: number;
  height?: number;
  fileName?: string;
  mimeType?: string;
};

export async function analyzeDesign(
  base64Image: string,
  provider = "openai",
  ocr: OcrResult = { enabled: false, fullText: "", words: [] },
  sourceMetadata: AnalysisSourceMetadata = {},
) {
  const prompt = getBreakdownPrompt(ocr);

  if (normalizeAiProvider(provider) === "groq") {
    const result = await analyzeDesignWithGroq(base64Image, prompt);
    const verifiedBreakdown = await verifyBreakdownWithOpenAI(base64Image, result.breakdown, ocr).catch(() => result.breakdown);
    const normalizedBreakdown = validateDesignBreakdown(enrichBreakdownWithOcrTextAtoms(verifiedBreakdown, ocr), { ...sourceMetadata, provider: "groq+openai" });
    return {
      ...result,
      mode: "groq+openai-verified",
      breakdown: await addV2DesignIntelligence(normalizedBreakdown, base64Image, ocr),
      ocr,
    };
  }

  const openaiKey = process.env.OPENAI_API_KEY || "";
  if (!openaiKey) {
    const normalizedBreakdown = validateDesignBreakdown(buildMockBreakdown(), { ...sourceMetadata, provider: "mock" });
    return { ok: true, mode: "mock", breakdown: await addV2DesignIntelligence(normalizedBreakdown, base64Image, ocr) };
  }

  const breakdown = await analyzeDesignWithOpenAI(base64Image, prompt);
  const normalizedBreakdown = validateDesignBreakdown(enrichBreakdownWithOcrTextAtoms(breakdown, ocr), { ...sourceMetadata, provider: "openai" });
  return {
    ok: true,
    mode: "openai",
    breakdown: await addV2DesignIntelligence(normalizedBreakdown, base64Image, ocr),
    ocr,
  };
}

function sanitizeRecipeForPrompt(recipe: any) {
  const attachedReferenceIds = new Set(getReferenceImages(recipe).map((image: any) => image.sectionId));
  const imageInputOffset = (recipe?.sourceReferenceImage?.dataUrl ? 1 : 0) + (recipe?.childSourceImage?.dataUrl ? 1 : 0) + (recipe?.essentialsImage?.dataUrl ? 1 : 0);
  const childSourceInput = recipe?.childSourceImage?.dataUrl ? 1 : null;
  const sourceReferenceInput = recipe?.sourceReferenceImage?.dataUrl ? (recipe?.childSourceImage?.dataUrl ? 2 : 1) : null;

  return {
    ...recipe,
    sourceReferenceImage: recipe?.sourceReferenceImage?.dataUrl
      ? {
          name: recipe.sourceReferenceImage.name || "Active parent source",
          role: recipe.sourceReferenceImage.role || "source-layout-reference",
          isLatestGeneratedParent: Boolean(recipe.sourceReferenceImage.isLatestGeneratedParent),
          dataUrl: `[attached separately as image input ${sourceReferenceInput}]`,
        }
      : undefined,
    childSourceImage: recipe?.childSourceImage?.dataUrl
      ? {
          name: recipe.childSourceImage.name || "Current child source",
          role: "current-working-design",
          dataUrl: `[attached separately as image input ${childSourceInput}]`,
        }
      : undefined,
    essentialsImage: recipe?.essentialsImage?.dataUrl
      ? {
          name: recipe.essentialsImage.name || "Essentials reference image",
          role: "user-provided essentials reference",
          dataUrl: "[attached separately as essentials image input]",
        }
      : undefined,
    referenceImages: Array.isArray(recipe?.referenceImages)
      ? recipe.referenceImages.map((image: any, index: number) => ({
          referenceInput: index + 1 + imageInputOffset,
          sectionId: image.sectionId,
          sectionName: image.sectionName,
          sectionType: image.sectionType,
          name: image.name,
          originalBoundingBox: image.originalBoundingBox,
          originalContent: image.originalContent,
          originalStyle: image.originalStyle,
          sizeRule: image.sizeRule || "Match the replaced atom's exact visible size, scale, crop, and position. Never enlarge beyond the original footprint.",
          dataUrl: attachedReferenceIds.has(image.sectionId)
            ? "[attached separately as image input]"
            : "[not attached to keep the generation request fast; use this as text-only direction]",
        }))
      : [],
  };
}

/*
 * Composite-mode prompt: the client has already baked every replacement asset
 * into the attached image at its exact final position and size (deterministic
 * canvas placement). The model's only jobs are blending, text edits, and
 * optional brand styling — so the prompt is short and direct, the way the
 * same edit would be asked for in ChatGPT.
 */
function buildCompositePrompt(recipe: any) {
  const pastedAssets = Array.isArray(recipe?.pastedAssets) ? recipe.pastedAssets : [];
  const textEdits = Array.isArray(recipe?.textEdits) ? recipe.textEdits : [];
  const otherEdits = Array.isArray(recipe?.otherEdits) ? recipe.otherEdits : [];
  const essentials = Array.isArray(recipe?.essentials) ? recipe.essentials.filter(Boolean) : [];
  const brand = recipe?.brandOverrides || null;
  const unplacedAssets = getReferenceImages(recipe);
  const qaViolations = Array.isArray(recipe?.qaCorrections?.violations) ? recipe.qaCorrections.violations : [];
  const approvalContract = buildApprovedDifferenceContract(recipe);
  const layoutGrid = recipe?.layoutGridGuide;

  const sections: string[] = [];

  sections.push(`You are refining an existing flyer design. The first attached image is the flyer to finish — it is the layout ground truth. Work like a careful photo retoucher, not a designer: do not recompose, restructure, or reinterpret anything.`);

  if (layoutGrid?.columns && layoutGrid?.rows) {
    const gridAtoms = Array.isArray(layoutGrid.atoms) ? layoutGrid.atoms.slice(0, 45) : [];
    sections.push(`LAYOUT GRID LOCK (MANDATORY):
- The parent is measured on a ${layoutGrid.columns}-column by ${layoutGrid.rows}-row normalized grid. Use this grid as a geometry constraint, but do not draw the grid in the output.
- Canvas coordinates run from 0 to 100. No atom, replacement, shadow, badge, footer detail, or important content may extend outside that canvas.
- Measured safe area: ${JSON.stringify(layoutGrid.safeArea || {})}.
- Keep unchanged atoms in their exact normalized bounds. Keep changed atoms inside the exact footprint they replace.
${gridAtoms.map((atom: any) => `- "${atom.name}" (${atom.type}) occupies columns ${atom.gridCell?.columnStart}-${atom.gridCell?.columnEnd}, rows ${atom.gridCell?.rowStart}-${atom.gridCell?.rowEnd}, exact bounds ${JSON.stringify(atom.bounds)}.`).join("\n")}
Do not enlarge the internal composition, compress it, shift it, or allow any element to escape its measured cells. The grid is a hidden reconstruction guide, never a visible design element.`);
  }

  if (approvalContract.unchangedText.length) {
    sections.push(`COPY LOCK — KEEP THIS WORDING EXACTLY:
${approvalContract.unchangedText.slice(0, 45).map(item => `- "${item.requiredText}" in the "${item.atom}" region.`).join("\n")}
Do not rewrite, improve, paraphrase, translate, or replace any locked copy with plausible marketing text. New wording is allowed only in TEXT CHANGES or MUST-FOLLOW INSTRUCTIONS below.`);
  }

  if (approvalContract.protectedAssets.length) {
    sections.push(`PROTECTED IDENTITY ASSETS:
${approvalContract.protectedAssets.slice(0, 30).map(item => `- "${item.atom}" (${item.identity}) at ${JSON.stringify(item.boundingBox)}.`).join("\n")}
Keep each protected asset visually identical to the parent: same identity, intrinsic colors, crop, size, position, and marks. Brand styling must not alter these assets.`);
  }

  if (pastedAssets.length) {
    sections.push(`ALREADY-PLACED REPLACEMENTS:
${pastedAssets.map((asset: any) => `- "${asset.name || 'Replacement asset'}" REPLACES "${asset.originalContent || asset.atomName || 'the previous asset'}" in the "${asset.atomName || 'replaced element'}" slot. It already sits at its final, correct position and size.`).join("\n")}
This is a true one-for-one replacement. Completely remove the previous asset identity from each listed slot: the old and new assets must never coexist, overlap, ghost through, or appear as duplicates. Exactly one replacement asset must be visible in each changed slot.
These pasted assets may look slightly cut-out. Blend each one into the design naturally — clean edges, matching lighting, and shadows consistent with the rest of the flyer — while keeping its EXACT position, EXACT size, EXACT proportions, intrinsic colors, and exact content. Never enlarge, shrink, move, crop, restyle, recolor, redraw, duplicate, decorate, or add text or marks to them.`);
  }

  if (recipe?.editMask?.dataUrl) {
    sections.push(`EDIT BOUNDARY:
An edit mask limits this round to the selected atom regions. Make the requested changes inside those regions and preserve everything outside them exactly. Do not reinterpret, redraw, recolor, resize, or move unmasked content.`);
  }

  if (textEdits.length) {
    sections.push(`TEXT CHANGES (apply in place):
${textEdits.map((edit: any) => `- In the "${edit.atomName || 'text'}" region, replace the text "${edit.from || ''}" with "${edit.to || ''}".`).join("\n")}
Render each new text with the same font style, size, color, alignment, and position as the text it replaces, fitted inside the same text region. If the new text is longer, tighten the letter-spacing or wrap lines — never grow the region.`);
  }

  if (otherEdits.length) {
    sections.push(`OTHER EDITS:
${otherEdits.map((edit: any) => `- "${edit.atomName || 'element'}": ${edit.instruction || ''} (keep this element in its current region at its current size unless the instruction explicitly says otherwise)`).join("\n")}`);
  }

  if (unplacedAssets.length) {
    const offset = 1 + (recipe?.essentialsImage?.dataUrl ? 1 : 0);
    sections.push(`ADDITIONAL ATTACHED ASSETS:
${unplacedAssets.map((image: any, index: number) => `- Attached image ${index + 1 + offset}: "${image.name}" replaces "${image.originalContent || image.sectionName}". Place it exactly where that element sits in the flyer, at the same visible width and height as the element it replaces. Scale it down to fit that footprint if needed — never enlarge it, never let it overflow the flyer, never let it overlap neighbors. Preserve its identity exactly.`).join("\n")}`);
  }

  if (recipe?.essentialsImage?.dataUrl) {
    sections.push(`ESSENTIALS IMAGE: the attached image "${recipe.essentialsImage.name || 'Essentials reference'}" is a hard visual requirement from the user. Use it exactly as the essentials instructions describe, preserving its identity.`);
  }

  if (brand) {
    const brandLines = [
      brand.headingFont ? `- Heading font direction: ${brand.headingFont}.` : "",
      brand.bodyFont ? `- Body font direction: ${brand.bodyFont}.` : "",
      brand.primaryColor ? `- Primary color (60%): ${brand.primaryColor}.` : "",
      brand.secondaryColor ? `- Secondary color (30%): ${brand.secondaryColor}.` : "",
      brand.accentColor ? `- Accent color (10%): ${brand.accentColor}.` : "",
      brand.visualStyle ? `- Visual style: ${brand.visualStyle}.` : "",
    ].filter(Boolean).join("\n");
    sections.push(`BRAND STYLE OVERRIDES (apply globally without changing the layout):
${brandLines}
Restyle backgrounds, gradients, buttons, and decorative surfaces with these values, but never recolor pasted replacement assets, logos, photos, product shots, QR codes, or badges.`);
  }

  if (essentials.length) {
    sections.push(`MUST-FOLLOW INSTRUCTIONS:
${essentials.map((item: string) => `- ${item}`).join("\n")}`);
  }

  if (qaViolations.length) {
    sections.push(`QA CORRECTIONS (the previous attempt failed these checks — fix every one):
${qaViolations.map((violation: string) => `- ${violation}`).join("\n")}`);
  }

  const dims = recipe?.sourceDimensions;
  const appearanceRule = brand
    ? "apply only the approved Brand Style Overrides to editable style surfaces while preserving the same background geometry"
    : "keep the same colors and background";
  sections.push(`EVERYTHING ELSE: keep the flyer pixel-faithful to the attached image — same layout, same element sizes and positions, ${appearanceRule}, same aspect ratio${dims?.width ? ` (${dims.width} x ${dims.height})` : ""}. Do not add or remove elements. Output a clean, premium, print-quality flyer.`);

  return sections.join("\n\n");
}

export function buildGenerationPrompt(recipe: any) {
  if (recipe?.compositeMode) return buildCompositePrompt(recipe);
  const attachedReferenceImages = getReferenceImages(recipe);
  const hasSourceReference = Boolean(recipe?.sourceReferenceImage?.dataUrl);
  const hasChildSource = Boolean(recipe?.childSourceImage?.dataUrl);
  const hasEssentialsImage = Boolean(recipe?.essentialsImage?.dataUrl);
  const imageInputOffset = (hasSourceReference ? 1 : 0) + (hasChildSource ? 1 : 0) + (hasEssentialsImage ? 1 : 0);
  const childSourceInput = hasChildSource ? 1 : null;
  const sourceReferenceInput = hasSourceReference ? (hasChildSource ? 2 : 1) : null;
  const referenceImageInstructions = attachedReferenceImages.length
    ? `
REFERENCE IMAGE REQUIREMENTS:
${attachedReferenceImages.map((image: any, index: number) => `- Input image ${index + 1 + imageInputOffset}: "${image.name}" belongs to section "${image.sectionName}" (${image.sectionId}). It is mandatory. Preserve the uploaded asset's identity as closely as possible and place it in the generated flyer according to that section's placement/role. Do not recolor, redraw, stylize, decorate, add marks to, add text to, crop away, or invent extra details on this uploaded asset unless constants.essentials explicitly asks for that exact change.
  SIZE LOCK for input image ${index + 1 + imageInputOffset}: it replaces the original atom "${image.originalContent || image.sectionName}" located at ${image.originalBoundingBox || "the original atom's region"}. Render it at exactly the same visible width, height, scale, crop, and position as that original atom — measure the original atom's footprint in the Source/Child Source and fit this replacement inside that same footprint. The uploaded file's own resolution or dimensions are irrelevant: if it is larger, scale it DOWN to the original footprint. Never enlarge it, never let it overflow the flyer edges, never let it push or overlap neighboring atoms.`).join("\n")}
`
    : "";
  const qaCorrectionViolations = Array.isArray(recipe?.qaCorrections?.violations) ? recipe.qaCorrections.violations : [];
  const qaCorrectionInstructions = qaCorrectionViolations.length
    ? `QA CORRECTIONS (MANDATORY — THE PREVIOUS ATTEMPT FAILED THESE CHECKS):
- ${recipe.qaCorrections.instruction || "Fix every listed violation while keeping everything else identical to the previous recipe."}
${qaCorrectionViolations.map((violation: string) => `- FIX: ${violation}`).join("\n")}
`
    : "";
  const replacementSizeInstructions = `REPLACEMENT SIZE MATCHING (CRITICAL — HIGHEST PRIORITY RULE):
- Every replacement (text, logo, image, product, subject) inherits the EXACT size of the element it replaces. The original atom's visible footprint in the Source/Child Source is the sizing truth — never the uploaded replacement file's own dimensions.
- Replacement text: render at the same font size, weight scale, and text-block width/height as the original text it replaces. If the new text is longer, reduce font size or add line breaks to stay inside the original text box; never grow the box.
- Replacement logos: a logo replacing another logo occupies the identical bounding region — same visible width, same visible height, same position, same clear space around it. A high-resolution upload must be scaled down to the original logo's footprint. The logo must never be larger than the original, never bleed off the flyer edge, and never overlap other elements.
- Replacement images/photos/products: fit inside the original image region with the same crop and scale relationship. Do not zoom in, do not expand the region.
- Nothing replaced may fall outside the flyer canvas or intrude into neighboring atom regions. If a replacement cannot fit at the original size, scale it down — never up.
`;
  const layoutLockAtoms = Array.isArray(recipe?.layoutLock?.atoms) ? recipe.layoutLock.atoms : [];
  const layoutLockInstructions = layoutLockAtoms.length
    ? `SOURCE REGION LOCK:
- Treat recipe.layoutLock.atoms as a locked Photoshop layer map extracted from the Source flyer.
- Every atom, selected or unselected, must remain inside its original boundingBox/region with the same relative position, width, height, scale, spacing, layer order, and visual weight.
- The output must not recompose the flyer. Do not expand the headline area, crop the logo area, enlarge the subject, push footer/contact details off-canvas, move QR/contact regions, or stretch the background.
- If replacement text is longer or shorter than the original, fit it into the exact original text box size by adjusting line breaks, font size, tracking, and line-height. Never make the text block wider, taller, or visually heavier than the parent text region.
- If replacing an image, logo, product, or subject, fit the replacement into the exact original image/logo region. The new asset must use the same apparent width and height as the removed asset, preserve the original crop, scale relationship, and surrounding whitespace, and must not spill outside the flyer.
- Logos must remain logo-sized. Do not enlarge replacement logos to fill a card, badge, header, or decorative zone; match the parent logo's visible size and placement.
- Photos/products/subjects must inherit the parent atom's visible size. Do not expand a replacement subject just because the uploaded replacement image has more detail.
- Use Source/Child Source comparison as the final judge: after editing, the logo region, headline region, subheadline region, main subject/product region, side-card regions, footer/contact region, QR region, and background structure should occupy the same areas as before.
`
    : "";
  const sourceReferenceInstructions = hasSourceReference
    ? `SOURCE REFERENCE LAYOUT REQUIREMENTS:
- Input image ${sourceReferenceInput} is the active parent Source flyer for this round${recipe?.sourceReferenceImage?.isLatestGeneratedParent ? " (the latest generated flyer from the previous round)" : " (the original uploaded flyer)"}.
- Treat input image ${sourceReferenceInput} as the current layout truth for this round. It is used for comparison and must become the parent baseline for the next edit.
- Every output must stay visually close to input image ${sourceReferenceInput}: same layout grid, hierarchy, spacing rhythm, typography scale relationship, background structure, visual weight, and overall design direction.
`
    : "";
  const childSourceInstructions = hasChildSource
    ? `CHILD SOURCE UPDATE REQUIREMENTS:
- Input image ${childSourceInput} is the current Child Source and is the primary image to edit.
- Update input image ${childSourceInput} only with the current editRound changes. Do not restart from scratch.
- Preserve all previously applied edits already visible in the Child Source.
- Do not reapply or reinterpret atoms listed in editRound.previouslyEditedAtomIds.
- Apply exactly the current round's selected atoms and Essential prompts, up to 3 focused changes, with premium realistic integration.
- Lock unchanged elements to their existing Child Source positions, scale, crop, and visual hierarchy.
- Do not enlarge, stretch, vertically expand, reposition, or recrop unchanged elements.
- Do not squeeze, compress, or shrink the internal artwork to make it fit the canvas. Keep the Child Source's natural element scale and margins.
- Preserve the top logo area, headline block, subheadline, phone/product/device positions, footer CTA bar, margins, and spacing unless one of those exact atoms is selected in this round.
`
    : "";
  const essentialsImageInstruction = hasEssentialsImage
    ? `ESSENTIALS IMAGE REQUIREMENT:
- One attached image is the user's Essentials reference: "${recipe.essentialsImage.name || "Essentials reference image"}".
- Treat it as a hard visual requirement together with constants.essentials. Use it for the specific logo, product, screenshot, subject, mood, or detail the user wants included.
- Preserve this Essentials image's identity exactly unless the Essential text explicitly asks to recolor, restyle, crop, or modify it.
`
    : "";
  const brandConstants = recipe?.styleTokens || {};
  const brandConstantsInstructions = `MANDATORY BRAND CONSTANTS:
- These constants are global and must be applied to the entire flyer. They are not part of the 3-change edit limit.
- Use the exact heading font direction: ${brandConstants?.typography?.headingFont || "Space Grotesk"}.
- Use the exact body font direction: ${brandConstants?.typography?.bodyFont || "Montserrat"}.
- Use the exact 60/30/10 color system:
  - Primary / 60%: ${brandConstants?.palette?.primary || "#0F172A"}
  - Secondary / 30%: ${brandConstants?.palette?.secondary || "#22C55E"}
  - Accent / 10%: ${brandConstants?.palette?.accent || "#F8FAFC"}
- Use the visual style exactly as direction: ${brandConstants?.visualStyle || "Same premium visual style as the uploaded reference"}.
- Recolor the overall flyer feel through this palette, including background fields, gradient stops, CTA surfaces, highlights, shadows/glows, badges, overlays, text emphasis, and decorative marks.
- If the Source or Child Source uses gradients, keep the same gradient direction, softness, blending, and premium feel, but replace the gradient colors with the selected brand constants.
- Do not apply brand recoloring to uploaded logos, uploaded replacement images, photos, product screenshots, QR codes, app store badges, social icons, or contact icons unless constants.essentials explicitly says to recolor those exact assets.
- Preserve logos and uploaded image assets as identity objects, not style surfaces. Do not add extra symbols, borders, letters, decorations, or invented brand marks to them.
- Do not invent a different palette. Do not replace the selected HEX colors with approximate colors.
- Keep layout, hierarchy, and unchanged content close to the Source/Child Source, but apply this brand styling globally.
`;
  const outputSizeInstruction = recipe?.imageSize
    ? `OUTPUT SIZE REQUIREMENT:
- Target output: ${recipe.outputSizeLabel || recipe.imageSize} (${recipe.imageSize}).
- Preserve the chosen aspect ratio and compose the flyer for that platform. If the model canvas is an approximation, keep all important content within the intended safe area and avoid changing the uploaded reference structure unnecessarily.
- The uploaded reference's original aspect setting was: ${recipe.sourceImageSize || "not provided"}.
- The uploaded reference's exact pixel dimensions were: ${recipe?.sourceDimensions?.width || "unknown"} x ${recipe?.sourceDimensions?.height || "unknown"}. Match that aspect ratio exactly.
- Fill the full output canvas edge-to-edge with the same internal scale, margins, and bounding boxes as the Source/Child Source. Do not letterbox, pillarbox, or compress the composition inside the canvas.
`
    : "";

  return `Create a finished premium graphic design based on this Spyda recipe.
This is Phase 12 (AI Reconstruction) of the Spyda Flyer Reconstruction Architecture.
Apply Content Normalization to user inputs, preserve original layer hierarchy, bounds, and layout, and apply the extracted styleTokens (gradients, shadows, effects) to produce a highly accurate, aesthetic replica.
Keep text clean, legible, and professionally composed.
This is an in-place Child Source update, not a full redesign. The safest output is one that looks like the Child Source with only the requested 3 changes applied.
${qaCorrectionInstructions}
${replacementSizeInstructions}
${sourceReferenceInstructions}
${childSourceInstructions}
${essentialsImageInstruction}
${layoutLockInstructions}
${outputSizeInstruction}
${brandConstantsInstructions}
Use only the selected editableComponents for content changes this round. Do not change unrelated text, logos, products, subjects, positions, or layout.
However, always apply the Mandatory Brand Constants globally across the full flyer; brand color, font, and gradient restyling does not count as one of the 3 content changes.
If the user customized an atom, prioritize that replacement over the original.
If constants.essentials contains instructions, treat them as hard requirements. Essentials override style preferences when they conflict, but preserve the mandatory brand constants unless the Essential prompt explicitly replaces one.
Do not omit user-specified logos, uploaded assets, offers, contact details, disclaimers, CTA text, product names, colors, or exact footer details.
For every section with replacementAsset, use the matching input reference image and include it visibly in the flyer.
${referenceImageInstructions}
Recipe:
${JSON.stringify(sanitizeRecipeForPrompt(recipe), null, 2)}`;
}

function dataUrlToBlob(dataUrl: string) {
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match) throw new Error("Invalid reference image data.");
  const [, mimeType, base64] = match;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

function getReferenceImages(recipe: any) {
  if (!Array.isArray(recipe?.referenceImages)) return [];
  return recipe.referenceImages
    .filter((image: any) => image?.dataUrl && image?.sectionId)
    .slice(0, 5);
}

function getImageEditInputs(recipe: any) {
  const inputs = [];

  if (recipe?.childSourceImage?.dataUrl) {
    inputs.push({
      sectionId: "child-source",
      sectionName: "Current Child Source",
      sectionType: "child-source",
      name: recipe.childSourceImage.name || "Current child source",
      dataUrl: recipe.childSourceImage.dataUrl,
    });
  }

  if (recipe?.compositeMode) {
    // Composite mode: the child source already contains every placed
    // replacement, so it is the single layout truth. Only the essentials
    // image and un-placed fallback assets ride along.
    if (recipe?.essentialsImage?.dataUrl) {
      inputs.push({
        sectionId: "essentials-reference",
        sectionName: "Essentials Reference Image",
        sectionType: "essentials",
        name: recipe.essentialsImage.name || "Essentials reference image",
        dataUrl: recipe.essentialsImage.dataUrl,
      });
    }
    return [...inputs, ...getReferenceImages(recipe)];
  }

  if (recipe?.sourceReferenceImage?.dataUrl) {
    inputs.push({
      sectionId: "source-reference",
      sectionName: "Uploaded Reference Flyer",
      sectionType: "source",
      name: recipe.sourceReferenceImage.name || "Uploaded reference flyer",
      dataUrl: recipe.sourceReferenceImage.dataUrl,
    });
  }

  if (recipe?.essentialsImage?.dataUrl) {
    inputs.push({
      sectionId: "essentials-reference",
      sectionName: "Essentials Reference Image",
      sectionType: "essentials",
      name: recipe.essentialsImage.name || "Essentials reference image",
      dataUrl: recipe.essentialsImage.dataUrl,
    });
  }

  return [...inputs, ...getReferenceImages(recipe)];
}

function buildImageEditForm({
  model,
  prompt,
  size,
  quality,
  referenceImages,
  maskDataUrl,
  imageFieldName,
}: {
  model: string;
  prompt: string;
  size: string;
  quality: string;
  referenceImages: any[];
  maskDataUrl?: string | null;
  imageFieldName: "image" | "image[]";
}) {
  const form = new FormData();
  form.append("model", model);
  form.append("prompt", prompt);
  form.append("size", size);
  form.append("quality", quality);
  form.append("output_format", "webp");
  form.append("output_compression", "86");

  for (const [index, image] of referenceImages.entries()) {
    const blob = dataUrlToBlob(image.dataUrl);
    const extension = blob.type.includes("png") ? "png" : "jpg";
    form.append(imageFieldName, blob, `reference-${index + 1}-${image.sectionId}.${extension}`);
  }

  if (maskDataUrl) {
    const maskBlob = dataUrlToBlob(maskDataUrl);
    const extension = maskBlob.type.includes("webp") ? "webp" : "png";
    form.append("mask", maskBlob, `edit-mask.${extension}`);
  }

  return form;
}

function normalizeGeneratedImageOutput(value: string | null | undefined, mimeType = "image/webp") {
  if (!value || value.startsWith("http") || value.startsWith("data:image/")) return value || null;
  return `data:${mimeType};base64,${value}`;
}

async function requestOpenAiImageEdit({
  openaiKey,
  model,
  prompt,
  size,
  quality,
  referenceImages,
  maskDataUrl,
  imageFieldName,
}: {
  openaiKey: string;
  model: string;
  prompt: string;
  size: string;
  quality: string;
  referenceImages: any[];
  maskDataUrl?: string | null;
  imageFieldName: "image" | "image[]";
}) {
  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { "Authorization": `Bearer ${openaiKey}` },
    body: buildImageEditForm({ model, prompt, size, quality, referenceImages, maskDataUrl, imageFieldName }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || "OpenAI image edit failed.");
  }

  return response.json();
}

export async function generateDesign({ recipe }: { recipe: any }) {
  const renderPlan = planRecipeRenderStrategy(recipe || {});
  if (!renderPlan.invokeImageModel && recipe?.childSourceImage?.dataUrl) {
    return {
      ok: true,
      mode: renderPlan.mode,
      model: "deterministic",
      image: recipe.childSourceImage.dataUrl,
      renderPlan,
    };
  }

  const openaiKey = process.env.OPENAI_API_KEY || "";
  if (!openaiKey) throw new Error("OPENAI_API_KEY is not configured for this AI-assisted edit.");

  const prompt = buildGenerationPrompt(recipe);
  const actualModel = imageModel || "gpt-image-1.5";
  const size = mapOutputSize(
    recipe?.format,
    recipe?.imageSize,
    actualModel,
    recipe?.sourceDimensions,
    recipe?.matchReference === true,
  );
  const quality = mapQuality(recipe?.quality, actualModel);
  const referenceImages = getImageEditInputs(recipe);
  const maskDataUrl = recipe?.editMask?.dataUrl || null;

  if (referenceImages.length && isGptImageModel(actualModel)) {
    let payload;
    try {
      payload = await requestOpenAiImageEdit({
        openaiKey,
        model: actualModel,
        prompt,
        size,
        quality,
        referenceImages,
        maskDataUrl,
        imageFieldName: "image[]",
      });
    } catch (error: any) {
      const message = String(error?.message || "");
      if (!/image\[\]|image/i.test(message)) throw error;
      payload = await requestOpenAiImageEdit({
        openaiKey,
        model: actualModel,
        prompt,
        size,
        quality,
        referenceImages,
        maskDataUrl,
        imageFieldName: "image",
      });
    }

    return {
      ok: true,
      mode: "openai-edit",
      model: actualModel,
      image: normalizeGeneratedImageOutput(payload.data?.[0]?.b64_json || payload.data?.[0]?.url),
      renderPlan,
    };
  }

  const requestBody: Record<string, unknown> = { model: actualModel, prompt, size, quality };

  if (isGptImageModel(actualModel)) {
    requestBody.output_format = "webp";
    requestBody.output_compression = 86;
  } else {
    requestBody.response_format = "b64_json";
  }

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || "OpenAI generation failed.");
  }

  const payload = await response.json();
  return {
    ok: true,
    mode: "openai",
    model: actualModel,
    image: normalizeGeneratedImageOutput(payload.data?.[0]?.b64_json || payload.data?.[0]?.url),
    renderPlan,
  };
}
