import { getGeminiClient, MODEL } from "./client";
import type { DiscoveredJobInput } from "@/lib/scrapers/yc";

export interface ScoredJob extends DiscoveredJobInput {
  relevanceScore: number; // 0-100
  reasoning: string;
}

interface Profile {
  skills: string[];
  targetRoles: string[];
  yearsExperience: number | null;
  preferRemote: boolean;
  industries: string[];
  summary: string | null;
}

const BATCH_SIZE = 15;

function extractJsonArray(raw: string): string {
  const trimmed = raw.trim();

  // Strategy 1: strip leading ``` fence
  if (trimmed.startsWith("```")) {
    const withoutOpen = trimmed.replace(/^```(?:json)?\s*/i, "");
    const withoutClose = withoutOpen.replace(/\s*```\s*$/, "");
    if (withoutClose.includes("[")) return withoutClose.trim();
  }

  // Strategy 2: regex for fenced block
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();

  // Strategy 3: find outermost [ ... ]
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start !== -1 && end !== -1) return trimmed.slice(start, end + 1);

  return trimmed;
}

function buildScoringPrompt(jobs: DiscoveredJobInput[], profile: Profile): string {
  const jobList = jobs
    .map(
      (j, i) =>
        `${i + 1}. Title: "${j.title}" | Company: "${j.company}" | Location: "${j.location ?? "Unknown"}" | Remote: ${j.remote === true ? "Yes" : j.remote === false ? "No" : "Unknown"}${j.snippet ? `\n   Snippet: ${j.snippet}` : ""}`
    )
    .join("\n");

  return `Score each job listing (0-100) for relevance to this candidate. Return a JSON array of exactly ${jobs.length} objects in the same order as the input, each with "score" (integer 0-100) and "reasoning" (one concise sentence).

Candidate:
- Target roles: ${profile.targetRoles.join(", ") || "Not specified"}
- Skills: ${profile.skills.join(", ") || "Not specified"}
- Years of experience: ${profile.yearsExperience ?? "Not specified"}
- Prefers remote: ${profile.preferRemote ? "Yes" : "No"}
- Industries: ${profile.industries.join(", ") || "Any"}
${profile.summary ? `- Summary: ${profile.summary}` : ""}

Scoring:
- 80-100: Strong match for target roles and skills
- 60-79: Good match with some gaps
- 40-59: Partial match
- 20-39: Weak match
- 0-19: Poor fit or unrelated role

Jobs:
${jobList}

Return ONLY a raw JSON array — no markdown, no code fences, no extra text.
Example: [{"score": 85, "reasoning": "Matches target role and key skills."}, {"score": 40, "reasoning": "Different domain."}]`;
}

async function scoreBatch(
  jobs: DiscoveredJobInput[],
  profile: Profile
): Promise<Array<{ score: number; reasoning: string }>> {
  const client = getGeminiClient();
  const model = client.getGenerativeModel({
    model: MODEL,
    generationConfig: { maxOutputTokens: 2048, temperature: 0 },
  });

  const prompt = buildScoringPrompt(jobs, profile);
  const result = await model.generateContent(prompt);
  const raw = result.response.text();

  console.log("[score-jobs] Raw response (first 300):", raw.slice(0, 300));

  const jsonStr = extractJsonArray(raw);
  const parsed = JSON.parse(jsonStr) as Array<{ score: number; reasoning: string }>;

  if (!Array.isArray(parsed)) {
    throw new Error("Response is not a JSON array");
  }

  // If lengths differ, pad or trim rather than throw
  const results: Array<{ score: number; reasoning: string }> = [];
  for (let i = 0; i < jobs.length; i++) {
    const item = parsed[i];
    results.push({
      score: item ? Math.max(0, Math.min(100, Math.round(Number(item.score) || 0))) : 0,
      reasoning: item?.reasoning || "",
    });
  }
  return results;
}

export async function batchScoreJobs(
  jobs: DiscoveredJobInput[],
  profile: Profile
): Promise<ScoredJob[]> {
  const scored: ScoredJob[] = [];

  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    const batch = jobs.slice(i, i + BATCH_SIZE);

    let scores: Array<{ score: number; reasoning: string }> | null = null;

    // Try once, retry once on failure
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        scores = await scoreBatch(batch, profile);
        break;
      } catch (err) {
        console.error(`[score-jobs] Batch ${i / BATCH_SIZE + 1} attempt ${attempt + 1} failed:`, err);
        if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
      }
    }

    if (scores) {
      for (let j = 0; j < batch.length; j++) {
        scored.push({
          ...batch[j],
          relevanceScore: scores[j].score,
          reasoning: scores[j].reasoning,
        });
      }
    } else {
      // Both attempts failed — default to 0
      for (const job of batch) {
        scored.push({ ...job, relevanceScore: 0, reasoning: "" });
      }
    }

    if (i + BATCH_SIZE < jobs.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return scored;
}
