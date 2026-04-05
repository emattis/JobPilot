export type ReferralStatus =
  | "DRAFT"
  | "SENT"
  | "RESPONDED"
  | "REFERRED"
  | "DECLINED"
  | "NO_RESPONSE";

export interface Referral {
  id: string;
  applicationId: string;
  contactName: string;
  contactRole: string | null;
  contactCompany: string | null;
  contactLinkedin: string | null;
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
