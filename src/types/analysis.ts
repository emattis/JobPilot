export interface ScrapedJob {
  title: string;
  company: string;
  location: string | null;
  description: string;
  requirements: string | null;
  niceToHaves: string | null;
  skills: string[];
  experienceLevel: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  remote: boolean | null;
  postedAt: Date | null;
  source: string;
}

/** Cached per-job role analysis — independent of any candidate */
export interface RoleAnalysisCache {
  companyAnalysis: string;
  cultureInsights: string;
  keySkillsNeeded: string[];
  niceToHaveSkills: string[];
  roleRequirements: string;
  experienceLevelExpected: string | null;
}

/** Candidate-fit analysis — always runs fresh against current profile/resume */
export interface AnalysisResult {
  overallFitScore: number;
  skillMatchScore: number;
  experienceMatchScore: number;
  cultureFitScore: number;
  growthPotentialScore: number;
  shouldApply: boolean;
  confidenceLevel: "high" | "medium" | "low";
  reasoning: string;
  matchingSkills: string[];
  missingSkills: string[];
  transferableSkills: string[];
  resumeImprovements: string;
  coverLetterTips: string;
  interviewPrepTopics: string[];
  companyAnalysis: string; // surfaced from RoleAnalysisCache
}

export type SseEvent =
  | { type: "status"; message: string }
  | {
      type: "complete";
      analysisId: string;
      jobId: string;
      result: AnalysisResult;
      job: ScrapedJob;
      fromCache: boolean;
    }
  | { type: "error"; error: string; allowManual?: boolean };
