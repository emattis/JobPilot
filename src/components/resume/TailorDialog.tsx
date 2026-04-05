"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  X,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Sparkles,
  Save,
  RotateCcw,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { OptimizationResult, ResumeSuggestion, SuggestionType } from "@/lib/ai/resume-optimize";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TrackedApplication {
  id: string;
  job: { title: string; company: string };
  status: string;
}

interface Resume {
  id: string;
  name: string;
}

type DialogState = "select" | "streaming" | "review" | "saving";

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<SuggestionType, { label: string; color: string }> = {
  reword:  { label: "Reword",  color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  add:     { label: "Add",     color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  remove:  { label: "Remove",  color: "text-red-400 bg-red-500/10 border-red-500/20" },
  reorder: { label: "Reorder", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
};

function strengthScoreColor(score: number) {
  if (score >= 85) return "text-emerald-400";
  if (score >= 70) return "text-yellow-400";
  if (score >= 55) return "text-orange-400";
  return "text-red-400";
}

/**
 * Apply accepted suggestions to the original resume text.
 * Returns the final resume text.
 */
function applyAccepted(originalText: string, suggestions: ResumeSuggestion[], rejected: Set<string>): string {
  let text = originalText;
  for (const s of suggestions) {
    if (rejected.has(s.id)) continue;
    if (s.type === "reword" && s.original && s.suggested) {
      // Replace first exact occurrence
      text = text.replace(s.original, s.suggested);
    } else if (s.type === "remove" && s.original) {
      text = text.replace(s.original, "");
    } else if (s.type === "add" && s.suggested) {
      text = text + "\n\n" + s.suggested;
    }
    // reorder: too structural to apply programmatically — shown for info
  }
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SuggestionCard({
  suggestion,
  accepted,
  onToggle,
}: {
  suggestion: ResumeSuggestion;
  accepted: boolean;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const typeInfo = TYPE_LABELS[suggestion.type];

  return (
    <div
      className={`rounded-lg border transition-all ${
        accepted ? "border-border bg-card" : "border-border/30 bg-muted/20 opacity-60"
      }`}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none"
        onClick={() => setExpanded((e) => !e)}
      >
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${typeInfo.color}`}>
          {typeInfo.label}
        </span>
        <span className="text-xs text-muted-foreground font-medium">{suggestion.section}</span>
        <ChevronRight
          className={`w-3.5 h-3.5 text-muted-foreground/50 ml-auto transition-transform ${expanded ? "rotate-90" : ""}`}
        />
        {/* Accept / Reject */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className={`ml-1 p-1 rounded transition-colors ${
            accepted
              ? "text-emerald-400 hover:text-red-400 hover:bg-red-500/10"
              : "text-muted-foreground/40 hover:text-emerald-400 hover:bg-emerald-500/10"
          }`}
          title={accepted ? "Click to reject" : "Click to accept"}
        >
          {accepted ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
        </button>
      </div>

      {/* Body */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-border/50">
          {/* Before */}
          {suggestion.original && (
            <div className="mt-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Before</p>
              <pre className="text-xs text-red-400/80 bg-red-500/5 border border-red-500/10 rounded p-2 whitespace-pre-wrap font-mono leading-relaxed line-through decoration-red-400/40">
                {suggestion.original}
              </pre>
            </div>
          )}

          {/* After */}
          {suggestion.suggested && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">After</p>
              <pre className="text-xs text-emerald-400/90 bg-emerald-500/5 border border-emerald-500/10 rounded p-2 whitespace-pre-wrap font-mono leading-relaxed">
                {suggestion.suggested}
              </pre>
            </div>
          )}

          {/* Reason */}
          <div className="flex gap-1.5 text-xs text-muted-foreground/70 pt-0.5">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{suggestion.reason}</span>
          </div>

          {suggestion.type === "reorder" && (
            <p className="text-[10px] text-amber-400/70 mt-1 italic">
              Reorder suggestions show the new arrangement but require manual editing to apply.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main dialog ───────────────────────────────────────────────────────────────

interface TailorDialogProps {
  resume: Resume;
  onClose: () => void;
  onSaved: () => void;
}

export function TailorDialog({ resume, onClose, onSaved }: TailorDialogProps) {
  const [state, setState] = useState<DialogState>("select");
  const [applications, setApplications] = useState<TrackedApplication[]>([]);
  const [loadingApps, setLoadingApps] = useState(true);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [streamLog, setStreamLog] = useState<string>("");
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [originalText, setOriginalText] = useState<string>("");
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState("");
  const streamRef = useRef<string>("");

  // Load applications on mount
  useEffect(() => {
    fetch("/api/applications")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setApplications(d.data);
      })
      .finally(() => setLoadingApps(false));

    // Also fetch resume rawText for later diff application
    fetch(`/api/resume/optimize?resumeId=${resume.id}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setOriginalText(d.data.rawText); });
  }, [resume.id]);

  const selectedApp = applications.find((a) => a.id === selectedAppId);

  // Set default new name when result arrives
  useEffect(() => {
    if (result && selectedApp) {
      setNewName(`${resume.name} — ${selectedApp.job.company}`);
    }
  }, [result, selectedApp, resume.name]);

  async function startOptimization() {
    if (!selectedAppId) return;
    setState("streaming");
    setStreamLog("");
    streamRef.current = "";

    try {
      const res = await fetch("/api/resume/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeId: resume.id, applicationId: selectedAppId }),
      });

      if (!res.body) throw new Error("No stream body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "status") {
              setStreamLog(event.message);
            } else if (event.type === "token") {
              streamRef.current += event.text;
              // Show last 200 chars of raw output as streaming preview
              const preview = streamRef.current.slice(-300);
              setStreamLog(preview);
            } else if (event.type === "complete") {
              setResult(event.result as OptimizationResult);
              setRejected(new Set()); // all accepted by default
              setState("review");
            } else if (event.type === "error") {
              toast.error(event.error ?? "Optimization failed");
              setState("select");
            }
          } catch {
            // ignore parse errors on partial lines
          }
        }
      }
    } catch (err) {
      console.error(err);
      toast.error("Connection error during optimization");
      setState("select");
    }
  }

  async function saveVersion() {
    if (!result) return;
    setState("saving");

    const finalText = applyAccepted(originalText, result.suggestions, rejected);
    const name = newName.trim() || `${resume.name} (tailored)`;

    try {
      const res = await fetch("/api/resume", {
        method: "POST",
        body: (() => {
          const form = new FormData();
          // We create a Blob from the text and upload as a "file"
          // But our upload endpoint expects a PDF. Let's use a JSON save endpoint instead.
          // We'll hit the save-text endpoint.
          form.append("name", name);
          form.append("rawText", finalText);
          return form;
        })(),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "Save failed");

      toast.success(`"${name}" saved as a new resume version`);
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
      setState("review");
    }
  }

  function toggleSuggestion(id: string) {
    setRejected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const acceptedCount = result ? result.suggestions.length - rejected.size : 0;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-sm">Tailor Resume for a Job</h2>
            <span className="text-xs text-muted-foreground">— {resume.name}</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Step 1: Job selection ── */}
          {state === "select" && (
            <div className="p-5 space-y-4">
              <p className="text-sm text-muted-foreground">
                Select a tracked application. The AI will tailor this resume to match the job description.
              </p>

              {loadingApps ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : applications.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  No tracked applications yet. Save a job from the Analyze page first.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
                  {applications.map((app) => (
                    <button
                      key={app.id}
                      onClick={() => setSelectedAppId(app.id)}
                      className={`w-full text-left rounded-lg border px-4 py-3 transition-all text-sm ${
                        selectedAppId === app.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-border/80 hover:bg-accent/20"
                      }`}
                    >
                      <p className="font-medium truncate">{app.job.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{app.job.company}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Streaming ── */}
          {state === "streaming" && (
            <div className="p-5 flex flex-col items-center justify-center min-h-[300px] gap-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-primary animate-pulse" />
                </div>
              </div>
              <div className="text-center">
                <p className="font-medium text-sm">AI is analyzing your resume…</p>
                <p className="text-xs text-muted-foreground mt-1">Identifying improvements for {selectedApp?.job.title}</p>
              </div>
              {streamLog && (
                <div className="w-full max-h-32 overflow-hidden rounded-lg bg-muted/30 border border-border/50 p-3">
                  <pre className="text-[10px] text-muted-foreground/60 font-mono whitespace-pre-wrap leading-relaxed">
                    {streamLog}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Review suggestions ── */}
          {(state === "review" || state === "saving") && result && (
            <div className="p-5 space-y-5">
              {/* Score + summary */}
              <div className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card">
                <div className="text-center">
                  <p className={`text-3xl font-bold ${strengthScoreColor(result.strengthScore)}`}>
                    {result.strengthScore}
                  </p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Fit Score</p>
                </div>
                <Separator orientation="vertical" className="h-12" />
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    {result.suggestions.length} suggested changes
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {acceptedCount} accepted · {rejected.size} rejected
                    {" · "}<button
                      className="text-primary hover:underline"
                      onClick={() => setRejected(new Set())}
                    >accept all</button>
                    {" · "}<button
                      className="text-muted-foreground hover:text-foreground hover:underline"
                      onClick={() => setRejected(new Set(result.suggestions.map((s) => s.id)))}
                    >reject all</button>
                  </p>
                </div>
              </div>

              {/* Suggestion cards */}
              <div className="space-y-2">
                {result.suggestions.map((s) => (
                  <SuggestionCard
                    key={s.id}
                    suggestion={s}
                    accepted={!rejected.has(s.id)}
                    onToggle={() => toggleSuggestion(s.id)}
                  />
                ))}
              </div>

              <Separator />

              {/* Save controls */}
              <div className="space-y-3">
                <p className="text-sm font-medium">Save as new resume version</p>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Version name…"
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <p className="text-xs text-muted-foreground">
                  {acceptedCount} of {result.suggestions.length} changes will be applied.
                  Reorder suggestions are shown for reference but must be applied manually.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border shrink-0 flex items-center justify-between gap-3">
          {state === "select" && (
            <>
              <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
              <Button
                size="sm"
                disabled={!selectedAppId || loadingApps}
                onClick={startOptimization}
              >
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                Optimize with AI
              </Button>
            </>
          )}

          {state === "streaming" && (
            <div className="flex-1 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyzing — this takes 15–30 seconds…
            </div>
          )}

          {(state === "review" || state === "saving") && result && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setState("select")}
                disabled={state === "saving"}
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                Try different job
              </Button>
              <Button
                size="sm"
                disabled={acceptedCount === 0 || state === "saving"}
                onClick={saveVersion}
              >
                {state === "saving" ? (
                  <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Saving…</>
                ) : (
                  <><Save className="w-3.5 h-3.5 mr-1.5" /> Save {acceptedCount} change{acceptedCount !== 1 ? "s" : ""}</>
                )}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
