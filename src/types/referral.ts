export type ReferralStatus =
  | "DRAFT"
  | "SENT"
  | "RESPONDED"
  | "REFERRED"
  | "DECLINED"
  | "NO_RESPONSE";

export type OutreachType =
  | "WARM_INTRO"
  | "COLD_OUTREACH"
  | "ALUMNI"
  | "HIRING_MANAGER"
  | "RECRUITER"
  | "EMPLOYEE";

export const OUTREACH_TYPE_LABELS: Record<OutreachType, string> = {
  WARM_INTRO: "Warm Intro",
  COLD_OUTREACH: "Cold Outreach",
  ALUMNI: "Alumni",
  HIRING_MANAGER: "Hiring Manager",
  RECRUITER: "Recruiter",
  EMPLOYEE: "Employee",
};

export interface Referral {
  id: string;
  applicationId: string;
  contactName: string;
  contactRole: string | null;
  contactCompany: string | null;
  contactEmail: string | null;
  contactLinkedin: string | null;
  outreachType: OutreachType;
  relationship: string;
  messageTemplate: string | null;
  messageSentAt: string | null;
  responseReceivedAt: string | null;
  referralMade: boolean;
  referralDate: string | null;
  notes: string | null;
  status: ReferralStatus;
  createdAt: string;
  updatedAt: string;
  // Joined from application
  application?: {
    job: { title: string; company: string };
  };
}
