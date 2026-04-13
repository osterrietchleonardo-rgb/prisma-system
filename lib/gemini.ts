import { GoogleGenerativeAI, TaskType } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export const prismaIA = genAI.getGenerativeModel({ 
  model: "gemini-2.0-flash",
  generationConfig: {
    temperature: 0.7,
    topK: 1,
    topP: 1,
    maxOutputTokens: 2048,
  },
});

export const generateEmbedding = async (text: string) => {
  const apiKey = process.env.GEMINI_API_KEY;
  // Switching back to v1beta as embeddings are only available there for this key
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content: {
        parts: [{ text: text.substring(0, 10000) }]
      },
      taskType: "RETRIEVAL_DOCUMENT",
      outputDimensionality: 768
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error("Embedding API Error Detail:", errorData);
    throw new Error(`Embedding failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.embedding.values;
};

export const extractTextFromDocument = async (fileBuffer: Buffer, mimeType: string) => {
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  
  const result = await model.generateContent([
    {
      inlineData: {
        data: fileBuffer.toString("base64"),
        mimeType
      }
    },
    "Extrae todo el texto de este documento. Devuelve un resumen estructurado si es muy largo, pero prioriza el contenido completo para búsqueda semántica. Solo devuelve el texto puro."
  ]);
  
  return result.response.text();
};

export const analyzeChat = async (history: string) => {
  const prompt = `Analiza la siguiente conversación de un lead inmobiliario en Argentina. 
  Extrae: interés (compra/alquiler), zona, presupuesto, urgencia, y sentimiento. 
  Responde UNICAMENTE en JSON.
  
  Conversación:
  ${history}`;

  const result = await prismaIA.generateContent(prompt);
  const response = await result.response;
  return response.text();
};

export const generateImage = async (prompt: string, quality: 'standard' | 'pro' = 'standard') => {
  const modelId = quality === 'pro' ? "gemini-3-pro-image-preview" : "gemini-3.1-flash-image-preview";
  const model = genAI.getGenerativeModel({ 
    model: modelId,
  });

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      // @ts-ignore - Image generation modalities for 2026 models
      responseModalities: ["IMAGE"],
    }
  });

  const response = await result.response;
  // The response for image modality contains the image data in the parts
  const candidate = response.candidates?.[0];
  const imagePart = candidate?.content.parts.find(p => p.inlineData?.mimeType.startsWith("image/"));
  
  if (!imagePart || !imagePart.inlineData) {
    throw new Error("No image was generated in the response");
  }

  return Buffer.from(imagePart.inlineData.data, "base64");
};
