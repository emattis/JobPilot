"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Zap,
  Loader2,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Minus,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { AnalysisResult } from "@/types/analysis";

// ── Score helpers ────────────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-yellow-400";
  return "text-red-400";
}

function scoreBg(score: number) {
  if (score >= 80) return "bg-emerald-500/10 border-emerald-500/20";
  if (score >= 60) return "bg-yellow-500/10 border-yellow-500/20";
  return "bg-red-500/10 border-red-500/20";
}

// ── Manual paste modal ───────────────────────────────────────────────────────

function ManualPasteModal({
  jobTitle,
  jobCompany,
  onSubmit,
  onClose,
}: {
  jobTitle: string;
  jobCompany: string;
  onSubmit: (desc: string) => void;
  onClose: () => void;
}) {
  const [desc, setDesc] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-xl shadow-xl w-full max-w-lg mx-4 p-5">
        <h3 className="text-sm font-semibold mb-1">Paste Job Description</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Could not scrape the job URL. Paste the description for{" "}
          <span className="font-medium text-foreground">{jobTitle}</span> at {jobCompany}.
        </p>
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Paste the full job description here..."
          rows={10}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
        />
        <div className="flex justify-end gap-2 mt-3">
          <button
            onClick={onClose}
            className="h-8 px-4 rounded-md border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => desc.trim().length >= 50 && onSubmit(desc.trim())}
            disabled={desc.trim().length < 50}
            className="h-8 px-4 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            <Zap className="w-3 h-3" />
            Analyze
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Inline results ───────────────────────────────────────────────────────────

function InlineResults({ result }: { result: AnalysisResult }) {
  return (
    <div className="space-y-3">
      {/* Score grid */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Overall Fit", score: result.overallFitScore },
          { label: "Skills", score: result.skillMatchScore },
          { label: "Experience", score: result.experienceMatchScore },
          { label: "Culture", score: result.cultureFitScore },
        ].map((s) => (
          <div
            key={s.label}
            className={`rounded-lg border px-3 py-2 ${scoreBg(s.score)}`}
          >
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
            <p className={`text-lg font-bold ${scoreColor(s.score)}`}>
              {s.score}%
            </p>
          </div>
        ))}
      </div>

      {/* Verdict */}
      <div className={`rounded-lg border px-3 py-2 ${result.shouldApply ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5"}`}>
        <p className={`text-xs font-medium ${result.shouldApply ? "text-emerald-400" : "text-red-400"}`}>
          {result.shouldApply ? "Recommended to apply" : "May not be the best fit"}
        </p>
      </div>

      {/* Skills */}
      <div>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
          Skills
        </p>
        <div className="flex flex-wrap gap-1">
          {result.matchingSkills.slice(0, 6).map((s) => (
            <span key={s} className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border bg-green-500/10 text-green-400 border-green-500/20">
              <CheckCircle2 className="w-2.5 h-2.5" /> {s}
            </span>
          ))}
          {result.missingSkills.slice(0, 4).map((s) => (
            <span key={s} className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border bg-red-500/10 text-red-400 border-red-500/20">
              <XCircle className="w-2.5 h-2.5" /> {s}
            </span>
          ))}
          {result.transferableSkills.slice(0, 3).map((s) => (
            <span key={s} className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border bg-blue-500/10 text-blue-400 border-blue-500/20">
              <Minus className="w-2.5 h-2.5" /> {s}
            </span>
          ))}
        </div>
      </div>

      {/* Reasoning */}
      <div>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
          Analysis
        </p>
        <div className="text-xs text-foreground/80 leading-relaxed prose prose-invert prose-xs max-w-none">
          <ReactMarkdown>{result.reasoning}</ReactMarkdown>
        </div>
      </div>

      {/* Resume improvements */}
      {result.resumeImprovements && (
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
            Resume Tips
          </p>
          <div className="text-xs text-foreground/80 leading-relaxed prose prose-invert prose-xs max-w-none">
            <ReactMarkdown>{result.resumeImprovements}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main section ─────────────────────────────────────────────────────────────

interface AnalyzeSectionProps {
  jobUrl: string;
  jobTitle: string;
  jobCompany: string;
  hasAnalysis: boolean;
  onAnalysisComplete: () => void;
}

type Phase =
  | { type: "idle" }
  | { type: "loading"; message: string }
  | { type: "complete"; result: AnalysisResult; aiExtracted: boolean }
  | { type: "error"; error: string; allowManual: boolean };

export function AnalyzeSection({
  jobUrl,
  jobTitle,
  jobCompany,
  hasAnalysis,
  onAnalysisComplete,
}: AnalyzeSectionProps) {
  const [phase, setPhase] = useState<Phase>({ type: "idle" });
  const [showManual, setShowManual] = useState(false);

  async function runAnalysis(body: Record<string, unknown>) {
    setPhase({ type: "loading", message: "Starting analysis..." });
    setShowManual(false);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          let event;
          try {
            event = JSON.parse(line.slice(6));
          } catch {
            continue;
          }

          if (event.type === "status") {
            setPhase({ type: "loading", message: event.message });
          } else if (event.type === "complete") {
            setPhase({ type: "complete", result: event.result, aiExtracted: event.job?.aiExtracted ?? false });
            onAnalysisComplete();
            toast.success("Analysis complete");
          } else if (event.type === "error") {
            setPhase({
              type: "error",
              error: event.error,
              allowManual: event.allowManual ?? false,
            });
          }
        }
      }
    } catch (err) {
      setPhase({
        type: "error",
        error: err instanceof Error ? err.message : "Analysis failed",
        allowManual: true,
      });
    }
  }

  function handleAnalyzeUrl() {
    if (!jobUrl || jobUrl.startsWith("manual://")) {
      setShowManual(true);
      return;
    }
    runAnalysis({ jobUrl });
  }

  function handleManualSubmit(description: string) {
    runAnalysis({
      manual: { title: jobTitle, company: jobCompany, description },
    });
  }

  // If analysis already exists and we haven't run a new one, don't show anything
  if (hasAnalysis && phase.type === "idle") return null;

  return (
    <div>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <Zap className="w-3.5 h-3.5" />
        AI Analysis
      </h3>

      {/* Idle — show analyze button */}
      {phase.type === "idle" && !hasAnalysis && (
        <button
          onClick={handleAnalyzeUrl}
          className="w-full flex items-center justify-center gap-2 h-10 rounded-lg bg-primary/10 border border-primary/20 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
        >
          <Zap className="w-4 h-4" />
          Analyze this job
        </button>
      )}

      {/* Loading */}
      {phase.type === "loading" && (
        <div className="flex items-center gap-3 py-4">
          <div className="relative w-8 h-8 shrink-0">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 rounded-full border-2 border-t-primary animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-primary" />
            </div>
          </div>
          <div>
            <p className="text-xs font-medium">{phase.message}</p>
            <p className="text-[10px] text-muted-foreground">This takes ~15 seconds</p>
          </div>
        </div>
      )}

      {/* Error */}
      {phase.type === "error" && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-muted-foreground">{phase.error}</p>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleAnalyzeUrl}
                  className="flex items-center gap-1 h-6 px-2.5 rounded text-[10px] font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <RefreshCw className="w-2.5 h-2.5" />
                  Retry
                </button>
                {phase.allowManual && (
                  <button
                    onClick={() => setShowManual(true)}
                    className="flex items-center gap-1 h-6 px-2.5 rounded text-[10px] font-medium bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-colors"
                  >
                    Paste manually
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Complete — inline results */}
      {phase.type === "complete" && (
        <>
          {phase.aiExtracted && (
            <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-1.5 mb-3 flex items-center gap-1.5">
              <span className="text-[10px] font-medium text-amber-400">AI-extracted</span>
              <span className="text-[10px] text-muted-foreground">— Job data was parsed by AI. Verify details are correct.</span>
            </div>
          )}
          <InlineResults result={phase.result} />
        </>
      )}

      {/* Manual paste modal */}
      {showManual && (
        <ManualPasteModal
          jobTitle={jobTitle}
          jobCompany={jobCompany}
          onSubmit={handleManualSubmit}
          onClose={() => setShowManual(false)}
        />
      )}
    </div>
  );
}
