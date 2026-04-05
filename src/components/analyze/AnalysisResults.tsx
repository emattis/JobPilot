"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  Minus,
  MapPin,
  Building2,
  ExternalLink,
  BookmarkPlus,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  FileText,
  MessageSquare,
} from "lucide-react";
import { ScoreRing, ScoreBar } from "./ScoreRing";
import type { AnalysisResult, ScrapedJob } from "@/types/analysis";

function SkillTag({
  skill,
  variant,
}: {
  skill: string;
  variant: "match" | "missing" | "transfer";
}) {
  const styles = {
    match: "bg-green-500/10 text-green-400 border-green-500/20",
    missing: "bg-red-500/10 text-red-400 border-red-500/20",
    transfer: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  };
  const icons = {
    match: <CheckCircle2 className="w-3 h-3" />,
    missing: <XCircle className="w-3 h-3" />,
    transfer: <Minus className="w-3 h-3" />,
  };

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md border ${styles[variant]}`}
    >
      {icons[variant]}
      {skill}
    </span>
  );
}

function Section({
  title,
  icon: Icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/3 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold">{title}</span>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>
      {open && <div className="px-5 pb-5 border-t border-border">{children}</div>}
    </div>
  );
}

interface AnalysisResultsProps {
  result: AnalysisResult;
  job: ScrapedJob;
  jobId: string;
  jobUrl?: string;
}

export function AnalysisResults({ result, job, jobId, jobUrl }: AnalysisResultsProps) {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const verdictColor =
    result.overallFitScore >= 80
      ? "text-green-400"
      : result.overallFitScore >= 60
      ? "text-amber-400"
      : "text-red-400";

  const verdictBg =
    result.overallFitScore >= 80
      ? "border-green-500/20 bg-green-500/5"
      : result.overallFitScore >= 60
      ? "border-amber-500/20 bg-amber-500/5"
      : "border-red-500/20 bg-red-500/5";

  async function saveToTracker() {
    setSaving(true);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "Failed");
      setSaved(true);
      toast.success(
        data.duplicate ? "Already in your tracker" : "Saved to tracker!"
      );
    } catch {
      toast.error("Failed to save to tracker");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Job header */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold leading-tight truncate">{job.title}</h2>
            <div className="flex flex-wrap items-center gap-3 mt-1.5 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" />
                {job.company}
              </span>
              {job.location && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  {job.location}
                  {job.remote && " · Remote"}
                </span>
              )}
              {(job.salaryMin || job.salaryMax) && (
                <span className="font-mono text-xs">
                  {job.salaryMin && `$${Math.round(job.salaryMin / 1000)}k`}
                  {job.salaryMin && job.salaryMax && " – "}
                  {job.salaryMax && `$${Math.round(job.salaryMax / 1000)}k`}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {jobUrl && (
              <a
                href={jobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                title="Open job posting"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            <button
              onClick={saveToTracker}
              disabled={saving || saved}
              className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-colors ${
                saved
                  ? "bg-green-500/10 text-green-400 border border-green-500/20"
                  : "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              }`}
            >
              {saved ? (
                <>
                  <CheckCheck className="w-3.5 h-3.5" />
                  Saved
                </>
              ) : (
                <>
                  <BookmarkPlus className="w-3.5 h-3.5" />
                  {saving ? "Saving…" : "Save to Tracker"}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Scores + verdict */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          {/* Overall ring */}
          <div className="flex flex-col items-center gap-3">
            <ScoreRing score={result.overallFitScore} label="Overall Fit" size={100} strokeWidth={8} />
            <div
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold ${verdictBg} ${verdictColor}`}
            >
              {result.shouldApply ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : (
                <XCircle className="w-3.5 h-3.5" />
              )}
              {result.shouldApply ? "Apply" : "Skip"}
              <span className="opacity-60">·</span>
              <span className="font-normal opacity-80">{result.confidenceLevel} confidence</span>
            </div>
          </div>

          {/* Score bars */}
          <div className="flex-1 space-y-3 pt-1">
            <ScoreBar score={result.skillMatchScore} label="Skill match" />
            <ScoreBar score={result.experienceMatchScore} label="Experience match" />
            <ScoreBar score={result.cultureFitScore} label="Culture fit" />
            <ScoreBar score={result.growthPotentialScore} label="Growth potential" />
          </div>
        </div>

        {/* Reasoning */}
        <div className={`mt-5 pt-4 border-t border-border`}>
          <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
            {result.reasoning}
          </p>
        </div>
      </div>

      {/* Skills */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-4">Skills breakdown</h3>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {/* Matching */}
          <div>
            <p className="text-xs font-medium text-green-400 mb-2 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Matching ({result.matchingSkills.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {result.matchingSkills.length > 0 ? (
                result.matchingSkills.map((s) => (
                  <SkillTag key={s} skill={s} variant="match" />
                ))
              ) : (
                <p className="text-xs text-muted-foreground">None detected</p>
              )}
            </div>
          </div>
          {/* Missing */}
          <div>
            <p className="text-xs font-medium text-red-400 mb-2 flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5" />
              Missing ({result.missingSkills.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {result.missingSkills.length > 0 ? (
                result.missingSkills.map((s) => (
                  <SkillTag key={s} skill={s} variant="missing" />
                ))
              ) : (
                <p className="text-xs text-muted-foreground">None identified</p>
              )}
            </div>
          </div>
          {/* Transferable */}
          <div>
            <p className="text-xs font-medium text-blue-400 mb-2 flex items-center gap-1.5">
              <Minus className="w-3.5 h-3.5" />
              Transferable ({result.transferableSkills.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {result.transferableSkills.length > 0 ? (
                result.transferableSkills.map((s) => (
                  <SkillTag key={s} skill={s} variant="transfer" />
                ))
              ) : (
                <p className="text-xs text-muted-foreground">None identified</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Resume improvements */}
      <Section title="Resume improvements" icon={FileText}>
        <div className="pt-4 prose prose-sm prose-invert max-w-none [&_ul]:space-y-1.5 [&_li]:text-muted-foreground [&_strong]:text-foreground [&_p]:text-muted-foreground">
          <ReactMarkdown>{result.resumeImprovements}</ReactMarkdown>
        </div>
      </Section>

      {/* Cover letter + Interview prep */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Section title="Cover letter tips" icon={MessageSquare} defaultOpen={false}>
          <p className="pt-4 text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
            {result.coverLetterTips}
          </p>
        </Section>

        <Section title="Interview prep" icon={Lightbulb} defaultOpen={false}>
          <ul className="pt-4 space-y-2">
            {result.interviewPrepTopics.map((topic, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="text-primary font-mono text-xs shrink-0 mt-0.5">{String(i + 1).padStart(2, "0")}</span>
                {topic}
              </li>
            ))}
          </ul>
        </Section>
      </div>

      {/* Company analysis */}
      {result.companyAnalysis && (
        <Section title="Company analysis" icon={Building2} defaultOpen={false}>
          <p className="pt-4 text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
            {result.companyAnalysis}
          </p>
        </Section>
      )}
    </div>
  );
}
