/**
 * aiCostCalculator.ts
 * Motor de cálculo de costos en USD para modelos IA.
 * Precios actualizados: Mayo 2026.
 */

export const AI_PRICING: Record<string, { input: number; output: number; label: string }> = {
  // OpenAI
  "gpt-4.1-mini": { input: 0.40, output: 1.60, label: "GPT-4.1 Mini" },
  "gpt-5.1-mini": { input: 0.20, output: 0.80, label: "GPT-5.1 Mini" },

  // Google Gemini (Texto)
  "gemini-2.5-flash": { input: 0.30, output: 2.50,  label: "Gemini 2.5 Flash" },
  "gemini-2.5-pro":   { input: 1.25, output: 10.00, label: "Gemini 2.5 Pro" },
  "gemini-3-pro":     { input: 4.00, output: 16.00, label: "Gemini 3 Pro" },
  "gemini-3.1-flash": { input: 0.15, output: 0.60,  label: "Gemini 3.1 Flash" },

  // Google Gemini (Vectorización / Embeddings)
  "text-embedding-004": { input: 0.02, output: 0.00, label: "Gemini Text Embedding 004" },
};

export type ImageResolution = "512" | "1k" | "2k" | "4k";

export const IMAGE_PRICING: Record<string, { perImage: Partial<Record<ImageResolution, number>>; label: string }> = {
  "gemini-3.1-flash-image": {
    label: "Gemini 3.1 Flash Image (Nano Banana 2)",
    perImage: { "512": 0.045, "1k": 0.067, "2k": 0.101, "4k": 0.15 },
  },
  "gemini-3.1-pro-image": {
    label: "Gemini 3.1 Pro Image (Nano Banana 2 Pro)",
    perImage: { "512": 0.060, "1k": 0.095, "2k": 0.145, "4k": 0.21 },
  },
};

export interface TokenUsage {
  model: keyof typeof AI_PRICING;
  inputTokens: number;
  outputTokens?: number;
}

export interface ImageUsage {
  model: keyof typeof IMAGE_PRICING;
  imageCount: number;
  resolution?: ImageResolution;
}

export function calculateCost(usage: TokenUsage) {
  const pricing = AI_PRICING[usage.model];
  if (!pricing) throw new Error(`Modelo desconocido: ${usage.model}`);

  const outTokens = usage.outputTokens ?? 0;
  const MILLION = 1_000_000;
  
  const inputCostUSD  = (usage.inputTokens  / MILLION) * pricing.input;
  const outputCostUSD = (outTokens / MILLION) * pricing.output;

  return {
    model: pricing.label,
    inputTokens: usage.inputTokens,
    outputTokens: outTokens,
    totalCostUSD: (inputCostUSD + outputCostUSD),
  };
}

export function calculateImageCost(usage: ImageUsage) {
  const pricing = IMAGE_PRICING[usage.model];
  if (!pricing) throw new Error(`Modelo de imagen desconocido: ${usage.model}`);

  const resolution = usage.resolution ?? "1k";
  const costPerImage = pricing.perImage[resolution] ?? pricing.perImage["1k"];

  if (!costPerImage) throw new Error(`Resolución ${resolution} no válida.`);

  return {
    model: pricing.label,
    imageCount: usage.imageCount,
    resolution,
    totalCostUSD: (costPerImage * usage.imageCount),
  };
}
