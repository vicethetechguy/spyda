import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import Groq from "groq-sdk";

const rootDir = resolve(".");
const envPath = join(rootDir, ".env");

function loadLocalEnvFile() {
  if (!existsSync(envPath)) return;

  const envText = readFileSync(envPath, "utf8");

  for (const line of envText.split(/\r?\n/)) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) continue;

    const separatorIndex = trimmedLine.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmedLine.slice(0, separatorIndex).trim();
    let value = trimmedLine.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadLocalEnvFile();

const port = Number(process.env.PORT || 4173);
const openaiApiKey = process.env.OPENAI_API_KEY || "";
const groqApiKey = process.env.GROQ_API_KEY || "";
const imageModel = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
const analysisModel = process.env.OPENAI_ANALYSIS_MODEL || "gpt-4o";
const groqAnalysisModel = process.env.GROQ_ANALYSIS_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct";
const maxUploadBytes = 28 * 1024 * 1024;
const groq = groqApiKey ? new Groq({ apiKey: groqApiKey }) : null;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".jfif": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webm": "video/webm",
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function sendError(response, statusCode, message, details = undefined) {
  sendJson(response, statusCode, { ok: false, error: message, details });
}

function getHttpErrorStatus(error) {
  const message = error?.message?.toLowerCase() || "";

  if (message.includes("api_key") || message.includes("api key") || message.includes("unauthorized")) return 401;
  if (message.includes("quota") || message.includes("billing") || message.includes("insufficient_quota")) return 402;
  if (message.includes("model") || message.includes("unsupported") || message.includes("invalid")) return 400;
  if (message.includes("too large")) return 413;
  return 500;
}

async function readRequestBody(request) {
  const chunks = [];
  let totalLength = 0;

  for await (const chunk of request) {
    totalLength += chunk.length;

    if (totalLength > maxUploadBytes) {
      throw new Error("Upload is too large.");
    }

    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

function parseHeaderValue(headerText, key) {
  const match = headerText.match(new RegExp(`${key}="([^"]+)"`));
  return match?.[1] || "";
}

function parseMultipartBody(bodyBuffer, contentType) {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);

  if (!boundaryMatch) {
    throw new Error("Missing multipart boundary.");
  }

  const boundary = Buffer.from(`--${boundaryMatch[1] || boundaryMatch[2]}`);
  const fields = {};
  const files = {};
  let cursor = 0;

  while (cursor < bodyBuffer.length) {
    const boundaryIndex = bodyBuffer.indexOf(boundary, cursor);
    if (boundaryIndex === -1) break;

    const nextIndex = bodyBuffer.indexOf(boundary, boundaryIndex + boundary.length);
    if (nextIndex === -1) break;

    let part = bodyBuffer.subarray(boundaryIndex + boundary.length, nextIndex);
    cursor = nextIndex;

    if (part.subarray(0, 2).equals(Buffer.from("--"))) break;
    if (part.subarray(0, 2).equals(Buffer.from("\r\n"))) part = part.subarray(2);
    if (part.subarray(-2).equals(Buffer.from("\r\n"))) part = part.subarray(0, -2);

    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd === -1) continue;

    const headerText = part.subarray(0, headerEnd).toString("utf8");
    const content = part.subarray(headerEnd + 4);
    const name = parseHeaderValue(headerText, "name");
    const filename = parseHeaderValue(headerText, "filename");
    const type = headerText.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() || "application/octet-stream";

    if (!name) continue;

    if (filename) {
      files[name] = { buffer: content, filename, type };
    } else {
      fields[name] = content.toString("utf8");
    }
  }

  return { fields, files };
}

function fileToDataUrl(file) {
  return `data:${file.type};base64,${file.buffer.toString("base64")}`;
}

function mapOutputSize(format = "", imageSize = "") {
  const sizeChoice = imageSize.toLowerCase();
  const normalized = format.toLowerCase();

  if (sizeChoice.includes("1024 x 1024") || sizeChoice.includes("1024x1024") || sizeChoice.includes("square")) {
    return "1024x1024";
  }

  if (sizeChoice.includes("1024 x 1536") || sizeChoice.includes("1024x1536") || sizeChoice.includes("portrait")) {
    return "1024x1536";
  }

  if (sizeChoice.includes("1536 x 1024") || sizeChoice.includes("1536x1024") || sizeChoice.includes("landscape")) {
    return "1536x1024";
  }

  if (normalized.includes("story") || normalized.includes("9:16")) return "1024x1536";
  if (normalized.includes("a4") || normalized.includes("flyer")) return "1024x1536";
  if (normalized.includes("landscape")) return "1536x1024";
  return "1024x1024";
}

function mapQuality(quality = "") {
  const normalized = quality.toLowerCase();

  if (normalized.includes("premium") || normalized.includes("high")) return "high";
  if (normalized.includes("draft") || normalized.includes("low") || normalized.includes("fast")) return "low";
  return "medium";
}

function buildMockBreakdown() {
  return {
    sections: [
      {
        id: "hero",
        name: "Hero Section",
        type: "text",
        current: { text: "Main headline and supporting line" },
        replacementNeeded: ["New headline", "Optional subheadline"],
      },
      {
        id: "image",
        name: "Image Layer",
        type: "image",
        current: { image: "Primary subject or product image" },
        replacementNeeded: ["Replacement subject image"],
      },
      {
        id: "offer",
        name: "Offer Block",
        type: "text",
        current: { text: "Promo, discount, or price treatment" },
        replacementNeeded: ["New offer text"],
      },
      {
        id: "cta",
        name: "CTA Section",
        type: "action",
        current: { text: "Order or booking action" },
        replacementNeeded: ["CTA copy", "Contact detail"],
      },
      {
        id: "style",
        name: "Visual Style",
        type: "style",
        current: { description: "Premium Photoshop-style composition" },
        replacementNeeded: ["Same style or adjusted mood"],
      },
    ],
    constants: {
      headingFont: "Space Grotesk",
      bodyFont: "Montserrat",
      colors: { primary: "#0F172A", secondary: "#22C55E", accent: "#F8FAFC" },
      visualStyle: "Same as uploaded design unless changed by the user.",
    },
    notes: "Mock analysis returned because OPENAI_API_KEY is not configured yet.",
  };
}

function extractResponseText(responsePayload) {
  if (typeof responsePayload.output_text === "string") return responsePayload.output_text;

  const chunks = [];

  for (const item of responsePayload.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) chunks.push(content.text);
      if (content.type === "text" && content.text) chunks.push(content.text);
    }
  }

  return chunks.join("\n");
}

function extractJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("The model response did not include JSON.");
    return JSON.parse(match[0]);
  }
}

async function callOpenAI(path, options) {
  if (!openaiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const response = await fetch(`https://api.openai.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let payload = {};

  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    const message = payload.error?.message || `OpenAI request failed with ${response.status}.`;
    throw new Error(message);
  }

  return payload;
}

function normalizeAiProvider(provider = "") {
  return provider.toLowerCase().includes("groq") ? "groq" : "openai";
}

function isOpenAIQuotaError(error) {
  const message = error?.message?.toLowerCase() || "";
  return message.includes("quota") || message.includes("billing") || message.includes("insufficient_quota");
}

function getBreakdownPrompt() {
  return `You are Spyda, a visual design breakdown engine. Analyze the uploaded flyer/design.
You must dissect the actual uploaded image, not provide a generic template.
Identify every visible atom/component that forms the design. Capture exact visible text when readable.
Return 8 to 14 specific editable atoms when present, prioritizing headline, subheadline/body copy, subject/product image, logo/brand mark, offer/price, CTA, contact/footer, background panels, decorative effects, badges, shadows, gradients, and layout groups.
Do not return color-system or typography as standalone sections. Classify editable words as type "text" or "action" with exact current.text. Classify replaceable photos/products/logos as type "image" or "brand" with current.image. Put global constants such as colors, fonts, visual style, and brand feel inside the constants object so Spyda can render one Brand Card.
Return only valid JSON with:
{
  "sections": [
    {
      "id": "short lowercase id such as hero, image, offer, cta, logo, footer, background, decor, color, style",
      "name": "Human section name specific to this uploaded design",
      "type": "text|image|style|color|action|brand|decor",
      "current": {
        "text": "exact visible text if readable, otherwise empty",
        "image": "what the visible image/subject/logo is, otherwise empty",
        "description": "specific placement, size, hierarchy, effect, or role in this design"
      },
      "replacementNeeded": ["specific thing the user must replace, e.g. New headline text, New product image, New phone number"]
    }
  ],
  "constants": {
    "headingFont": "inferred or suggested",
    "bodyFont": "inferred or suggested",
    "colors": {
      "primary": "observed or estimated 60% dominant brand/background HEX color",
      "secondary": "observed or estimated 30% support HEX color",
      "accent": "observed or estimated 10% highlight/CTA HEX color"
    },
    "visualStyle": "concise style description"
  },
  "notes": "short implementation notes"
}
Keep descriptions short. Focus on replaceable ingredients, actual visual hierarchy, and what must be supplied to imitate the uploaded design.`;
}

async function analyzeDesignWithGroq(file, prompt) {
  if (!groq) {
    throw new Error("GROQ_API_KEY is not configured.");
  }

  const request = {
    model: groqAnalysisModel,
    temperature: 0.2,
    max_completion_tokens: 1800,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: fileToDataUrl(file) } },
        ],
      },
    ],
  };

  let completion;

  try {
    completion = await groq.chat.completions.create(request);
  } catch (error) {
    const message = error?.message?.toLowerCase() || "";

    if (!message.includes("response_format") && !message.includes("json")) {
      throw error;
    }

    const { response_format, ...fallbackRequest } = request;
    completion = await groq.chat.completions.create(fallbackRequest);
  }

  const text = completion.choices?.[0]?.message?.content || "";
  const breakdown = extractJson(text);

  return {
    ok: true,
    mode: "groq",
    model: groqAnalysisModel,
    requestedImageModel: imageModel,
    breakdown,
  };
}

async function analyzeDesign(file, provider = "openai") {
  const selectedProvider = normalizeAiProvider(provider);
  const prompt = getBreakdownPrompt();

  if (selectedProvider === "groq") {
    return analyzeDesignWithGroq(file, prompt);
  }

  if (!openaiApiKey) {
    return { ok: true, mode: "mock", model: imageModel, breakdown: buildMockBreakdown() };
  }

  try {
    const payload = await callOpenAI("/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: analysisModel,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              { type: "input_image", image_url: fileToDataUrl(file) },
            ],
          },
        ],
      }),
    });

    const text = extractResponseText(payload);
    const breakdown = extractJson(text);

    return {
      ok: true,
      mode: "openai",
      model: analysisModel,
      requestedImageModel: imageModel,
      breakdown,
    };
  } catch (error) {
    if (groq && isOpenAIQuotaError(error)) {
      const groqResult = await analyzeDesignWithGroq(file, prompt);
      return {
        ...groqResult,
        fallbackFrom: "openai",
        fallbackReason: "OpenAI quota or billing limit reached.",
      };
    }

    throw error;
  }
}

async function refineGenerationPromptWithGroq(prompt, recipe = {}) {
  if (!groq || normalizeAiProvider(recipe?.aiProvider) !== "groq") {
    return prompt;
  }

  const completion = await groq.chat.completions.create({
    model: groqAnalysisModel,
    temperature: 0.25,
    messages: [
      {
        role: "system",
        content:
          "You are Spyda's prompt director. Rewrite the user's image prompt into a concise, high-control prompt for a premium flyer generation model. Keep all exact text, colors, fonts, and constraints intact. Return only the improved prompt.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  return completion.choices?.[0]?.message?.content?.trim() || prompt;
}

function buildGenerationPrompt(recipe = {}) {
  return `Create a finished premium graphic design based on this Spyda recipe.
Use GPT-Image 2 to preserve the uploaded reference's layout logic while replacing ingredients.

Design recipe:
${JSON.stringify(recipe, null, 2)}

Requirements:
- Use the reference design structure as inspiration.
- Replace text, subject/image, offer, CTA, colors, and visual style from the recipe.
- Use a premium Photoshop-style finish with strong hierarchy.
- Keep text clean, legible, and professionally composed.
- Do not include watermarks or UI elements.`;
}

async function generateDesign({ referenceFile, subjectFile, recipe }) {
  if (!openaiApiKey) {
    return {
      ok: true,
      mode: "mock",
      model: imageModel,
      image: null,
      message: "Mock generation returned because OPENAI_API_KEY is not configured yet.",
    };
  }

  const basePrompt = buildGenerationPrompt(recipe);
  const prompt = await refineGenerationPromptWithGroq(basePrompt, recipe);
  const size = mapOutputSize(recipe?.format, recipe?.imageSize);
  const quality = mapQuality(recipe?.quality);

  if (referenceFile || subjectFile) {
    const form = new FormData();
    form.append("model", imageModel);
    form.append("prompt", prompt);
    form.append("size", size);
    form.append("quality", quality);

    if (referenceFile) {
      form.append("image[]", new Blob([referenceFile.buffer], { type: referenceFile.type }), referenceFile.filename);
    }

    if (subjectFile) {
      form.append("image[]", new Blob([subjectFile.buffer], { type: subjectFile.type }), subjectFile.filename);
    }

    const payload = await callOpenAI("/images/edits", { method: "POST", body: form });

    return {
      ok: true,
      mode: "openai",
      model: imageModel,
      image: payload.data?.[0]?.b64_json || null,
      usage: payload.usage,
    };
  }

  const payload = await callOpenAI("/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: imageModel, prompt, size, quality }),
  });

  return {
    ok: true,
    mode: "openai",
    model: imageModel,
    image: payload.data?.[0]?.b64_json || null,
    usage: payload.usage,
  };
}

async function handleAnalyze(request, response) {
  const { fields, files } = parseMultipartBody(await readRequestBody(request), request.headers["content-type"] || "");
  const designFile = files.design || files.file;
  const provider = normalizeAiProvider(fields.aiProvider);

  if (!designFile) {
    sendError(response, 400, "Upload a design image first.");
    return;
  }

  sendJson(response, 200, await analyzeDesign(designFile, provider));
}

async function handleGenerate(request, response) {
  const { fields, files } = parseMultipartBody(await readRequestBody(request), request.headers["content-type"] || "");
  const recipe = fields.recipe ? JSON.parse(fields.recipe) : {};
  const result = await generateDesign({
    recipe,
    referenceFile: files.reference || files.design,
    subjectFile: files.subject,
  });

  sendJson(response, 200, result);
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const requestedPath = resolve(join(rootDir, pathname));

  if (!requestedPath.toLowerCase().startsWith(rootDir.toLowerCase())) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const content = await readFile(requestedPath);
    response.writeHead(200, { "Content-Type": mimeTypes[extname(requestedPath)] || "application/octet-stream" });
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

async function handleSaveDemoVideo(request, response) {
  const body = await readRequestBody(request);
  const payload = JSON.parse(body.toString("utf8") || "{}");
  const dataUrl = payload.dataUrl || "";
  const match = dataUrl.match(/^data:video\/webm;base64,([\s\S]+)$/);

  if (!match) {
    sendError(response, 400, "Demo video payload was not a WebM data URL.");
    return;
  }

  const outputPath = resolve(join(rootDir, "assets", "spyda-workflow-demo.webm"));

  await writeFile(outputPath, Buffer.from(match[1], "base64"));
  sendJson(response, 200, { ok: true, path: "assets/spyda-workflow-demo.webm" });
}

export async function handleRequest(request, response) {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, {
        ok: true,
        hasApiKey: Boolean(openaiApiKey),
        hasOpenAiApiKey: Boolean(openaiApiKey),
        hasGroqApiKey: Boolean(groqApiKey),
        imageModel,
        analysisModel,
        groqAnalysisModel,
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/analyze") {
      await handleAnalyze(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/generate") {
      await handleGenerate(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/save-demo-video") {
      await handleSaveDemoVideo(request, response);
      return;
    }

    await serveStatic(request, response);
  } catch (error) {
    console.error("[Spyda API error]", {
      message: error?.message,
      stack: error?.stack,
    });
    sendError(response, getHttpErrorStatus(error), error.message || "Unexpected server error.");
  }
}

if (!process.env.VERCEL) {
  const server = createServer(handleRequest);

  server.listen(port, "127.0.0.1", () => {
    console.log(`Spyda server running at http://127.0.0.1:${port}/`);
    console.log(openaiApiKey ? `OpenAI enabled with ${imageModel}` : "OpenAI disabled until OPENAI_API_KEY is set.");
    console.log(groqApiKey ? `Groq enabled with ${groqAnalysisModel}` : "Groq disabled until GROQ_API_KEY is set.");
  });
}
