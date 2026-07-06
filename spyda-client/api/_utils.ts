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
Identify every visible component that forms the design. Capture exact visible text.
Return 8 to 14 editable atoms (headline, subheadline, image, logo, CTA, etc).
Classify words as "text" or "action", and photos/logos as "image" or "brand".
Put global constants such as colors (hex), fonts, visual style inside the constants object.
Use the OCR data below as the source of truth for all readable text. If OCR text appears in the flyer, preserve it exactly in the matching atom and use the OCR coordinates to infer where it belongs.
${formatOcrForPrompt(ocr)}

Return ONLY valid JSON with no markdown formatting:
{
  "sections": [
    {
      "id": "hero", "name": "Hero Section", "type": "text|image|style|color|action|brand|decor",
      "current": { "text": "exact visible text", "image": "what the visible image is", "description": "visual description and approximate placement" },
      "replacementNeeded": ["e.g. New headline text"]
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
    return { ...result, ocr };
  }

  const openaiKey = process.env.OPENAI_API_KEY || "";
  if (!openaiKey) return { ok: true, mode: "mock", breakdown: buildMockBreakdown() };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: analysisModel, response_format: { type: "json_object" },
      messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: base64Image } }] }]
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || "OpenAI request failed.");
  }

  const payload = await response.json();
  return { ok: true, mode: "openai", breakdown: extractJson(payload.choices?.[0]?.message?.content || ""), ocr };
}

export function buildGenerationPrompt(recipe: any) {
  return `Create a finished premium graphic design based on this Spyda recipe.
Keep text clean, legible, and professionally composed.
Recipe:
${JSON.stringify(recipe, null, 2)}`;
}

export async function generateDesign({ recipe }: { recipe: any }) {
  const openaiKey = process.env.OPENAI_API_KEY || "";
  if (!openaiKey) throw new Error("OPENAI_API_KEY is not configured.");

  const prompt = buildGenerationPrompt(recipe);
  const actualModel = imageModel || "gpt-image-1.5";
  const size = mapOutputSize(recipe?.format, recipe?.imageSize, actualModel);
  const quality = mapQuality(recipe?.quality, actualModel);
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
