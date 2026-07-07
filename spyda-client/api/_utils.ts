declare const process: {
  env: Record<string, string | undefined>;
};

import { analysisModel, groqAnalysisModel, imageModel } from "./models.js";

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

export function mapOutputSize(format: string = "", imageSize: string = "", model: string = "") {
  const sizeChoice = imageSize.toLowerCase();
  const normalized = format.toLowerCase();
  const portraitSize = isGptImageModel(model) ? "1024x1536" : "1024x1792";
  const landscapeSize = isGptImageModel(model) ? "1536x1024" : "1792x1024";

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
          id: "hero",
          type: "text",
          editable: true,
          name: "Hero Section",
          content: "Main headline",
          style: "Primary headline text",
          layerIndex: 1,
          boundingBox: "top center",
          sectionId: "hero-section",
        },
        {
          id: "image",
          type: "image",
          editable: true,
          name: "Image Layer",
          content: "Primary subject",
          style: "Main subject image",
          layerIndex: 2,
          boundingBox: "center",
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

function validateDesignBreakdown(breakdown: any) {
  const normalized = normalizeBreakdownArchitecture(breakdown || {});
  const components = Array.isArray(normalized.design?.editableComponents)
    ? normalized.design.editableComponents
    : [];

  return {
    ...normalized,
    design: {
      ...normalized.design,
      styleTokens: normalized.design.styleTokens || {
        palette: { primary: "#0F172A", secondary: "#22C55E", accent: "#F8FAFC" },
        typography: { headingFont: "Space Grotesk", bodyFont: "Montserrat" },
        visualStyle: "Same as uploaded design",
      },
      sections: Array.isArray(normalized.design.sections) && normalized.design.sections.length
        ? normalized.design.sections
        : [{ id: "main-section", name: "Main Design", bounds: "full canvas" }],
      editableComponents: components.map((component: any, index: number) => ({
        id: component.id || `component-${index + 1}`,
        type: component.type || "text",
        editable: component.editable ?? true,
        name: component.name || `Component ${index + 1}`,
        content: String(component.content || ""),
        style: String(component.style || ""),
        layerIndex: Number.isFinite(Number(component.layerIndex)) ? Number(component.layerIndex) : index,
        boundingBox: component.boundingBox || "approx placement",
        sectionId: component.sectionId || "main-section",
        deleted: component.deleted,
        current: component.current,
        replacementNeeded: Array.isArray(component.replacementNeeded)
          ? component.replacementNeeded
          : ["Keep as-is or replace this component."],
      })),
    },
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
  return `You are Spyda, a visual design breakdown engine. Analyze the uploaded flyer/design following the Spyda Flyer Reconstruction Architecture.
Identify every visible component that forms the design. Capture exact visible text. Be exhaustive.
Return 16 to 35 editable atoms when the design is complex. Do not collapse multiple visible items into one vague atom.
Break down: headline, subheadline, each text block, each CTA, each logo, each icon, each badge, each product/app screenshot, each person/subject, each sticker, each background shape, each line/wave/blob/pattern, each footer/social/contact detail, and each decorative overlay.
Classify words as "text" or "action", logos as "brand", photos/products/app screens as "image", shapes/patterns/background marks as "decor", and color/font/style rules as "style".

Use the OCR data below as the source of truth for all readable text. If OCR text appears in the flyer, preserve it exactly in the matching atom and use the OCR coordinates to infer where it belongs.
${formatOcrForPrompt(ocr)}

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
        "boundingBox": "approx placement",
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
        "boundingBox": "approx placement",
        "sectionId": "hero-section"
      }
    ]
  }
}`;

  return analyzeDesignWithOpenAI(base64Image, verifierPrompt);
}

export async function analyzeDesign(base64Image: string, provider = "openai", ocr: OcrResult = { enabled: false, fullText: "", words: [] }) {
  const prompt = getBreakdownPrompt(ocr);

  if (normalizeAiProvider(provider) === "groq") {
    const result = await analyzeDesignWithGroq(base64Image, prompt);
    const verifiedBreakdown = await verifyBreakdownWithOpenAI(base64Image, result.breakdown, ocr).catch(() => result.breakdown);
    return { ...result, mode: "groq+openai-verified", breakdown: validateDesignBreakdown(enrichBreakdownWithOcrTextAtoms(verifiedBreakdown, ocr)), ocr };
  }

  const openaiKey = process.env.OPENAI_API_KEY || "";
  if (!openaiKey) return { ok: true, mode: "mock", breakdown: validateDesignBreakdown(buildMockBreakdown()) };

  const breakdown = await analyzeDesignWithOpenAI(base64Image, prompt);
  return { ok: true, mode: "openai", breakdown: validateDesignBreakdown(enrichBreakdownWithOcrTextAtoms(breakdown, ocr)), ocr };
}

function sanitizeRecipeForPrompt(recipe: any) {
  const attachedReferenceIds = new Set(getReferenceImages(recipe).map((image: any) => image.sectionId));
  const imageInputOffset = (recipe?.sourceReferenceImage?.dataUrl ? 1 : 0) + (recipe?.essentialsImage?.dataUrl ? 1 : 0);

  return {
    ...recipe,
    sourceReferenceImage: recipe?.sourceReferenceImage?.dataUrl
      ? {
          name: recipe.sourceReferenceImage.name || "Uploaded reference flyer",
          role: "source-layout-reference",
          dataUrl: "[attached separately as image input 1]",
        }
      : undefined,
    childSourceImage: recipe?.childSourceImage?.dataUrl
      ? {
          name: recipe.childSourceImage.name || "Current child source",
          role: "current-working-design",
          dataUrl: "[attached separately as child source image input]",
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
          dataUrl: attachedReferenceIds.has(image.sectionId)
            ? "[attached separately as image input]"
            : "[not attached to keep the generation request fast; use this as text-only direction]",
        }))
      : [],
  };
}

export function buildGenerationPrompt(recipe: any) {
  const attachedReferenceImages = getReferenceImages(recipe);
  const hasSourceReference = Boolean(recipe?.sourceReferenceImage?.dataUrl);
  const hasChildSource = Boolean(recipe?.childSourceImage?.dataUrl);
  const hasEssentialsImage = Boolean(recipe?.essentialsImage?.dataUrl);
  const imageInputOffset = (hasSourceReference ? 1 : 0) + (hasChildSource ? 1 : 0) + (hasEssentialsImage ? 1 : 0);
  const referenceImageInstructions = attachedReferenceImages.length
    ? `
REFERENCE IMAGE REQUIREMENTS:
${attachedReferenceImages.map((image: any, index: number) => `- Input image ${index + 1 + imageInputOffset}: "${image.name}" belongs to section "${image.sectionName}" (${image.sectionId}). It is mandatory. Preserve the uploaded asset's identity as closely as possible and place it in the generated flyer according to that section's placement/role.`).join("\n")}
`
    : "";
  const sourceReferenceInstructions = hasSourceReference
    ? `SOURCE REFERENCE LAYOUT REQUIREMENTS:
- Input image 1 is the uploaded reference flyer.
- Treat input image 1 as immutable truth. It never changes and is used only for comparison.
- Every output must stay visually close to input image 1: same layout grid, hierarchy, spacing rhythm, typography scale relationship, background structure, visual weight, and overall design direction.
`
    : "";
  const childSourceInstructions = hasChildSource
    ? `CHILD SOURCE UPDATE REQUIREMENTS:
- Input image ${hasSourceReference ? 2 : 1} is the current Child Source, the working version that should receive this round's edits.
- Update the Child Source only with the current editRound changes. Do not restart from scratch.
- Preserve all previously applied edits already visible in the Child Source.
- Do not reapply or reinterpret atoms listed in editRound.previouslyEditedAtomIds.
- Apply exactly the current round's selected atoms and Essential prompts, up to 3 focused changes, with premium realistic integration.
`
    : "";
  const essentialsImageInstruction = hasEssentialsImage
    ? `ESSENTIALS IMAGE REQUIREMENT:
- One attached image is the user's Essentials reference: "${recipe.essentialsImage.name || "Essentials reference image"}".
- Treat it as a hard visual requirement together with constants.essentials. Use it for the specific logo, product, screenshot, subject, mood, or detail the user wants included.
`
    : "";
  const outputSizeInstruction = recipe?.imageSize
    ? `OUTPUT SIZE REQUIREMENT:
- Target output: ${recipe.outputSizeLabel || recipe.imageSize} (${recipe.imageSize}).
- Preserve the chosen aspect ratio and compose the flyer for that platform. If the model canvas is an approximation, keep all important content within the intended safe area and avoid changing the uploaded reference structure unnecessarily.
- The uploaded reference's original aspect setting was: ${recipe.sourceImageSize || "not provided"}.
`
    : "";

  return `Create a finished premium graphic design based on this Spyda recipe.
This is Phase 12 (AI Reconstruction) of the Spyda Flyer Reconstruction Architecture.
Apply Content Normalization to user inputs, preserve original layer hierarchy, bounds, and layout, and apply the extracted styleTokens (gradients, shadows, effects) to produce a highly accurate, aesthetic replica.
Keep text clean, legible, and professionally composed.
${sourceReferenceInstructions}
${childSourceInstructions}
${essentialsImageInstruction}
${outputSizeInstruction}
Use only the selected editableComponents for this round. Do not modify unrelated atoms.
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

  if (recipe?.sourceReferenceImage?.dataUrl) {
    inputs.push({
      sectionId: "source-reference",
      sectionName: "Uploaded Reference Flyer",
      sectionType: "source",
      name: recipe.sourceReferenceImage.name || "Uploaded reference flyer",
      dataUrl: recipe.sourceReferenceImage.dataUrl,
    });
  }

  if (recipe?.childSourceImage?.dataUrl) {
    inputs.push({
      sectionId: "child-source",
      sectionName: "Current Child Source",
      sectionType: "child-source",
      name: recipe.childSourceImage.name || "Current child source",
      dataUrl: recipe.childSourceImage.dataUrl,
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
  const referenceImages = getImageEditInputs(recipe);

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
