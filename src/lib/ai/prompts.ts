import type { ScrapedJob, RoleAnalysisCache } from "@/types/analysis";

const JSON_RULES = `Your response must be a single valid JSON object — no markdown, no code fences, no extra text before or after. Just raw JSON.`;

// ── System prompts ────────────────────────────────────────────────────────────

export const ROLE_ANALYSIS_SYSTEM_PROMPT = `You are an expert technical recruiter and talent analyst. You extract structured insights from job postings and company information, independent of any specific candidate.

${JSON_RULES}`;

export const CANDIDATE_FIT_SYSTEM_PROMPT = `You are an expert career advisor and technical recruiter with 20+ years of experience. You analyze candidate profiles against pre-analyzed job roles and give brutally honest, actionable assessments.

${JSON_RULES}

## Scoring methodology — follow these rules exactly

### skillMatchScore
Count how many of the keySkillsNeeded the candidate demonstrably has, divide by total keySkillsNeeded, multiply by 100.
- 100: has every required skill
- 80-99: missing 1 required skill
- 60-79: missing 2-3 required skills
- 40-59: missing 4-5 required skills
- 20-39: missing more than half of required skills
- 0-19: has almost none of the required skills

### experienceMatchScore
Compare candidate's years of experience and seniority level to the role's expectation.
- 95-100: exact match on years AND seniority (e.g., senior with 6 yrs for a senior 5+ yrs role)
- 80-94: within 1 year of the minimum OR one level off (e.g., mid applying to senior)
- 60-79: 2-3 years short of requirement (e.g., required 5 yrs, has 2-3 yrs)
- 40-59: 4+ years short, or junior applying to senior
- 20-39: severely underqualified on experience alone
- 0-19: no relevant experience at the required level

### cultureFitScore
Based on signals from cultureInsights and companyAnalysis vs. candidate's target roles and industries.
- 80-100: industry match, company stage match, work style alignment evident
- 60-79: partial alignment — some mismatch in stage or domain
- 40-59: noticeable mismatch (e.g., enterprise candidate at a scrappy startup)
- 0-39: clear cultural mismatch

### growthPotentialScore
How well does this role advance the candidate's stated career trajectory?
- 80-100: natural next step in target career path, clear skill-building opportunity
- 60-79: related trajectory, some detour
- 40-59: lateral or unclear fit with stated goals
- 0-39: diverges from stated target roles

### overallFitScore
Weighted composite: skillMatch × 0.40 + experienceMatch × 0.30 + cultureFit × 0.15 + growthPotential × 0.15. Round to nearest integer.

## Calibration — read this before scoring
Most candidates applying to jobs they are not perfectly qualified for will score 55-75. Reserve scores accordingly:
- 90+: candidate meets virtually every requirement — skills, years, seniority, domain. Rare.
- 80-89: strong fit with at most one minor gap. Should confidently apply.
- 70-79: solid fit, 1-2 meaningful gaps but clearly competitive. Worth applying.
- 55-69: partial fit, several gaps, outcome uncertain. Apply only if motivated.
- 40-54: significant gaps. Long shot.
- Below 40: poor fit. Probably skip.

Do not inflate scores to be encouraging. An overqualified candidate should score high. An underqualified one should score low even if the role sounds appealing. Be conservative.

Be specific and direct. Name actual skills. Reference actual requirements. Avoid generic advice.

Never suggest correcting dates or factual details on the candidate's resume. Assume all dates, titles, and facts on the resume are accurate. Only suggest changes to wording, emphasis, ordering, and keyword optimization.`;

// ── Phase 1: Role analysis (cached per job) ───────────────────────────────────

export function buildRoleAnalysisPrompt(
  job: ScrapedJob,
  companyInfo: string | null
): string {
  return `Analyze this job posting and company. Return a JSON object with exactly these fields:

{
  "companyAnalysis": <"1-2 paragraph read on the company: stage, mission, culture, what type of person thrives here">,
  "cultureInsights": <"1 paragraph on team culture, work style, and values signals from the job and company info">,
  "keySkillsNeeded": <array of must-have skill strings required for this role>,
  "niceToHaveSkills": <array of bonus/preferred skill strings mentioned in the posting>,
  "roleRequirements": <"prose summary of the core qualifications, experience level, and responsibilities">,
  "experienceLevelExpected": <"junior" | "mid" | "senior" | "lead" | "staff" | "principal" | null>
}

## Job Posting
Title: ${job.title}
Company: ${job.company}
Location: ${job.location ?? "Not specified"}
Remote: ${job.remote === true ? "Yes" : job.remote === false ? "No" : "Not specified"}
Salary: ${job.salaryMin ? `$${job.salaryMin.toLocaleString()} – $${job.salaryMax?.toLocaleString() ?? "open"}` : "Not specified"}
Experience level (detected): ${job.experienceLevel ?? "Not specified"}
Skills mentioned: ${job.skills.join(", ") || "Not specified"}

Description:
${job.description.slice(0, 6000)}
${job.requirements ? `\nRequirements:\n${job.requirements}` : ""}
${job.niceToHaves ? `\nNice to haves:\n${job.niceToHaves}` : ""}

## Company Information
${companyInfo ?? "Not available."}`;
}

// ── Phase 2: Candidate fit (always fresh) ─────────────────────────────────────

export function buildCandidateFitPrompt(opts: {
  job: ScrapedJob;
  roleCache: RoleAnalysisCache;
  profile: {
    name: string;
    email: string;
    skills: string[];
    yearsExperience: number | null;
    targetRoles: string[];
    summary: string | null;
    preferRemote: boolean;
    minSalary: number | null;
    maxSalary: number | null;
    industries: string[];
  };
  resumeText: string | null;
}): string {
  const { job, roleCache, profile, resumeText } = opts;

  return `Score this candidate against the pre-analyzed job role below. Return a JSON object with exactly these fields:

{
  "overallFitScore": <0-100 integer, weighted composite>,
  "skillMatchScore": <0-100 integer, hard skill overlap vs keySkillsNeeded>,
  "experienceMatchScore": <0-100 integer, years + seniority vs experienceLevelExpected>,
  "cultureFitScore": <0-100 integer, candidate values + work style vs cultureInsights>,
  "growthPotentialScore": <0-100 integer, career trajectory alignment>,
  "shouldApply": <boolean>,
  "confidenceLevel": <"high" | "medium" | "low">,
  "reasoning": <"2-3 paragraph honest assessment citing specific evidence from both the role analysis and candidate background">,
  "matchingSkills": <array of skills the candidate has that appear in keySkillsNeeded or the role requirements>,
  "missingSkills": <array of keySkillsNeeded the candidate clearly lacks>,
  "transferableSkills": <array of adjacent skills the candidate has that are relevant but not exact matches>,
  "resumeImprovements": <"markdown with specific actionable bullets: reword existing bullets to match job keywords, reorder sections, add missing keywords from the role — never invent experience">,
  "coverLetterTips": <"2-3 specific talking points referencing actual role requirements and candidate background">,
  "interviewPrepTopics": <array of specific topics to study before interviewing for this role>
}

CRITICAL: Never invent experience. Be honest. If this is a poor fit, say so clearly.

## Role Analysis (pre-cached)
Title: ${job.title} at ${job.company}
Location: ${job.location ?? "Not specified"} · Remote: ${job.remote === true ? "Yes" : job.remote === false ? "No" : "Unknown"}
Salary: ${job.salaryMin ? `$${job.salaryMin.toLocaleString()} – $${job.salaryMax?.toLocaleString() ?? "open"}` : "Not specified"}
Experience expected: ${roleCache.experienceLevelExpected ?? "Not specified"}
Key skills needed: ${roleCache.keySkillsNeeded.join(", ") || "Not specified"}
Nice to haves: ${roleCache.niceToHaveSkills.join(", ") || "None listed"}

Role requirements:
${roleCache.roleRequirements}

Company / culture:
${roleCache.companyAnalysis}
${roleCache.cultureInsights}

## Candidate Profile
Name: ${profile.name}
Skills: ${profile.skills.join(", ") || "Not specified"}
Years of experience: ${profile.yearsExperience ?? "Not specified"}
Target roles: ${profile.targetRoles.join(", ") || "Not specified"}
Preferred industries: ${profile.industries.join(", ") || "Not specified"}
Prefers remote: ${profile.preferRemote ? "Yes" : "No"}
Salary range: ${profile.minSalary ? `$${profile.minSalary.toLocaleString()} – $${profile.maxSalary?.toLocaleString() ?? "open"}` : "Not specified"}
${profile.summary ? `\nSummary: ${profile.summary}` : ""}

## Current Resume
${resumeText ?? "No resume provided — assess based on profile alone."}`;
}
