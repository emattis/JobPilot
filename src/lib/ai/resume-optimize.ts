import { getGeminiClient, MODEL } from "./client";
import { parseAiObject } from "./parse-json";

export type SuggestionType = "reword" | "add" | "remove" | "reorder";

export interface ResumeSuggestion {
  id: string;
  section: string;       // e.g. "Summary", "Experience", "Skills"
  type: SuggestionType;
  original: string;      // exact text from the current resume (empty for "add")
  suggested: string;     // replacement / new text (empty for "remove")
  reason: string;        // why this change improves fit
}

export interface OptimizationResult {
  strengthScore: number;           // 0-100 ATS/recruiter score for the tailored version
  suggestions: ResumeSuggestion[];
  optimizedResume: string;         // full resume text with all suggestions applied
}

const SYSTEM_PROMPT = `You are an expert resume optimization specialist and career coach.
You tailor resumes to specific job postings by rewriting bullet points, reordering content, and adding relevant keywords — always based on the candidate's actual experience. You NEVER fabricate experience.

Your output must be a single JSON object (no markdown fences) matching exactly this schema:
{
  "strengthScore": number,        // 0-100: estimated ATS + recruiter fit score for the tailored resume
  "suggestions": [
    {
      "id": string,               // unique short id e.g. "s1", "s2"
      "section": string,          // "Summary" | "Experience" | "Skills" | "Education" | "Projects" | etc.
      "type": "reword" | "add" | "remove" | "reorder",
      "original": string,         // EXACT verbatim text from the resume to be replaced/removed; empty string for "add"
      "suggested": string,        // replacement text; empty string for "remove"
      "reason": string            // concise explanation (1-2 sentences)
    }
  ],
  "optimizedResume": string       // complete resume text with ALL suggestions applied
}

Rules:
- For "reword": original must be an exact, verbatim substring of the resume (copy-paste accurate)
- For "add": original is empty; suggested contains the new content; include where it goes in the reason
- For "remove": suggested is empty; original is the text to cut
- For "reorder": original is the section/block as-is; suggested shows the reordered version
- Score interpretation: 85+ excellent match, 70-84 good, 55-69 fair, <55 weak
- Aim for 5-12 high-impact suggestions. Quality over quantity.`;

function buildPrompt(
  resumeText: string,
  job: { title: string; company: string; description: string; requirements: string | null }
): string {
  return `## Target Job

**Title**: ${job.title}
**Company**: ${job.company}

**Job Description**:
${job.description.slice(0, 3000)}

${job.requirements ? `**Requirements**:\n${job.requirements.slice(0, 1500)}` : ""}

---

## Current Resume

${resumeText}

---

Analyze this resume against the target job and produce the JSON optimization report. Focus on:
1. Keyword alignment with the job description (ATS optimization)
2. Rewriting bullet points to quantify impact and mirror job language
3. Elevating the most relevant experience to the top
4. Removing or de-emphasizing irrelevant content
5. Strengthening the summary/objective if present`;
}

export async function optimizeResume(
  resumeText: string,
  job: { title: string; company: string; description: string; requirements: string | null },
  onToken?: (token: string) => void
): Promise<OptimizationResult> {
  const client = getGeminiClient();
  const model = client.getGenerativeModel({
    model: MODEL,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: { temperature: 0.2, maxOutputTokens: 16384 },
  });

  const prompt = buildPrompt(resumeText, job);
  const result = await model.generateContentStream(prompt);

  let raw = "";
  for await (const chunk of result.stream) {
    const text = chunk.text();
    raw += text;
    onToken?.(text);
  }

  const parsed = parseAiObject<OptimizationResult>(raw);

  // Ensure all suggestions have IDs
  parsed.suggestions = parsed.suggestions.map((s, i) => ({
    ...s,
    id: s.id ?? `s${i + 1}`,
  }));

  return parsed;
}
