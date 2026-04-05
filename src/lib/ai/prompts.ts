import type { ScrapedJob } from "@/types/analysis";

export const ANALYZE_SYSTEM_PROMPT = `You are an expert career advisor and technical recruiter with 20+ years of experience. You analyze job postings against candidate profiles and give brutally honest, actionable assessments.

Your analysis must be returned as a single valid JSON object — no markdown, no code fences, no extra text before or after. Just raw JSON.

Score interpretation:
- 80-100: Strong match — definitely apply
- 60-79: Worth applying — some gaps but winnable
- 40-59: Stretch — significant gaps, apply if motivated
- 0-39: Poor fit — probably skip

Be specific and direct. Name actual skills. Reference actual job requirements. Avoid generic advice.

Never suggest correcting dates or factual details on the candidate's resume. Assume all dates, titles, and facts on the resume are accurate. Only suggest changes to wording, emphasis, ordering, and keyword optimization.`;

export function buildAnalyzePrompt(opts: {
  job: ScrapedJob;
  companyInfo: string | null;
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
  const { job, companyInfo, profile, resumeText } = opts;

  return `## Candidate Profile
Name: ${profile.name}
Skills: ${profile.skills.join(", ") || "Not specified"}
Years of experience: ${profile.yearsExperience ?? "Not specified"}
Target roles: ${profile.targetRoles.join(", ") || "Not specified"}
Preferred industries: ${profile.industries.join(", ") || "Not specified"}
Prefers remote: ${profile.preferRemote ? "Yes" : "No"}
Salary range: ${profile.minSalary ? `$${profile.minSalary.toLocaleString()} – $${profile.maxSalary?.toLocaleString() ?? "open"}` : "Not specified"}
${profile.summary ? `\nSummary: ${profile.summary}` : ""}

## Current Resume
${resumeText ?? "No resume provided — assess based on profile alone."}

## Job Posting
Title: ${job.title}
Company: ${job.company}
Location: ${job.location ?? "Not specified"}
Remote: ${job.remote === true ? "Yes" : job.remote === false ? "No" : "Not specified"}
Salary: ${job.salaryMin ? `$${job.salaryMin.toLocaleString()} – $${job.salaryMax?.toLocaleString() ?? "open"}` : "Not specified"}
Experience level: ${job.experienceLevel ?? "Not specified"}
Skills mentioned: ${job.skills.join(", ") || "Not specified"}

Description:
${job.description.slice(0, 6000)}
${job.requirements ? `\nRequirements:\n${job.requirements}` : ""}
${job.niceToHaves ? `\nNice to haves:\n${job.niceToHaves}` : ""}

## Company Information
${companyInfo ?? "Not available."}

## Instructions
Analyze this job against the candidate profile and return a JSON object with exactly these fields:

{
  "overallFitScore": <0-100 integer, weighted composite>,
  "skillMatchScore": <0-100 integer, hard skill overlap>,
  "experienceMatchScore": <0-100 integer, years + seniority alignment>,
  "cultureFitScore": <0-100 integer, values + mission + company type fit>,
  "growthPotentialScore": <0-100 integer, career trajectory alignment>,
  "shouldApply": <boolean>,
  "confidenceLevel": <"high" | "medium" | "low">,
  "reasoning": <"2-3 paragraph honest assessment of fit, citing specific evidence from the job and candidate background">,
  "matchingSkills": <array of skill strings the candidate has that match the job>,
  "missingSkills": <array of skill strings the job requires that the candidate lacks>,
  "transferableSkills": <array of adjacent skills the candidate has that are relevant but not exact matches>,
  "resumeImprovements": <"markdown string with specific, actionable bullet points for improving the resume for this role — reword existing bullets, reorder sections, add keywords">,
  "coverLetterTips": <"2-3 specific talking points for a cover letter, referencing actual job requirements and candidate background">,
  "interviewPrepTopics": <array of specific topics to study before interviewing for this role>,
  "companyAnalysis": <"1-2 paragraph read on the company culture, stage, and mission from available info">
}

CRITICAL: Never invent experience. Be honest. If this is a poor fit, say so clearly.`;
}
