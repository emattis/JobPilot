import { getGeminiClient, MODEL, MAX_OUTPUT_TOKENS } from "./client";
import {
  ROLE_ANALYSIS_SYSTEM_PROMPT,
  CANDIDATE_FIT_SYSTEM_PROMPT,
  buildRoleAnalysisPrompt,
  buildCandidateFitPrompt,
} from "./prompts";
import { parseAiObject } from "./parse-json";
import type { ScrapedJob, RoleAnalysisCache, AnalysisResult } from "@/types/analysis";

async function runGemini(
  systemInstruction: string,
  prompt: string,
  onToken?: (token: string) => void
): Promise<string> {
  const client = getGeminiClient();
  const model = client.getGenerativeModel({
    model: MODEL,
    systemInstruction,
    generationConfig: {
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      temperature: 0,
    },
  });

  let fullText = "";
  const result = await model.generateContentStream(prompt);

  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) {
      fullText += text;
      onToken?.(text);
    }
  }

  return fullText;
}

// ── Phase 1: Role analysis (cached per job) ───────────────────────────────────

export async function analyzeRole(
  job: ScrapedJob,
  companyInfo: string | null
): Promise<RoleAnalysisCache> {
  const prompt = buildRoleAnalysisPrompt(job, companyInfo);
  const raw = await runGemini(ROLE_ANALYSIS_SYSTEM_PROMPT, prompt);

  try {
    return parseAiObject<RoleAnalysisCache>(raw);
  } catch {
    console.error("Role analysis raw response (first 500):", raw.slice(0, 500));
    throw new Error(`Failed to parse role analysis JSON. Starts with: "${raw.slice(0, 80)}"`);
  }
}

// ── Phase 2: Candidate fit (always fresh) ────────────────────────────────────

export async function analyzeCandidateFit(
  job: ScrapedJob,
  roleCache: RoleAnalysisCache,
  profile: Parameters<typeof buildCandidateFitPrompt>[0]["profile"],
  resumeText: string | null,
  onToken?: (token: string) => void
): Promise<AnalysisResult> {
  const prompt = buildCandidateFitPrompt({ job, roleCache, profile, resumeText });
  const raw = await runGemini(CANDIDATE_FIT_SYSTEM_PROMPT, prompt, onToken);

  let parsed: Omit<AnalysisResult, "companyAnalysis">;
  try {
    parsed = parseAiObject<Omit<AnalysisResult, "companyAnalysis">>(raw);
  } catch {
    console.error("Candidate fit raw response (first 500):", raw.slice(0, 500));
    throw new Error(`Failed to parse candidate fit JSON. Starts with: "${raw.slice(0, 80)}"`);
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
    (parsed as Record<string, number>)[field] = Math.max(
      0,
      Math.min(100, Math.round(Number((parsed as Record<string, number>)[field]) || 0))
    );
  }

  // Merge company analysis from the role cache
  return {
    ...parsed,
    companyAnalysis: roleCache.companyAnalysis,
  } as AnalysisResult;
}
