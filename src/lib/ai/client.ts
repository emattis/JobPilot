import { GoogleGenerativeAI } from "@google/generative-ai";

let _client: GoogleGenerativeAI | null = null;

export function getGeminiClient(): GoogleGenerativeAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === "your-gemini-api-key") {
    throw new Error("GEMINI_API_KEY is not configured. Add it to your .env file.");
  }
  if (!_client) {
    _client = new GoogleGenerativeAI(key);
  }
  return _client;
}

export const MODEL = "gemini-2.5-pro-exp-03-25";
export const MAX_OUTPUT_TOKENS = 8192;
