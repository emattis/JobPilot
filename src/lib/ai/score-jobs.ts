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

function buildScoringPrompt(
  jobs: DiscoveredJobInput[],
  profile: Profile
): string {
  const jobList = jobs
    .map(
      (j, i) =>
        `${i + 1}. Title: "${j.title}" | Company: "${j.company}" | Location: "${j.location ?? "Unknown"}" | Remote: ${j.remote === true ? "Yes" : j.remote === false ? "No" : "Unknown"}${j.snippet ? `\n   Description snippet: ${j.snippet}` : ""}`
    )
    .join("\n");

  return `Score each job listing (0-100) for relevance to this candidate. Return a JSON array of exactly ${jobs.length} objects in the same order as the input, each with "score" (integer 0-100) and "reasoning" (one sentence explaining the score).

Scoring criteria:
- 80-100: Strong match for target roles and skills
- 60-79: Good match with some gaps
- 40-59: Partial match
- 20-39: Weak match
- 0-19: Poor fit

Candidate:
- Target roles: ${profile.targetRoles.join(", ") || "Not specified"}
- Skills: ${profile.skills.join(", ") || "Not specified"}
- Years of experience: ${profile.yearsExperience ?? "Not specified"}
- Prefers remote: ${profile.preferRemote ? "Yes" : "No"}
- Industries: ${profile.industries.join(", ") || "Any"}
${profile.summary ? `- Summary: ${profile.summary}` : ""}

Jobs to score:
${jobList}

Return only a raw JSON array, no markdown, no extra text. Example format:
[{"score": 85, "reasoning": "Strong match..."}, {"score": 42, "reasoning": "Partial overlap..."}]`;
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
  const raw = result.response.text().trim();

  // Strip fences if present
  const json = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  const parsed = JSON.parse(json) as Array<{
    score: number;
    reasoning: string;
  }>;

  if (!Array.isArray(parsed) || parsed.length !== jobs.length) {
    throw new Error(
      `Score batch returned ${parsed.length} items for ${jobs.length} jobs`
    );
  }

  return parsed.map((item) => ({
    score: Math.max(0, Math.min(100, Math.round(Number(item.score) || 0))),
    reasoning: item.reasoning || "",
  }));
}

export async function batchScoreJobs(
  jobs: DiscoveredJobInput[],
  profile: Profile
): Promise<ScoredJob[]> {
  const scored: ScoredJob[] = [];

  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    const batch = jobs.slice(i, i + BATCH_SIZE);
    try {
      const scores = await scoreBatch(batch, profile);
      for (let j = 0; j < batch.length; j++) {
        scored.push({
          ...batch[j],
          relevanceScore: scores[j].score,
          reasoning: scores[j].reasoning,
        });
      }
    } catch {
      // If scoring fails for a batch, assign neutral scores and continue
      for (const job of batch) {
        scored.push({ ...job, relevanceScore: 50, reasoning: "Could not score" });
      }
    }

    // Small delay between batches
    if (i + BATCH_SIZE < jobs.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return scored;
}
