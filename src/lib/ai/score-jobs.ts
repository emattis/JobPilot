import { getGeminiClient, MODEL } from "./client";
import { parseAiArray } from "./parse-json";
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

// Score in smaller batches — thinking models produce longer responses
const BATCH_SIZE = 5;

function buildScoringPrompt(jobs: DiscoveredJobInput[], profile: Profile): string {
  const jobList = jobs
    .map(
      (j, i) =>
        `${i + 1}. Title: "${j.title}" | Company: "${j.company}" | Location: "${j.location ?? "Unknown"}" | Remote: ${j.remote === true ? "Yes" : j.remote === false ? "No" : "Unknown"}${j.snippet ? `\n   Snippet: ${j.snippet}` : ""}`
    )
    .join("\n");

  return `Score each job listing (0-100) for relevance to this candidate. Return a JSON array of exactly ${jobs.length} objects in the same order, each with "score" (integer 0-100) and "reasoning" (one sentence).

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

Return ONLY a raw JSON array. No markdown, no code fences, no extra text.
Example: [{"score": 85, "reasoning": "Matches target role and key skills."}, {"score": 40, "reasoning": "Different domain."}]`;
}

// Use streaming (same as analyze pipeline) — works reliably with thinking models
async function runGeminiStream(prompt: string): Promise<string> {
  const client = getGeminiClient();
  const model = client.getGenerativeModel({
    model: MODEL,
    generationConfig: { maxOutputTokens: 2048, temperature: 0 },
  });

  let fullText = "";
  const result = await model.generateContentStream(prompt);
  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) fullText += text;
  }
  return fullText;
}

async function scoreBatch(
  jobs: DiscoveredJobInput[],
  profile: Profile
): Promise<Array<{ score: number; reasoning: string }>> {
  const prompt = buildScoringPrompt(jobs, profile);

  console.log(`[score-jobs] Scoring batch of ${jobs.length} jobs`);
  console.log(`[score-jobs] Prompt length: ${prompt.length} chars`);

  const raw = await runGeminiStream(prompt);

  console.log(`[score-jobs] Raw response (${raw.length} chars):`, raw.slice(0, 600));

  const parsed = parseAiArray<{ score: number; reasoning: string }>(raw);

  if (!Array.isArray(parsed)) {
    throw new Error(`Expected array, got ${typeof parsed}`);
  }

  console.log(`[score-jobs] Extracted and sanitized JSON (${parsed.length} items)`);

  console.log(`[score-jobs] Parsed ${parsed.length} scores`);

  // Pad/trim to match batch length rather than throwing
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

  console.log(`[score-jobs] Starting batch scoring for ${jobs.length} jobs in batches of ${BATCH_SIZE}`);
  console.log(`[score-jobs] Profile targetRoles: ${profile.targetRoles.join(", ")}`);
  console.log(`[score-jobs] Profile skills (first 5): ${profile.skills.slice(0, 5).join(", ")}`);

  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    const batch = jobs.slice(i, i + BATCH_SIZE);
    let scores: Array<{ score: number; reasoning: string }> | null = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        scores = await scoreBatch(batch, profile);
        break;
      } catch (err) {
        console.error(`[score-jobs] Batch starting at ${i}, attempt ${attempt} failed:`, err instanceof Error ? err.message : err);
        if (attempt === 1) await new Promise((r) => setTimeout(r, 2000));
      }
    }

    if (scores) {
      for (let j = 0; j < batch.length; j++) {
        scored.push({ ...batch[j], relevanceScore: scores[j].score, reasoning: scores[j].reasoning });
      }
    } else {
      console.error(`[score-jobs] Both attempts failed for batch at index ${i}, defaulting to 0`);
      for (const job of batch) {
        scored.push({ ...job, relevanceScore: 0, reasoning: "" });
      }
    }

    if (i + BATCH_SIZE < jobs.length) {
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  console.log(`[score-jobs] Done. Scores: ${scored.map(j => j.relevanceScore).join(", ")}`);
  return scored;
}
