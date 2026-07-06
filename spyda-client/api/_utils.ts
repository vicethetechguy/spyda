declare const process: {
  env: Record<string, string | undefined>;
};

import vision from "@google-cloud/vision";

export const imageModel = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2"; 
export const analysisModel = process.env.OPENAI_ANALYSIS_MODEL || "gpt-4o";
export const groqAnalysisModel = process.env.GROQ_ANALYSIS_MODEL || "llama-3.2-90b-vision-preview";

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

export function mapOutputSize(format: string = "", imageSize: string = "", model: string = "") {
  const sizeChoice = imageSize.toLowerCase();
  const normalized = format.toLowerCase();
  const portraitSize = isGptImageModel(model) ? "1024x1536" : "1024x1792";
  const landscapeSize = isGptImageModel(model) ? "1536x1024" : "1792x1024";

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
    sections: [
      { id: "hero", name: "Hero Section", type: "text", current: { text: "Main headline" }, replacementNeeded: ["New headline"] },
      { id: "image", name: "Image Layer", type: "image", current: { image: "Primary subject" }, replacementNeeded: ["Replacement subject image"] },
    ],
    constants: {
      headingFont: "Space Grotesk", bodyFont: "Montserrat",
      colors: { primary: "#0F172A", secondary: "#22C55E", accent: "#F8FAFC" },
      visualStyle: "Premium layout",
    },
    notes: "Mock analysis returned because API key is missing.",
  };
}

function getGoogleVisionCredentials() {
  const base64Credentials = process.env.GOOGLE_CLOUD_VISION_CREDENTIALS_BASE64 || "";
  const jsonCredentials = process.env.GOOGLE_CLOUD_VISION_CREDENTIALS_JSON || "";

  if (base64Credentials) {
    return JSON.parse(Buffer.from(base64Credentials, "base64").toString("utf8"));
  }

  if (jsonCredentials) {
    return JSON.parse(jsonCredentials);
  }

  return null;
}

function getTextBox(vertices: Array<{ x?: number | null; y?: number | null }> = []) {
  const xs = vertices.map((vertex) => Number(vertex.x || 0));
  const ys = vertices.map((vertex) => Number(vertex.y || 0));
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);

  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

function base64ImageToBuffer(base64Image: string) {
  return Buffer.from(base64Image.replace(/^data:image\/\w+;base64,/, ""), "base64");
}

export async function runOcr(base64Image: string): Promise<OcrResult> {
  const credentials = getGoogleVisionCredentials();
  if (!credentials) return { enabled: false, fullText: "", words: [] };

  const client = new vision.ImageAnnotatorClient({ credentials });
  const [result] = await client.documentTextDetection({
    image: { content: base64ImageToBuffer(base64Image) },
  });

  const annotation = result.fullTextAnnotation;
  const words: OcrWord[] = [];

  for (const page of annotation?.pages || []) {
    for (const block of page.blocks || []) {
      for (const paragraph of block.paragraphs || []) {
        for (const word of paragraph.words || []) {
          const text = (word.symbols || []).map((symbol) => symbol.text || "").join("");
          if (!text.trim()) continue;

          words.push({
            text,
            confidence: word.confidence ?? undefined,
            box: getTextBox(word.boundingBox?.vertices || []),
          });
        }
      }
    }
  }

  return {
    enabled: true,
    fullText: annotation?.text || "",
    words,
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

  const sections = Array.isArray(breakdown.sections) ? breakdown.sections : [];
  const textCorpus = getBreakdownTextCorpus(breakdown);
  const ocrLines = groupOcrWordsIntoLines(ocr);
  const missingTextAtoms = [];

  for (const [index, line] of ocrLines.entries()) {
    const normalizedLine = line.text.toLowerCase().replace(/\s+/g, " ").trim();
    if (!normalizedLine || textCorpus.includes(normalizedLine)) continue;

    missingTextAtoms.push({
      id: `ocr-text-${index + 1}`,
      name: `OCR Text ${index + 1}`,
      type: "text",
      current: {
        text: line.text,
        description: `OCR-detected text at x:${Math.round(line.x)}, y:${Math.round(line.y)}, width:${Math.round(line.width)}, height:${Math.round(line.height)}. The vision model missed this atom, so Spyda added it automatically.`,
      },
      replacementNeeded: ["Keep as-is or replace this exact text."],
    });
  }

  return {
    ...breakdown,
    sections: [...sections, ...missingTextAtoms],
    notes: [breakdown.notes, missingTextAtoms.length ? `Spyda added ${missingTextAtoms.length} OCR text atom(s) that the vision model missed.` : ""]
      .filter(Boolean)
      .join(" "),
  };
}

export function extractJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("The model response did not include JSON.");
    return JSON.parse(match[0]);
  }
}

export function normalizeAiProvider(provider: string = "") {
  return provider.toLowerCase().includes("groq") ? "groq" : "openai";
}

export function getBreakdownPrompt(ocr?: OcrResult) {
  return `You are Spyda, a visual design breakdown engine. Analyze the uploaded flyer/design.
Identify every visible component that forms the design. Capture exact visible text. Be exhaustive.
Return 16 to 35 editable atoms when the design is complex. Do not collapse multiple visible items into one vague atom.
Break down: headline, subheadline, each text block, each CTA, each logo, each icon, each badge, each product/app screenshot, each person/subject, each sticker, each background shape, each line/wave/blob/pattern, each footer/social/contact detail, and each decorative overlay.
Classify words as "text" or "action", logos as "brand", photos/products/app screens as "image", shapes/patterns/background marks as "decor", and color/font/style rules as "style".
Put global constants such as colors (hex), fonts, visual style inside the constants object.
Use the OCR data below as the source of truth for all readable text. If OCR text appears in the flyer, preserve it exactly in the matching atom and use the OCR coordinates to infer where it belongs.
${formatOcrForPrompt(ocr)}

Return ONLY valid JSON with no markdown formatting:
{
  "sections": [
    {
      "id": "hero-headline", "name": "Hero Headline", "type": "text|image|style|color|action|brand|decor",
      "current": { "text": "exact visible text", "image": "what the visible image is", "description": "visual description, approximate placement, scale, color, and relationship to other atoms" },
      "replacementNeeded": ["e.g. New headline text, replacement logo, or keep exact atom"]
    }
  ],
  "constants": {
    "headingFont": "suggested font", "bodyFont": "suggested font",
    "colors": { "primary": "dominant HEX", "secondary": "support HEX", "accent": "highlight HEX" },
    "visualStyle": "style description"
  },
  "notes": "short notes"
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

Return ONLY valid JSON in this shape:
{
  "sections": [
    {
      "id": "unique-id",
      "name": "Specific atom name",
      "type": "text|image|style|color|action|brand|decor",
      "current": { "text": "exact text if text", "image": "image/logo/subject description if visual", "description": "placement, color, size, visual relationship" },
      "replacementNeeded": ["what user can replace or keep"]
    }
  ],
  "constants": {
    "headingFont": "suggested font",
    "bodyFont": "suggested font",
    "colors": { "primary": "dominant HEX", "secondary": "support HEX", "accent": "highlight HEX" },
    "visualStyle": "style description"
  },
  "notes": "audit notes"
}`;

  return analyzeDesignWithOpenAI(base64Image, verifierPrompt);
}

export async function analyzeDesign(base64Image: string, provider = "openai") {
  let ocr: OcrResult = { enabled: false, fullText: "", words: [] };

  try {
    ocr = await runOcr(base64Image);
  } catch (error: any) {
    ocr = {
      enabled: false,
      fullText: "",
      words: [],
      error: error?.message || "OCR failed.",
    };
  }

  const prompt = getBreakdownPrompt(ocr);

  if (normalizeAiProvider(provider) === "groq") {
    const result = await analyzeDesignWithGroq(base64Image, prompt);
    const verifiedBreakdown = await verifyBreakdownWithOpenAI(base64Image, result.breakdown, ocr).catch(() => result.breakdown);
    return { ...result, mode: "groq+openai-verified", breakdown: enrichBreakdownWithOcrTextAtoms(verifiedBreakdown, ocr), ocr };
  }

  const openaiKey = process.env.OPENAI_API_KEY || "";
  if (!openaiKey) return { ok: true, mode: "mock", breakdown: buildMockBreakdown() };

  const breakdown = await analyzeDesignWithOpenAI(base64Image, prompt);
  return { ok: true, mode: "openai", breakdown: enrichBreakdownWithOcrTextAtoms(breakdown, ocr), ocr };
}

function sanitizeRecipeForPrompt(recipe: any) {
  const attachedReferenceIds = new Set(getReferenceImages(recipe).map((image: any) => image.sectionId));

  return {
    ...recipe,
    referenceImages: Array.isArray(recipe?.referenceImages)
      ? recipe.referenceImages.map((image: any, index: number) => ({
          referenceInput: index + 1,
          sectionId: image.sectionId,
          sectionName: image.sectionName,
          sectionType: image.sectionType,
          name: image.name,
          dataUrl: attachedReferenceIds.has(image.sectionId)
            ? "[attached separately as image input]"
            : "[not attached to keep the generation request fast; use this as text-only direction]",
        }))
      : [],
  };
}

export function buildGenerationPrompt(recipe: any) {
  const attachedReferenceImages = getReferenceImages(recipe);
  const referenceImageInstructions = attachedReferenceImages.length
    ? `
REFERENCE IMAGE REQUIREMENTS:
${attachedReferenceImages.map((image: any, index: number) => `- Input image ${index + 1}: "${image.name}" belongs to section "${image.sectionName}" (${image.sectionId}). It is mandatory. Preserve the uploaded asset's identity as closely as possible and place it in the generated flyer according to that section's placement/role.`).join("\n")}
`
    : "";

  return `Create a finished premium graphic design based on this Spyda recipe.
Keep text clean, legible, and professionally composed.
Use every non-deleted section in the recipe. Do not ignore required text atoms, brand atoms, image atoms, CTAs, footer details, icons, or decorative elements.
If the user customized an atom, prioritize that replacement over the original.
If constants.essentials contains instructions, treat them as hard requirements. Essentials override style preferences when they conflict.
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
  return new Blob([Buffer.from(base64, "base64")], { type: mimeType });
}

function getReferenceImages(recipe: any) {
  if (!Array.isArray(recipe?.referenceImages)) return [];
  return recipe.referenceImages
    .filter((image: any) => image?.dataUrl && image?.sectionId)
    .slice(0, 6);
}

function buildImageEditForm({
  model,
  prompt,
  size,
  quality,
  referenceImages,
  imageFieldName,
}: {
  model: string;
  prompt: string;
  size: string;
  quality: string;
  referenceImages: any[];
  imageFieldName: "image" | "image[]";
}) {
  const form = new FormData();
  form.append("model", model);
  form.append("prompt", prompt);
  form.append("size", size);
  form.append("quality", quality);
  form.append("output_format", "png");

  for (const [index, image] of referenceImages.entries()) {
    const blob = dataUrlToBlob(image.dataUrl);
    const extension = blob.type.includes("png") ? "png" : "jpg";
    form.append(imageFieldName, blob, `reference-${index + 1}-${image.sectionId}.${extension}`);
  }

  return form;
}

async function requestOpenAiImageEdit({
  openaiKey,
  model,
  prompt,
  size,
  quality,
  referenceImages,
  imageFieldName,
}: {
  openaiKey: string;
  model: string;
  prompt: string;
  size: string;
  quality: string;
  referenceImages: any[];
  imageFieldName: "image" | "image[]";
}) {
  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { "Authorization": `Bearer ${openaiKey}` },
    body: buildImageEditForm({ model, prompt, size, quality, referenceImages, imageFieldName }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || "OpenAI image edit failed.");
  }

  return response.json();
}

export async function generateDesign({ recipe }: { recipe: any }) {
  const openaiKey = process.env.OPENAI_API_KEY || "";
  if (!openaiKey) throw new Error("OPENAI_API_KEY is not configured.");

  const prompt = buildGenerationPrompt(recipe);
  const actualModel = imageModel || "gpt-image-1.5";
  const size = mapOutputSize(recipe?.format, recipe?.imageSize, actualModel);
  const quality = mapQuality(recipe?.quality, actualModel);
  const referenceImages = getReferenceImages(recipe);

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
        imageFieldName: "image",
      });
    }

    return { ok: true, mode: "openai-edit", model: actualModel, image: payload.data?.[0]?.b64_json || payload.data?.[0]?.url || null };
  }

  const requestBody: Record<string, unknown> = { model: actualModel, prompt, size, quality };

  if (isGptImageModel(actualModel)) {
    requestBody.output_format = "png";
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
  return { ok: true, mode: "openai", model: actualModel, image: payload.data?.[0]?.b64_json || payload.data?.[0]?.url || null };
}
