import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

async function listModels() {
  try {
    // listModels no esta tipado en el SDK; cast para script de diagnostico
    const modelList = await (genAI.getGenerativeModel({ model: "gemini-1.5-flash" }) as any).listModels();
    console.log(JSON.stringify(modelList, null, 2));
  } catch (error) {
    console.error(error);
  }
}

listModels();
