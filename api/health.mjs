export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  response.status(200).json({
    ok: true,
    hasApiKey: Boolean(process.env.OPENAI_API_KEY),
    hasOpenAiApiKey: Boolean(process.env.OPENAI_API_KEY),
    hasGroqApiKey: Boolean(process.env.GROQ_API_KEY),
    imageModel: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
    analysisModel: process.env.OPENAI_ANALYSIS_MODEL || "gpt-4o",
    groqAnalysisModel: process.env.GROQ_ANALYSIS_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct",
  });
}
