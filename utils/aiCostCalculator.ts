/**
 * aiCostCalculator.ts
 * Motor de cálculo de costos en USD para modelos IA.
 * Precios actualizados: Junio 2026.
 */

export const AI_PRICING: Record<string, { input: number; output: number; label: string }> = {
  // OpenAI — Familia GPT-4
  "gpt-4o-mini":  { input: 0.15, output: 0.60,  label: "GPT-4o mini" },
  "gpt-4.1-nano": { input: 0.10, output: 0.40,  label: "GPT-4.1 Nano" },
  "gpt-4.1-mini": { input: 0.40, output: 1.60,  label: "GPT-4.1 Mini" },
  "gpt-4.1":      { input: 2.00, output: 8.00,  label: "GPT-4.1 (Estándar)" },
  "gpt-4o":       { input: 2.50, output: 10.00, label: "GPT-4o (Legacy)" },

  // OpenAI — Familia GPT-5
  "gpt-5.4-nano": { input: 0.20,  output: 0.80,   label: "GPT-5.4 Nano" },
  "gpt-5.4-mini": { input: 0.75,  output: 3.00,   label: "GPT-5.4 Mini" },
  "gpt-5.4":      { input: 5.00,  output: 30.00,  label: "GPT-5.4" },
  "gpt-5.5":      { input: 12.50, output: 75.00,  label: "GPT-5.5" },
  "gpt-5.5-pro":  { input: 30.00, output: 180.00, label: "GPT-5.5 Pro" },

  // Google Gemini (Texto)
  "gemini-2.5-flash":      { input: 0.30, output: 2.50,  label: "Gemini 2.5 Flash" },
  "gemini-2.5-pro":        { input: 1.25, output: 10.00, label: "Gemini 2.5 Pro" },
  "gemini-3-pro":          { input: 4.00, output: 16.00, label: "Gemini 3 Pro" },
  "gemini-3.1-flash":      { input: 0.15, output: 0.60,  label: "Gemini 3.1 Flash" },
  "gemini-3.1-flash-lite": { input: 0.25, output: 1.50,  label: "Gemini 3.1 Flash-Lite" },
  "gemini-3.5-flash":      { input: 0.75, output: 4.50,  label: "Gemini 3.5 Flash" },
  "gemini-3.1-pro":        { input: 2.00, output: 12.00, label: "Gemini 3.1 Pro (contexto ≤ 200k)" },
  "gemini-3.1-pro-long":   { input: 4.00, output: 18.00, label: "Gemini 3.1 Pro (contexto > 200k)" },

  // Google Gemini (Vectorización / Embeddings)
  "text-embedding-004": { input: 0.02, output: 0.00, label: "Gemini Text Embedding 004" },
};

export type ImageResolution = "512" | "1k" | "2k" | "4k";

export const IMAGE_PRICING: Record<string, { perImage: Partial<Record<ImageResolution, number>>; label: string }> = {
  "gemini-3.1-flash-image": {
    label: "Gemini 3.1 Flash Image (Nano Banana 2)",
    perImage: { "1k": 0.034, "2k": 0.050, "4k": 0.076 },
  },
  "gemini-3.1-pro-image": {
    label: "Gemini 3.1 Pro Image (Nano Banana 2 Pro)",
    perImage: { "512": 0.060, "1k": 0.095, "2k": 0.145, "4k": 0.21 },
  },
  "gemini-3-pro-image": {
    label: "Gemini 3 Pro Image Preview (Nano Banana Pro)",
    // 1K/1MP y 2K/4MP comparten precio; 4K/16MP es más caro.
    perImage: { "1k": 0.134, "2k": 0.134, "4k": 0.24 },
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
  const outTokens = usage.outputTokens ?? 0;
  const pricing = AI_PRICING[usage.model];

  // El cálculo de costo es secundario: nunca debe tumbar la respuesta de IA.
  // Si el modelo no está en la tabla, registramos costo 0 y avisamos por consola.
  if (!pricing) {
    console.error(`[aiCostCalculator] Modelo de texto desconocido: ${String(usage.model)}. Se registra costo 0.`);
    return {
      model: String(usage.model),
      inputTokens: usage.inputTokens,
      outputTokens: outTokens,
      totalCostUSD: 0,
    };
  }

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
  const resolution = usage.resolution ?? "1k";
  const pricing = IMAGE_PRICING[usage.model];

  // Igual que en texto: ante un modelo/resolución desconocidos, costo 0 y log (sin romper).
  if (!pricing) {
    console.error(`[aiCostCalculator] Modelo de imagen desconocido: ${String(usage.model)}. Se registra costo 0.`);
    return { model: String(usage.model), imageCount: usage.imageCount, resolution, totalCostUSD: 0 };
  }

  const costPerImage = pricing.perImage[resolution] ?? pricing.perImage["1k"] ?? 0;

  return {
    model: pricing.label,
    imageCount: usage.imageCount,
    resolution,
    totalCostUSD: (costPerImage * usage.imageCount),
  };
}
