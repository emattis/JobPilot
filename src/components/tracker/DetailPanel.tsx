"use client";

import { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { X, ExternalLink, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { TrackerApplication, AppStatus } from "@/types/tracker";
import { COLUMN_BY_STATUS, COLUMNS } from "./constants";
import { ReferralSection } from "./ReferralSection";

function fitScoreClass(score: number) {
  if (score >= 80) return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
  if (score >= 60) return "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
  return "text-red-400 bg-red-500/10 border-red-500/20";
}

interface DetailPanelProps {
  app: TrackerApplication;
  onClose: () => void;
  onStatusChange: (id: string, status: AppStatus) => Promise<void>;
  onNotesChange: (id: string, notes: string) => Promise<void>;
  onFollowUpChange: (id: string, date: string) => Promise<void>;
}

export function DetailPanel({
  app,
  onClose,
  onStatusChange,
  onNotesChange,
  onFollowUpChange,
}: DetailPanelProps) {
  const [notes, setNotes] = useState(app.notes ?? "");
  const [followUp, setFollowUp] = useState(
    app.followUpDate ? format(parseISO(app.followUpDate), "yyyy-MM-dd") : ""
  );
  const [savingNotes, setSavingNotes] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);

  // Sync when app changes
  useEffect(() => {
    setNotes(app.notes ?? "");
    setFollowUp(app.followUpDate ? format(parseISO(app.followUpDate), "yyyy-MM-dd") : "");
  }, [app.id, app.notes, app.followUpDate]);

  const col = COLUMN_BY_STATUS[app.status];
  const analysis = app.job.analyses[0];

  async function handleNotesBlur() {
    if (notes === (app.notes ?? "")) return;
    setSavingNotes(true);
    await onNotesChange(app.id, notes);
    setSavingNotes(false);
  }

  async function handleFollowUpBlur() {
    if (followUp === (app.followUpDate ? format(parseISO(app.followUpDate), "yyyy-MM-dd") : "")) return;
    await onFollowUpChange(app.id, followUp);
  }

  async function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value as AppStatus;
    if (newStatus === app.status) return;
    setChangingStatus(true);
    await onStatusChange(app.id, newStatus);
    setChangingStatus(false);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between p-5 pb-4 border-b border-border shrink-0">
        <div className="flex-1 min-w-0 pr-4">
          <p className="text-xs text-muted-foreground font-medium">{app.job.company}</p>
          <h2 className="text-lg font-bold leading-tight truncate">{app.job.title}</h2>
          {app.job.location && (
            <p className="text-xs text-muted-foreground/70 mt-0.5">{app.job.location}</p>
          )}
        </div>
        <Button variant="ghost" size="sm" className="shrink-0 -mr-1" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-5 space-y-5">

          {/* Fit score + links */}
          <div className="flex items-center gap-3 flex-wrap">
            {analysis && (
              <span className={`text-sm font-bold px-3 py-1 rounded-full border ${fitScoreClass(analysis.overallFitScore)}`}>
                {analysis.overallFitScore}% fit
              </span>
            )}
            {analysis?.shouldApply === true && (
              <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-xs">
                Recommended
              </Badge>
            )}
            <a
              href={app.job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              View posting <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <Separator />

          {/* Status */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
              Status
            </label>
            <div className="relative">
              <select
                value={app.status}
                onChange={handleStatusChange}
                disabled={changingStatus}
                className={`w-full appearance-none text-sm font-medium px-3 py-2 pr-8 rounded-md border border-border bg-card cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60 ${col.color}`}
              >
                {COLUMNS.map((c) => (
                  <option key={c.status} value={c.status} className="text-foreground">
                    {c.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-muted-foreground" />
            </div>
          </div>

          {/* Follow-up date */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
              Follow-up Date
            </label>
            <input
              type="date"
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              onBlur={handleFollowUpBlur}
              className="w-full text-sm px-3 py-2 rounded-md border border-border bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
              Notes
              {savingNotes && <span className="ml-2 font-normal text-muted-foreground/50 normal-case">Saving…</span>}
            </label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={handleNotesBlur}
              placeholder="Add notes about this application…"
              rows={4}
              className="text-sm resize-none"
            />
          </div>

          <Separator />

          {/* Warm Intros / Referrals */}
          <ReferralSection
            applicationId={app.id}
            jobTitle={app.job.title}
            jobCompany={app.job.company}
          />

          <Separator />

          {/* Status history */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Status History
            </h3>
            {app.statusHistory.length === 0 ? (
              <p className="text-xs text-muted-foreground/50">No status changes yet.</p>
            ) : (
              <ol className="relative border-l border-border/50 ml-1 space-y-3">
                {app.statusHistory.map((h) => {
                  const to = COLUMN_BY_STATUS[h.toStatus];
                  return (
                    <li key={h.id} className="ml-4">
                      <span className="absolute -left-1.5 w-3 h-3 rounded-full border border-border bg-card" />
                      <p className={`text-sm font-medium ${to.color}`}>{to.label}</p>
                      <p className="text-[11px] text-muted-foreground/60">
                        {format(parseISO(h.changedAt), "MMM d, yyyy 'at' h:mm a")}
                      </p>
                      {h.note && <p className="text-xs text-muted-foreground mt-0.5">{h.note}</p>}
                    </li>
                  );
                })}
                {/* Current status */}
                <li className="ml-4">
                  <span className={`absolute -left-1.5 w-3 h-3 rounded-full border ${col.border} bg-card`} />
                  <p className={`text-sm font-medium ${col.color}`}>{col.label} (current)</p>
                  <p className="text-[11px] text-muted-foreground/60">
                    {format(parseISO(app.updatedAt), "MMM d, yyyy 'at' h:mm a")}
                  </p>
                </li>
              </ol>
            )}
          </div>

          {/* Job details */}
          <Separator />
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Job Details
            </h3>
            <dl className="space-y-1.5 text-sm">
              {app.job.salaryMin && (
                <div className="flex gap-2">
                  <dt className="text-muted-foreground w-20 shrink-0">Salary</dt>
                  <dd>
                    ${app.job.salaryMin.toLocaleString()}
                    {app.job.salaryMax ? ` – $${app.job.salaryMax.toLocaleString()}` : "+"}
                  </dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="text-muted-foreground w-20 shrink-0">Source</dt>
                <dd className="capitalize">{app.job.source}</dd>
              </div>
              {app.resume && (
                <div className="flex gap-2">
                  <dt className="text-muted-foreground w-20 shrink-0">Resume</dt>
                  <dd>{app.resume.name}</dd>
                </div>
              )}
            </dl>
          </div>

        </div>
      </div>
    </div>
  );
}
