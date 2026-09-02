import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const openaiIA = {
  generateContent: async (promptOrConfig: string | any) => {
    try {
      let messages = [];

      if (typeof promptOrConfig === "string") {
        messages = [{ role: "user", content: promptOrConfig }];
      } else if (promptOrConfig.contents) {
        messages = promptOrConfig.contents.map((c: any) => ({
          role: c.role === "model" ? "assistant" : c.role,
          content: c.parts.map((p: any) => p.text).join("\n"),
        }));
      }

      const response = await openai.chat.completions.create({
        model: "gpt-5.4-mini",
        messages: messages,
        temperature: 0.5,
        // La familia GPT-5 usa max_completion_tokens (max_tokens quedó deprecado y da 400 en estos modelos).
        max_completion_tokens: 2048,
      });

      const textOutput = response.choices[0].message.content || "";
      const usageData = response.usage;

      return {
        response: {
          text: () => textOutput,
          // Expose usage for cost tracking (maps to Gemini-style usageMetadata)
          usageMetadata: usageData
            ? {
                promptTokenCount: usageData.prompt_tokens ?? 0,
                candidatesTokenCount: usageData.completion_tokens ?? 0,
              }
            : null,
        },
      };
    } catch (error) {
      console.error("OpenAI API Error:", error);
      throw error;
    }
  },

  /**
   * Igual que generateContent, pero va entregando el texto a medida que el modelo lo escribe
   * (para que el chat "tipee" en vivo). Devuelve el texto completo y el usage al final —
   * el usage llega en el último chunk gracias a stream_options.include_usage.
   */
  generateContentStream: async (
    promptOrConfig: string | any,
    onDelta: (texto: string) => void,
  ) => {
    let messages = [];
    if (typeof promptOrConfig === "string") {
      messages = [{ role: "user", content: promptOrConfig }];
    } else if (promptOrConfig.contents) {
      messages = promptOrConfig.contents.map((c: any) => ({
        role: c.role === "model" ? "assistant" : c.role,
        content: c.parts.map((p: any) => p.text).join("\n"),
      }));
    }

    const stream = await openai.chat.completions.create({
      model: "gpt-5.4-mini",
      messages,
      temperature: 0.5,
      max_completion_tokens: 2048,
      stream: true,
      stream_options: { include_usage: true },
    });

    let texto = "";
    let usage: { prompt_tokens?: number; completion_tokens?: number } | null = null;
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        texto += delta;
        onDelta(delta);
      }
      if (chunk.usage) usage = chunk.usage;
    }

    return {
      response: {
        text: () => texto,
        usageMetadata: usage
          ? {
              promptTokenCount: usage.prompt_tokens ?? 0,
              candidatesTokenCount: usage.completion_tokens ?? 0,
            }
          : null,
      },
    };
  },
};
