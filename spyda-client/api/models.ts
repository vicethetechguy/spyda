declare const process: {
  env: Record<string, string | undefined>;
};

export const imageModel = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
export const analysisModel = process.env.OPENAI_ANALYSIS_MODEL || "gpt-4o";
export const groqAnalysisModel = process.env.GROQ_ANALYSIS_MODEL || "llama-3.2-90b-vision-preview";
