"use client";

import { useState, useEffect, useCallback } from "react";
import { Compass, RefreshCw, Loader2, AlertCircle, Zap } from "lucide-react";
import { JobCard } from "@/components/discover/JobCard";
import type { DiscoveredJobRecord } from "@/components/discover/JobCard";

type ScanPhase =
  | { type: "idle" }
  | { type: "scanning"; message: string }
  | { type: "done"; newJobs: number }
  | { type: "error"; error: string };

const SOURCE_OPTIONS = [
  { value: "all", label: "All sources" },
  { value: "yc", label: "YC" },
  { value: "greenhouse", label: "Greenhouse" },
  { value: "lever", label: "Lever" },
];

export default function DiscoverPage() {
  const [jobs, setJobs] = useState<DiscoveredJobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [scan, setScan] = useState<ScanPhase>({ type: "idle" });
  const [sourceFilter, setSourceFilter] = useState("all");
  const [minScore, setMinScore] = useState(0);

  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/discover");
      const data = await res.json();
      if (data.success) setJobs(data.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  async function runScan() {
    setScan({ type: "scanning", message: "Starting scan…" });

    try {
      const res = await fetch("/api/discover", { method: "POST" });
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
            setScan({ type: "scanning", message: event.message });
          } else if (event.type === "complete") {
            setJobs(event.jobs ?? []);
            setScan({ type: "done", newJobs: event.newJobs ?? 0 });
          } else if (event.type === "error") {
            setScan({ type: "error", error: event.error });
          }
        }
      }
    } catch (err) {
      setScan({
        type: "error",
        error: err instanceof Error ? err.message : "Scan failed",
      });
    }
  }

  function handleDismiss(id: string) {
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }

  const filteredJobs = jobs.filter((j) => {
    if (sourceFilter !== "all" && j.source !== sourceFilter) return false;
    if (minScore > 0 && (j.relevanceScore ?? 0) < minScore) return false;
    return true;
  });

  const isScanning = scan.type === "scanning";
  const avgScore =
    jobs.length > 0
      ? Math.round(
          jobs.reduce((s, j) => s + (j.relevanceScore ?? 0), 0) / jobs.length
        )
      : null;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Compass className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Discover Jobs</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              AI-curated feed from YC, Greenhouse, and Lever boards
            </p>
          </div>
        </div>

        <button
          onClick={runScan}
          disabled={isScanning}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none transition-colors shrink-0"
        >
          {isScanning ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          {isScanning ? "Scanning…" : "Scan for jobs"}
        </button>
      </div>

      {/* Scan status */}
      {scan.type === "scanning" && (
        <div className="rounded-xl border border-border bg-card p-4 mb-6 flex items-center gap-3">
          <div className="relative w-8 h-8 shrink-0">
            <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 rounded-full border-2 border-t-primary animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-primary" />
            </div>
          </div>
          <div>
            <p className="text-sm font-medium">{scan.message}</p>
            <p className="text-xs text-muted-foreground">
              This may take up to a minute…
            </p>
          </div>
        </div>
      )}

      {scan.type === "done" && (
        <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 mb-6">
          <p className="text-sm font-medium text-green-400">
            Scan complete — {scan.newJobs} new job{scan.newJobs !== 1 ? "s" : ""} found
          </p>
        </div>
      )}

      {scan.type === "error" && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 mb-6 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">{scan.error}</p>
        </div>
      )}

      {/* Stats row */}
      {jobs.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Total jobs</p>
            <p className="text-xl font-bold font-mono mt-0.5">{jobs.length}</p>
          </div>
          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Avg relevance</p>
            <p className="text-xl font-bold font-mono mt-0.5">
              {avgScore ?? "—"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Strong matches</p>
            <p className="text-xl font-bold font-mono mt-0.5 text-green-400">
              {jobs.filter((j) => (j.relevanceScore ?? 0) >= 70).length}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      {jobs.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex items-center gap-1.5">
            {SOURCE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSourceFilter(opt.value)}
                className={`h-7 px-3 rounded-md text-xs font-medium border transition-colors ${
                  sourceFilter === opt.value
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:bg-white/5"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <label className="text-xs text-muted-foreground">Min score:</label>
            <select
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="h-7 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value={0}>Any</option>
              <option value={40}>40+</option>
              <option value={60}>60+</option>
              <option value={70}>70+</option>
              <option value={80}>80+</option>
            </select>
          </div>
        </div>
      )}

      {/* Feed */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-border bg-card p-5 animate-pulse h-28"
            />
          ))}
        </div>
      ) : filteredJobs.length > 0 ? (
        <div className="space-y-3">
          {filteredJobs.map((job) => (
            <JobCard key={job.id} job={job} onDismiss={handleDismiss} />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Compass className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-medium">No jobs discovered yet</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            Run a scan to find jobs matched to your profile and target companies
          </p>
          <button
            onClick={runScan}
            disabled={isScanning}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Zap className="w-4 h-4" />
            Run first scan
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No jobs match the current filters
          </p>
        </div>
      )}
    </div>
  );
}
