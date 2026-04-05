import { getAnthropicClient, MODEL, MAX_TOKENS } from "./client";
import { ANALYZE_SYSTEM_PROMPT, buildAnalyzePrompt } from "./prompts";
import type { ScrapedJob, AnalysisResult } from "@/types/analysis";

function extractJson(raw: string): string {
  // Strip markdown code fences if Claude wraps the JSON
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  // Try to find the outermost JSON object
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
  const client = getAnthropicClient();
  const prompt = buildAnalyzePrompt({ job, companyInfo, profile, resumeText });

  let fullText = "";

  const stream = await client.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: ANALYZE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  for await (const chunk of stream) {
    if (
      chunk.type === "content_block_delta" &&
      chunk.delta.type === "text_delta"
    ) {
      fullText += chunk.delta.text;
      onToken?.(chunk.delta.text);
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
