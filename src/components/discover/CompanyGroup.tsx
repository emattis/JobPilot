"use client";

import { useState } from "react";
import { Building2, ChevronDown, ChevronUp } from "lucide-react";
import { JobCard } from "./JobCard";
import type { DiscoveredJobRecord } from "./JobCard";

interface Props {
  company: string;
  jobs: DiscoveredJobRecord[];
  onDismiss: (id: string) => void;
  onSave?: (id: string) => void;
}

function scoreBadgeColor(score: number) {
  if (score >= 80) return "bg-green-500/15 text-green-400 border-green-500/20";
  if (score >= 60) return "bg-amber-500/15 text-amber-400 border-amber-500/20";
  if (score >= 40) return "bg-orange-500/15 text-orange-400 border-orange-500/20";
  return "bg-red-500/15 text-red-400 border-red-500/20";
}

export function CompanyGroup({ company, jobs, onDismiss, onSave }: Props) {
  const [open, setOpen] = useState(false);

  // Show best score in header
  const bestScore = Math.max(...jobs.map((j) => j.relevanceScore ?? 0));

  // When all jobs in a group are dismissed, the group disappears naturally
  // since the parent filters by what's visible
  const visibleJobs = jobs; // parent already filtered

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {/* Group header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-card hover:bg-white/[0.03] transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-semibold truncate">{company}</span>
          <span className="inline-flex items-center justify-center text-xs font-medium min-w-[1.25rem] h-5 px-1.5 rounded-full bg-muted text-muted-foreground shrink-0">
            {visibleJobs.length}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {bestScore > 0 && (
            <span
              className={`inline-flex items-center font-mono text-xs font-bold px-2 py-0.5 rounded-md border ${scoreBadgeColor(bestScore)}`}
            >
              {bestScore}
            </span>
          )}
          {open ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Job list */}
      {open && (
        <div className="border-t border-border divide-y divide-border/40">
          {visibleJobs.map((job) => (
            <JobCard key={job.id} job={job} onDismiss={onDismiss} onSave={onSave} nested />
          ))}
        </div>
      )}
    </div>
  );
}
