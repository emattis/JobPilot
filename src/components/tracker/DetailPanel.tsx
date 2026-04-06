"use client";

import { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { X, ExternalLink, ChevronDown, Check, Loader2, Trash2, BookOpen } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { TrackerApplication, AppStatus } from "@/types/tracker";
import { COLUMN_BY_STATUS, COLUMNS } from "./constants";
import { ReferralSection } from "./ReferralSection";
import { AnalyzeSection } from "./AnalyzeSection";

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
  onRemove: (id: string) => Promise<void>;
  onRefresh: () => void;
}

export function DetailPanel({
  app,
  onClose,
  onStatusChange,
  onNotesChange,
  onFollowUpChange,
  onRemove,
  onRefresh,
}: DetailPanelProps) {
  const [notes, setNotes] = useState(app.notes ?? "");
  const [followUp, setFollowUp] = useState(
    app.followUpDate ? format(parseISO(app.followUpDate), "yyyy-MM-dd") : ""
  );
  const [savingNotes, setSavingNotes] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const isManualUrl = !app.job.url || app.job.url.startsWith("manual://");
  const [jobUrl, setJobUrl] = useState(isManualUrl ? "" : app.job.url);
  const [savingUrl, setSavingUrl] = useState(false);

  // Sync when app changes
  useEffect(() => {
    setNotes(app.notes ?? "");
    setFollowUp(app.followUpDate ? format(parseISO(app.followUpDate), "yyyy-MM-dd") : "");
    const manual = !app.job.url || app.job.url.startsWith("manual://");
    setJobUrl(manual ? "" : app.job.url);
  }, [app.id, app.notes, app.followUpDate, app.job.url]);

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

  async function handleSaveUrl() {
    const trimmed = jobUrl.trim();
    if (!trimmed) return;
    try {
      new URL(trimmed); // validate
    } catch {
      toast.error("Enter a valid URL");
      return;
    }
    setSavingUrl(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: app.job.id, url: trimmed }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success("Job URL saved");
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save URL");
    } finally {
      setSavingUrl(false);
    }
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
            {!isManualUrl && (
              <a
                href={app.job.url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                View posting <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          {/* Job URL */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
              Job URL
            </label>
            <div className="flex gap-1.5">
              <input
                type="url"
                value={jobUrl}
                onChange={(e) => setJobUrl(e.target.value)}
                placeholder="https://jobs.lever.co/company/job-id"
                className="flex-1 h-8 rounded-md border border-input bg-background px-2.5 text-xs placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              {jobUrl.trim() && jobUrl !== (isManualUrl ? "" : app.job.url) && (
                <button
                  onClick={handleSaveUrl}
                  disabled={savingUrl}
                  className="h-8 px-2.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1"
                >
                  {savingUrl ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  Save
                </button>
              )}
              {!isManualUrl && (
                <a
                  href={app.job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-8 px-2 rounded-md border border-border flex items-center text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>

          {/* AI Analysis */}
          <AnalyzeSection
            jobUrl={app.job.url}
            jobTitle={app.job.title}
            jobCompany={app.job.company}
            hasAnalysis={!!analysis}
            onAnalysisComplete={onRefresh}
          />

          {/* My Story */}
          <Link
            href={`/story?app=${app.id}`}
            className="flex items-center gap-2 w-full h-9 px-3 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          >
            <BookOpen className="w-4 h-4" />
            Generate My Story
          </Link>

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

          {/* Remove */}
          <Separator />
          <div>
            {confirmRemove ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-xs text-muted-foreground mb-3">
                  Remove <span className="font-medium text-foreground">{app.job.title}</span> at{" "}
                  <span className="font-medium text-foreground">{app.job.company}</span> from your tracker? This cannot be undone.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      setRemoving(true);
                      await onRemove(app.id);
                    }}
                    disabled={removing}
                    className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md bg-destructive text-destructive-foreground text-xs font-medium hover:bg-destructive/90 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="w-3 h-3" />
                    {removing ? "Removing…" : "Yes, remove"}
                  </button>
                  <button
                    onClick={() => setConfirmRemove(false)}
                    disabled={removing}
                    className="h-7 px-3 rounded-md border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmRemove(true)}
                className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-medium text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                Remove from tracker
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
