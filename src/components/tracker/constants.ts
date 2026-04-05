import type { AppStatus } from "@/types/tracker";

export interface ColumnDef {
  status: AppStatus;
  label: string;
  color: string;         // text color class
  bg: string;            // badge bg class
  border: string;        // column border accent
  terminal?: boolean;
}

export const COLUMNS: ColumnDef[] = [
  { status: "BOOKMARKED",           label: "Bookmarked",          color: "text-slate-400",   bg: "bg-slate-500/10",   border: "border-t-slate-500/40" },
  { status: "ANALYZING",            label: "Analyzing",           color: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-t-blue-500/40" },
  { status: "READY_TO_APPLY",       label: "Ready to Apply",      color: "text-indigo-400",  bg: "bg-indigo-500/10",  border: "border-t-indigo-500/40" },
  { status: "APPLIED",              label: "Applied",             color: "text-sky-400",     bg: "bg-sky-500/10",     border: "border-t-sky-500/40" },
  { status: "SCREENING",            label: "Screening",           color: "text-yellow-400",  bg: "bg-yellow-500/10",  border: "border-t-yellow-500/40" },
  { status: "PHONE_INTERVIEW",      label: "Phone Interview",     color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-t-amber-500/40" },
  { status: "TECHNICAL_INTERVIEW",  label: "Technical Interview", color: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-t-orange-500/40" },
  { status: "ONSITE_INTERVIEW",     label: "Onsite Interview",    color: "text-rose-400",    bg: "bg-rose-500/10",    border: "border-t-rose-500/40" },
  { status: "FINAL_ROUND",          label: "Final Round",         color: "text-pink-400",    bg: "bg-pink-500/10",    border: "border-t-pink-500/40" },
  { status: "OFFER",                label: "Offer",               color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-t-emerald-500/40" },
  { status: "ACCEPTED",             label: "Accepted",            color: "text-green-400",   bg: "bg-green-500/10",   border: "border-t-green-500/40" },
  { status: "REJECTED",             label: "Rejected",            color: "text-red-400",     bg: "bg-red-500/10",     border: "border-t-red-500/40",   terminal: true },
  { status: "WITHDRAWN",            label: "Withdrawn",           color: "text-slate-400",   bg: "bg-slate-500/10",   border: "border-t-slate-500/30", terminal: true },
  { status: "GHOSTED",              label: "Ghosted",             color: "text-slate-500",   bg: "bg-slate-500/10",   border: "border-t-slate-500/30", terminal: true },
];

export const COLUMN_BY_STATUS = Object.fromEntries(
  COLUMNS.map((c) => [c.status, c])
) as Record<AppStatus, ColumnDef>;

export const ALL_STATUSES: AppStatus[] = COLUMNS.map((c) => c.status);
