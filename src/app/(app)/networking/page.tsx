"use client";

import { useState, useEffect, useMemo } from "react";
import { format, parseISO, differenceInDays } from "date-fns";
import {
  Users,
  Loader2,
  Copy,
  Check,
  AlertCircle,
  ExternalLink,
  Search,
  Filter,
} from "lucide-react";
import { toast } from "sonner";
import type { Referral, ReferralStatus, OutreachType } from "@/types/referral";
import { OUTREACH_TYPE_LABELS } from "@/types/referral";

// ── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  ReferralStatus,
  { label: string; color: string; bg: string; border: string }
> = {
  DRAFT: {
    label: "Draft",
    color: "text-slate-400",
    bg: "bg-slate-500/10",
    border: "border-slate-500/20",
  },
  SENT: {
    label: "Sent",
    color: "text-sky-400",
    bg: "bg-sky-500/10",
    border: "border-sky-500/20",
  },
  RESPONDED: {
    label: "Responded",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
  },
  REFERRED: {
    label: "Referred",
    color: "text-green-400",
    bg: "bg-green-500/10",
    border: "border-green-500/20",
  },
  DECLINED: {
    label: "Declined",
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
  },
  NO_RESPONSE: {
    label: "No Response",
    color: "text-slate-500",
    bg: "bg-slate-500/10",
    border: "border-slate-500/20",
  },
};

const ALL_STATUSES: ReferralStatus[] = [
  "DRAFT",
  "SENT",
  "RESPONDED",
  "REFERRED",
  "DECLINED",
  "NO_RESPONSE",
];

function needsFollowUp(r: Referral): boolean {
  if (r.status !== "SENT") return false;
  if (!r.messageSentAt) return false;
  return differenceInDays(new Date(), parseISO(r.messageSentAt)) >= 5;
}

// ── Referral row ─────────────────────────────────────────────────────────────

function ReferralRow({
  referral,
  onUpdate,
}: {
  referral: Referral;
  onUpdate: (id: string, fields: Partial<Referral>) => Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  const sc = STATUS_CONFIG[referral.status];
  const followUp = needsFollowUp(referral);

  async function copyMessage() {
    if (!referral.messageTemplate) return;
    await navigator.clipboard.writeText(referral.messageTemplate);
    setCopied(true);
    toast.success("Message copied");
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value as ReferralStatus;
    const data: Partial<Referral> = { status: newStatus };
    if (newStatus === "SENT" && !referral.messageSentAt) {
      data.messageSentAt = new Date().toISOString();
    }
    if (newStatus === "RESPONDED" && !referral.responseReceivedAt) {
      data.responseReceivedAt = new Date().toISOString();
    }
    if (newStatus === "REFERRED") {
      data.referralMade = true;
      if (!referral.referralDate) data.referralDate = new Date().toISOString();
    }
    await onUpdate(referral.id, data);
  }

  const jobInfo = referral.application
    ? `${referral.application.job.title} at ${referral.application.job.company}`
    : "Unknown position";

  return (
    <div
      className={`rounded-lg border p-4 transition-colors ${
        followUp
          ? "border-yellow-500/40 bg-yellow-500/5"
          : "border-border bg-card"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        {/* Left: contact info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-semibold">{referral.contactName}</span>
            {referral.contactRole && (
              <span className="text-xs text-muted-foreground">
                {referral.contactRole}
                {referral.contactCompany
                  ? ` @ ${referral.contactCompany}`
                  : ""}
              </span>
            )}
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              {OUTREACH_TYPE_LABELS[referral.outreachType]}
            </span>
            {followUp && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-yellow-400 bg-yellow-500/10 px-1.5 py-0.5 rounded-full">
                <AlertCircle className="w-3 h-3" />
                Needs Follow-up
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground/70 mb-1">
            {referral.relationship}
          </p>
          <p className="text-xs text-muted-foreground">
            For: <span className="text-foreground/80 font-medium">{jobInfo}</span>
          </p>
        </div>

        {/* Right: status + actions */}
        <div className="flex items-center gap-2 shrink-0">
          {referral.messageTemplate && (
            <button
              onClick={copyMessage}
              className="flex items-center gap-1 h-7 px-2.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              {copied ? (
                <Check className="w-3 h-3 text-emerald-400" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
              {copied ? "Copied" : "Copy msg"}
            </button>
          )}

          {referral.contactLinkedin && (
            <a
              href={referral.contactLinkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 h-7 px-2.5 rounded-md border border-border text-xs text-muted-foreground hover:text-sky-400 hover:border-sky-500/30 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              LinkedIn
            </a>
          )}

          <select
            value={referral.status}
            onChange={handleStatusChange}
            className={`h-7 appearance-none pl-2 pr-6 rounded-md border text-xs font-medium cursor-pointer focus:outline-none ${sc.color} ${sc.bg} ${sc.border}`}
          >
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_CONFIG[s].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Dates row */}
      <div className="flex gap-4 mt-2 text-[11px] text-muted-foreground/60">
        {referral.messageSentAt && (
          <span>
            Sent {format(parseISO(referral.messageSentAt), "MMM d, yyyy")}
          </span>
        )}
        {referral.responseReceivedAt && (
          <span>
            Responded{" "}
            {format(parseISO(referral.responseReceivedAt), "MMM d, yyyy")}
          </span>
        )}
        {referral.referralDate && (
          <span className="text-green-400/70">
            Referred {format(parseISO(referral.referralDate), "MMM d, yyyy")}
          </span>
        )}
        {followUp && referral.messageSentAt && (
          <span className="text-yellow-400/70">
            {differenceInDays(new Date(), parseISO(referral.messageSentAt))} days
            since sent
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function NetworkingPage() {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<ReferralStatus | "ALL" | "FOLLOW_UP">("ALL");
  const [typeFilter, setTypeFilter] = useState<OutreachType | "ALL">("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetch("/api/referrals")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setReferrals(d.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const followUpCount = useMemo(
    () => referrals.filter(needsFollowUp).length,
    [referrals]
  );

  const filtered = useMemo(() => {
    let list = referrals;

    // Status filter
    if (statusFilter === "FOLLOW_UP") {
      list = list.filter(needsFollowUp);
    } else if (statusFilter !== "ALL") {
      list = list.filter((r) => r.status === statusFilter);
    }

    // Type filter
    if (typeFilter !== "ALL") {
      list = list.filter((r) => r.outreachType === typeFilter);
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (r) =>
          r.contactName.toLowerCase().includes(q) ||
          r.contactCompany?.toLowerCase().includes(q) ||
          r.contactRole?.toLowerCase().includes(q) ||
          r.relationship.toLowerCase().includes(q) ||
          r.application?.job.title.toLowerCase().includes(q) ||
          r.application?.job.company.toLowerCase().includes(q)
      );
    }

    return list;
  }, [referrals, statusFilter, typeFilter, searchQuery]);

  // Status counts for filter badges
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: referrals.length, FOLLOW_UP: followUpCount };
    for (const s of ALL_STATUSES) {
      counts[s] = referrals.filter((r) => r.status === s).length;
    }
    return counts;
  }, [referrals, followUpCount]);

  async function handleUpdate(id: string, fields: Partial<Referral>) {
    const res = await fetch("/api/referrals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...fields }),
    });
    const data = await res.json();
    if (data.success) {
      setReferrals((prev) => prev.map((r) => (r.id === id ? data.data : r)));
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2.5">
            <Users className="w-6 h-6 text-primary" />
            Networking
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track all your outreach and referral requests across applications.
          </p>
        </div>
        {followUpCount > 0 && (
          <button
            onClick={() => setStatusFilter("FOLLOW_UP")}
            className="flex items-center gap-2 h-9 px-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm font-medium hover:bg-yellow-500/15 transition-colors"
          >
            <AlertCircle className="w-4 h-4" />
            {followUpCount} need{followUpCount === 1 ? "s" : ""} follow-up
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-5">
        {/* Search */}
        <div className="relative flex-1 md:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search contacts, companies, roles..."
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-border bg-card text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* Status filter pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-muted-foreground/50 mr-1" />
          {(
            [
              { key: "ALL", label: "All" },
              { key: "FOLLOW_UP", label: "Follow-up" },
              ...ALL_STATUSES.map((s) => ({
                key: s,
                label: STATUS_CONFIG[s].label,
              })),
            ] as { key: ReferralStatus | "ALL" | "FOLLOW_UP"; label: string }[]
          ).map(({ key, label }) => {
            const count = statusCounts[key] ?? 0;
            if (key !== "ALL" && key !== "FOLLOW_UP" && count === 0) return null;
            const active = statusFilter === key;
            return (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`h-7 px-2.5 rounded-full text-xs font-medium transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {label}
                {count > 0 && (
                  <span
                    className={`ml-1 ${
                      active ? "text-primary-foreground/70" : "text-muted-foreground/50"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Outreach type filter */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {(
            [
              { key: "ALL", label: "All types" },
              ...Object.entries(OUTREACH_TYPE_LABELS).map(([key, label]) => ({ key, label })),
            ] as { key: OutreachType | "ALL"; label: string }[]
          ).map(({ key, label }) => {
            const active = typeFilter === key;
            return (
              <button
                key={key}
                onClick={() => setTypeFilter(key)}
                className={`h-7 px-2.5 rounded-full text-xs font-medium transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-2.5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-4 animate-pulse">
              <div className="flex items-center gap-3 mb-2">
                <div className="h-4 bg-muted rounded w-28" />
                <div className="h-3 bg-muted rounded w-40" />
              </div>
              <div className="h-3 bg-muted rounded w-48 mb-1" />
              <div className="h-3 bg-muted rounded w-32" />
            </div>
          ))}
        </div>
      ) : referrals.length === 0 ? (
        <div className="text-center py-20">
          <Users className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No outreach contacts yet.</p>
          <p className="text-muted-foreground/50 text-xs mt-1">
            Add contacts from the &quot;Outreach&quot; section on any application in the Tracker.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground text-sm">
            No contacts match your filters.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((r) => (
            <ReferralRow key={r.id} referral={r} onUpdate={handleUpdate} />
          ))}
        </div>
      )}
    </div>
  );
}
