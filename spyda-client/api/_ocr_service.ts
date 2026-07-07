import vision from "@google-cloud/vision";

export type OcrWord = {
  text: string;
  confidence?: number;
  box: { x: number; y: number; width: number; height: number };
};

export type OcrResult = {
  enabled: boolean;
  fullText: string;
  words: OcrWord[];
  error?: string;
};

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
