const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function testEmbedding() {
  try {
    const model = genAI.getGenerativeModel({ model: "embedding-001" });
    const result = await model.embedContent("Hello world");
    console.log("Dimensions:", result.embedding.values.length);
  } catch (error) {
    console.error("Embedding failed:", error);
  }
}

testEmbedding();
