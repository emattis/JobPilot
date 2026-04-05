"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Zap, Loader2, AlertCircle, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { AnalysisResults } from "@/components/analyze/AnalysisResults";
import type { AnalysisResult, ScrapedJob } from "@/types/analysis";

type Phase =
  | { type: "idle" }
  | { type: "loading"; message: string }
  | {
      type: "complete";
      result: AnalysisResult;
      job: ScrapedJob;
      jobId: string;
      analysisId: string;
      jobUrl: string;
      fromCache: boolean;
    }
  | { type: "error"; error: string; allowManual: boolean };

export default function AnalyzePage() {
  const searchParams = useSearchParams();
  const autoRunRef = useRef(false);
  const [jobUrl, setJobUrl] = useState(() => searchParams.get("url") ?? "");
  const [companyUrl, setCompanyUrl] = useState("");
  const [showCompany, setShowCompany] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manual, setManual] = useState({
    title: "",
    company: "",
    location: "",
    description: "",
  });
  const [phase, setPhase] = useState<Phase>({ type: "idle" });

  // Auto-run analysis if URL was passed as query param (from discover page)
  useEffect(() => {
    const urlParam = searchParams.get("url");
    if (urlParam && !autoRunRef.current) {
      autoRunRef.current = true;
      // Small delay to let state settle
      setTimeout(() => runAnalysis(false), 100);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runAnalysis(useManual = false) {
    const urlToUse = jobUrl.trim();

    if (!useManual && !urlToUse) {
      toast.error("Enter a job posting URL");
      return;
    }
    if (useManual && (!manual.title || !manual.company || manual.description.length < 50)) {
      toast.error("Fill in title, company, and description (50+ chars)");
      return;
    }

    setPhase({ type: "loading", message: "Starting…" });

    try {
      const body = useManual
        ? { manual }
        : { jobUrl: urlToUse, companyUrl: companyUrl.trim() || undefined };

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
            setPhase({
              type: "complete",
              result: event.result,
              job: event.job,
              jobId: event.jobId,
              analysisId: event.analysisId,
              jobUrl: urlToUse,
              fromCache: event.fromCache ?? false,
            });
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
        error: err instanceof Error ? err.message : "Something went wrong",
        allowManual: true,
      });
    }
  }

  function reset() {
    setPhase({ type: "idle" });
    setShowManual(false);
  }

  const isLoading = phase.type === "loading";

  return (
    <div className="p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <Zap className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Analyze a Job</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Paste a job URL and get an AI-powered fit score and resume tips
          </p>
        </div>
      </div>

      {/* Input form — always visible unless loading */}
      {phase.type !== "complete" && (
        <div className="rounded-xl border border-border bg-card p-6 mb-6">
          <div className="space-y-4">
            {/* Job URL */}
            {!showManual && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Job posting URL
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={jobUrl}
                    onChange={(e) => setJobUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && runAnalysis()}
                    placeholder="https://jobs.lever.co/company/job-id"
                    disabled={isLoading}
                    className="flex-1 h-10 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:opacity-50"
                  />
                  <button
                    onClick={() => runAnalysis(false)}
                    disabled={isLoading || !jobUrl.trim()}
                    className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none transition-colors"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Zap className="w-4 h-4" />
                    )}
                    {isLoading ? "Analyzing…" : "Analyze"}
                  </button>
                </div>
              </div>
            )}

            {/* Optional company URL */}
            {!showManual && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowCompany((v) => !v)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  disabled={isLoading}
                >
                  {showCompany ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  {showCompany ? "Hide" : "Add"} company website (optional)
                </button>
                {showCompany && (
                  <div className="mt-2 space-y-1.5">
                    <input
                      type="url"
                      value={companyUrl}
                      onChange={(e) => setCompanyUrl(e.target.value)}
                      placeholder="https://stripe.com/about"
                      disabled={isLoading}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:opacity-50"
                    />
                    <p className="text-xs text-muted-foreground">
                      Gives Claude context on culture, mission, and company stage
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Divider */}
            {!showManual && (
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="flex-1 h-px bg-border" />
              </div>
            )}

            {/* Manual paste toggle */}
            <button
              type="button"
              onClick={() => setShowManual((v) => !v)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
              disabled={isLoading}
            >
              {showManual ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {showManual ? "Use URL instead" : "Paste job description manually"}
            </button>

            {/* Manual form */}
            {showManual && (
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Job title *
                    </label>
                    <input
                      value={manual.title}
                      onChange={(e) => setManual((m) => ({ ...m, title: e.target.value }))}
                      placeholder="Senior Software Engineer"
                      disabled={isLoading}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:opacity-50"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Company *
                    </label>
                    <input
                      value={manual.company}
                      onChange={(e) => setManual((m) => ({ ...m, company: e.target.value }))}
                      placeholder="Stripe"
                      disabled={isLoading}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:opacity-50"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Location (optional)
                  </label>
                  <input
                    value={manual.location}
                    onChange={(e) => setManual((m) => ({ ...m, location: e.target.value }))}
                    placeholder="San Francisco, CA · Remote"
                    disabled={isLoading}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:opacity-50"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Job description *
                  </label>
                  <textarea
                    value={manual.description}
                    onChange={(e) => setManual((m) => ({ ...m, description: e.target.value }))}
                    placeholder="Paste the full job description here…"
                    rows={8}
                    disabled={isLoading}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:opacity-50 resize-none"
                  />
                </div>
                <button
                  onClick={() => runAnalysis(true)}
                  disabled={
                    isLoading ||
                    !manual.title ||
                    !manual.company ||
                    manual.description.length < 50
                  }
                  className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none transition-colors"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4" />
                  )}
                  {isLoading ? "Analyzing…" : "Analyze"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Loading state */}
      {phase.type === "loading" && (
        <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center text-center gap-4">
          <div className="relative w-14 h-14">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 rounded-full border-2 border-t-primary animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary" />
            </div>
          </div>
          <div>
            <p className="text-sm font-medium">{phase.message}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Powered by Claude — analysis takes ~15 seconds
            </p>
          </div>
          <div className="flex gap-1.5 mt-1">
            {["Scraping", "AI Analysis", "Done"].map((step, i) => (
              <div
                key={step}
                className={`h-1 w-12 rounded-full transition-colors ${
                  i === 0 && phase.message.toLowerCase().includes("scrap")
                    ? "bg-primary"
                    : i === 1 && (phase.message.toLowerCase().includes("ai") || phase.message.toLowerCase().includes("analyz"))
                    ? "bg-primary"
                    : "bg-border"
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Error state */}
      {phase.type === "error" && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-destructive">Analysis failed</p>
              <p className="text-xs text-muted-foreground mt-1">{phase.error}</p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={reset}
                  className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Try again
                </button>
                {phase.allowManual && (
                  <button
                    onClick={() => {
                      setPhase({ type: "idle" });
                      setShowManual(true);
                    }}
                    className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md bg-primary/10 border border-primary/20 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                  >
                    Paste manually instead
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {phase.type === "complete" && (
        <div className="space-y-4">
          {/* New analysis button */}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground">Analysis results</h2>
            <button
              onClick={reset}
              className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              New analysis
            </button>
          </div>
          <AnalysisResults
            result={phase.result}
            job={phase.job}
            jobId={phase.jobId}
            jobUrl={phase.jobUrl}
            fromCache={phase.fromCache}
          />
        </div>
      )}
    </div>
  );
}
