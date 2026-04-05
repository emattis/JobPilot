import { getGeminiClient, MODEL, MAX_OUTPUT_TOKENS } from "./client";
import { ANALYZE_SYSTEM_PROMPT, buildAnalyzePrompt } from "./prompts";
import type { ScrapedJob, AnalysisResult } from "@/types/analysis";

function extractJson(raw: string): string {
  // Strip markdown code fences if the model wraps the JSON
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  // Find the outermost JSON object
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end !== -1) return raw.slice(start, end + 1);
  return raw.trim();
}

export async function analyzeJob(
  job: ScrapedJob,
  companyInfo: string | null,
  profile: Parameters<typeof buildAnalyzePrompt>[0]["profile"],
  resumeText: string | null,
  onToken?: (token: string) => void
): Promise<AnalysisResult> {
  const client = getGeminiClient();
  const model = client.getGenerativeModel({
    model: MODEL,
    systemInstruction: ANALYZE_SYSTEM_PROMPT,
    generationConfig: {
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      temperature: 0.3,
    },
  });

  const prompt = buildAnalyzePrompt({ job, companyInfo, profile, resumeText });

  let fullText = "";
  const result = await model.generateContentStream(prompt);

  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) {
      fullText += text;
      onToken?.(text);
    }
  }

  const jsonStr = extractJson(fullText);

  let parsed: AnalysisResult;
  try {
    parsed = JSON.parse(jsonStr) as AnalysisResult;
  } catch {
    throw new Error(`Failed to parse AI response as JSON. Raw: ${fullText.slice(0, 200)}`);
  }

  // Clamp all scores to 0-100
  const scoreFields = [
    "overallFitScore",
    "skillMatchScore",
    "experienceMatchScore",
    "cultureFitScore",
    "growthPotentialScore",
  ] as const;
  for (const field of scoreFields) {
    parsed[field] = Math.max(0, Math.min(100, Math.round(Number(parsed[field]) || 0)));
  }

  return parsed;
}
