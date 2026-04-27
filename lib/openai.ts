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
        model: "gpt-4.1-mini",
        messages: messages,
        temperature: 0.5,
        max_tokens: 2048,
      });

      const textOutput = response.choices[0].message.content || "";

      return {
        response: {
          text: () => textOutput,
        },
      };
    } catch (error) {
      console.error("OpenAI API Error:", error);
      throw error;
    }
  },
};
