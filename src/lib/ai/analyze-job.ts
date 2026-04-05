import { getGeminiClient, MODEL, MAX_OUTPUT_TOKENS } from "./client";
import { ANALYZE_SYSTEM_PROMPT, buildAnalyzePrompt } from "./prompts";
import type { ScrapedJob, AnalysisResult } from "@/types/analysis";

function extractJson(raw: string): string {
  const trimmed = raw.trim();

  // Strategy 1: strip leading ```json or ``` and trailing ```
  // Handles the common Gemini pattern of wrapping the entire response in a code fence
  if (trimmed.startsWith("```")) {
    const withoutOpen = trimmed.replace(/^```(?:json)?\s*/i, "");
    const withoutClose = withoutOpen.replace(/\s*```\s*$/, "");
    if (withoutClose.includes("{")) return withoutClose.trim();
  }

  // Strategy 2: regex extraction for inline fences
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/s);
  if (fenced) return fenced[1].trim();

  // Strategy 3: extract outermost { ... } object
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end !== -1) return trimmed.slice(start, end + 1);

  return trimmed;
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
    console.error("Gemini raw response (first 500 chars):", fullText.slice(0, 500));
    throw new Error(`Failed to parse AI response as JSON. Starts with: "${fullText.slice(0, 80)}"`);
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
