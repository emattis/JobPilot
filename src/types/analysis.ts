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
  companyAnalysis: string;
}

export type SseEvent =
  | { type: "status"; message: string }
  | { type: "complete"; analysisId: string; jobId: string; result: AnalysisResult; job: ScrapedJob }
  | { type: "error"; error: string; allowManual?: boolean };
