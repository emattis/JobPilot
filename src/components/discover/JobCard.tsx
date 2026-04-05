"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  MapPin,
  Building2,
  Zap,
  X,
  Wifi,
  ExternalLink,
} from "lucide-react";

export interface DiscoveredJobRecord {
  id: string;
  url: string;
  title: string;
  company: string;
  location: string | null;
  remote: boolean | null;
  source: string;
  relevanceScore: number | null;
  reasoning: string | null;
  dismissed: boolean;
}

interface Props {
  job: DiscoveredJobRecord;
  onDismiss: (id: string) => void;
}

const SOURCE_LABELS: Record<string, string> = {
  yc: "YC",
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  linkedin: "LinkedIn",
  manual: "Manual",
};

const SOURCE_COLORS: Record<string, string> = {
  yc: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  greenhouse: "bg-green-500/10 text-green-400 border-green-500/20",
  lever: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  ashby: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  linkedin: "bg-sky-500/10 text-sky-400 border-sky-500/20",
};

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return null;

  const color =
    score >= 80
      ? "bg-green-500/15 text-green-400 border-green-500/20"
      : score >= 60
      ? "bg-amber-500/15 text-amber-400 border-amber-500/20"
      : score >= 40
      ? "bg-orange-500/15 text-orange-400 border-orange-500/20"
      : "bg-red-500/15 text-red-400 border-red-500/20";

  return (
    <span
      className={`inline-flex items-center font-mono text-xs font-bold px-2 py-0.5 rounded-md border ${color}`}
    >
      {score}
    </span>
  );
}

export function JobCard({ job, onDismiss }: Props) {
  const router = useRouter();
  const [dismissing, setDismissing] = useState(false);

  const sourceLabel = SOURCE_LABELS[job.source] ?? job.source;
  const sourceColor =
    SOURCE_COLORS[job.source] ??
    "bg-muted/50 text-muted-foreground border-border";

  async function handleDismiss() {
    setDismissing(true);
    try {
      const res = await fetch("/api/discover", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: job.id, dismissed: true }),
      });
      if (!res.ok) throw new Error();
      onDismiss(job.id);
    } catch {
      toast.error("Failed to dismiss");
      setDismissing(false);
    }
  }

  function handleAnalyze() {
    router.push(`/analyze?url=${encodeURIComponent(job.url)}`);
  }

  return (
    <div className="group rounded-xl border border-border bg-card p-5 hover:border-border/80 transition-colors">
      <div className="flex items-start gap-3">
        {/* Score */}
        <div className="shrink-0 pt-0.5">
          <ScoreBadge score={job.relevanceScore} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold leading-snug truncate">{job.title}</h3>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Building2 className="w-3 h-3" />
                  {job.company}
                </span>
                {job.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {job.location}
                  </span>
                )}
                {job.remote && (
                  <span className="flex items-center gap-1 text-sky-400">
                    <Wifi className="w-3 h-3" />
                    Remote
                  </span>
                )}
              </div>
            </div>

            {/* Source badge + external link */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-md border ${sourceColor}`}
              >
                {sourceLabel}
              </span>
              <a
                href={job.url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                title="Open posting"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* AI reasoning */}
          {job.reasoning && (
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed line-clamp-2">
              {job.reasoning}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={handleAnalyze}
              className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              <Zap className="w-3 h-3" />
              Analyze
            </button>
            <button
              onClick={handleDismiss}
              disabled={dismissing}
              className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-40"
            >
              <X className="w-3 h-3" />
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
