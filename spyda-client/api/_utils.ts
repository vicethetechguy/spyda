export const imageModel = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2"; 
export const analysisModel = process.env.OPENAI_ANALYSIS_MODEL || "gpt-4o";
export const groqAnalysisModel = process.env.GROQ_ANALYSIS_MODEL || "llama-3.2-90b-vision-preview";

export async function fileToDataUrl(file: File) {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:${file.type};base64,${btoa(binary)}`;
}

export function mapOutputSize(format = "", imageSize = "") {
  const sizeChoice = imageSize.toLowerCase();
  const normalized = format.toLowerCase();
  if (sizeChoice.includes("1024 x 1024") || sizeChoice.includes("square")) return "1024x1024";
  if (sizeChoice.includes("portrait")) return "1024x1792";
  if (sizeChoice.includes("landscape")) return "1792x1024";
  if (normalized.includes("story") || normalized.includes("9:16")) return "1024x1792";
  if (normalized.includes("a4") || normalized.includes("flyer")) return "1024x1792";
  if (normalized.includes("landscape")) return "1792x1024";
  return "1024x1024";
}

export function mapQuality(quality = "") {
  return quality.toLowerCase().includes("premium") ? "hd" : "standard";
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

export function extractJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("The model response did not include JSON.");
    return JSON.parse(match[0]);
  }
}

export function normalizeAiProvider(provider = "") {
  return provider.toLowerCase().includes("groq") ? "groq" : "openai";
}

export function getBreakdownPrompt() {
  return `You are Spyda, a visual design breakdown engine. Analyze the uploaded flyer/design.
Identify every visible component that forms the design. Capture exact visible text.
Return 8 to 14 editable atoms (headline, subheadline, image, logo, CTA, etc).
Classify words as "text" or "action", and photos/logos as "image" or "brand".
Put global constants such as colors (hex), fonts, visual style inside the constants object.
Return ONLY valid JSON with no markdown formatting:
{
  "sections": [
    {
      "id": "hero", "name": "Hero Section", "type": "text|image|style|color|action|brand|decor",
      "current": { "text": "exact visible text", "image": "what the visible image is" },
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

export async function analyzeDesignWithGroq(file: File, prompt: string) {
  const groqKey = process.env.GROQ_API_KEY || "";
  if (!groqKey) throw new Error("GROQ_API_KEY is not configured.");

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${groqKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: groqAnalysisModel, temperature: 0.2, max_completion_tokens: 1800,
      messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: await fileToDataUrl(file) } }] }]
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq API Error: ${err}`);
  }

  const payload = await response.json();
  return { ok: true, mode: "groq", breakdown: extractJson(payload.choices?.[0]?.message?.content || "") };
}

export async function analyzeDesign(file: File, provider = "openai") {
  if (normalizeAiProvider(provider) === "groq") {
    return analyzeDesignWithGroq(file, getBreakdownPrompt());
  }

  const openaiKey = process.env.OPENAI_API_KEY || "";
  if (!openaiKey) return { ok: true, mode: "mock", breakdown: buildMockBreakdown() };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: analysisModel, response_format: { type: "json_object" },
      messages: [{ role: "user", content: [{ type: "text", text: getBreakdownPrompt() }, { type: "image_url", image_url: { url: await fileToDataUrl(file) } }] }]
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || "OpenAI request failed.");
  }

  const payload = await response.json();
  return { ok: true, mode: "openai", breakdown: extractJson(payload.choices?.[0]?.message?.content || "") };
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
  const size = mapOutputSize(recipe?.format, recipe?.imageSize);
  const quality = mapQuality(recipe?.quality);
  const actualModel = imageModel.includes("dall-e") || imageModel.includes("gpt") ? "dall-e-3" : imageModel;

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: actualModel, prompt, size, quality, response_format: "b64_json" }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || "OpenAI generation failed.");
  }

  const payload = await response.json();
  return { ok: true, mode: "openai", model: actualModel, image: payload.data?.[0]?.b64_json || null };
}
