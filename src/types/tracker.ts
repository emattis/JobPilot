export type AppStatus =
  | "BOOKMARKED"
  | "ANALYZING"
  | "READY_TO_APPLY"
  | "APPLIED"
  | "SCREENING"
  | "PHONE_INTERVIEW"
  | "TECHNICAL_INTERVIEW"
  | "ONSITE_INTERVIEW"
  | "FINAL_ROUND"
  | "OFFER"
  | "ACCEPTED"
  | "REJECTED"
  | "WITHDRAWN"
  | "GHOSTED";

export interface TrackerApplication {
  id: string;
  status: AppStatus;
  createdAt: string;
  updatedAt: string;
  appliedAt: string | null;
  responseAt: string | null;
  interviewAt: string | null;
  notes: string | null;
  followUpDate: string | null;
  rejectedAt: string | null;
  offeredAt: string | null;
  offerAmount: number | null;
  accepted: boolean | null;
  job: {
    id: string;
    title: string;
    company: string;
    location: string | null;
    remote: boolean | null;
    url: string;
    source: string;
    salaryMin: number | null;
    salaryMax: number | null;
    analyses: Array<{
      id: string;
      overallFitScore: number;
      skillMatchScore: number;
      experienceMatchScore: number;
      cultureFitScore: number;
      growthPotentialScore: number;
      shouldApply: boolean;
      confidenceLevel: string;
      reasoning: string;
      matchingSkills: string[];
      missingSkills: string[];
      transferableSkills: string[];
      resumeImprovements: string;
      coverLetterTips: string | null;
      interviewPrepTopics: string[];
      companyAnalysis: string | null;
    }>;
  };
  statusHistory: Array<{
    id: string;
    fromStatus: AppStatus;
    toStatus: AppStatus;
    changedAt: string;
    note: string | null;
  }>;
  resume: { id: string; name: string } | null;
  story: { id: string } | null;
}
