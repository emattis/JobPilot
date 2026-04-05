"use client";

import { differenceInDays, parseISO } from "date-fns";
import { ExternalLink, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { TrackerApplication } from "@/types/tracker";
import { COLUMN_BY_STATUS } from "./constants";

function fitScoreColor(score: number | undefined) {
  if (score === undefined) return "text-slate-400 bg-slate-500/10";
  if (score >= 80) return "text-emerald-400 bg-emerald-500/10";
  if (score >= 60) return "text-yellow-400 bg-yellow-500/10";
  return "text-red-400 bg-red-500/10";
}

function daysInStage(app: TrackerApplication): number {
  const lastChange = app.statusHistory.at(-1);
  const since = lastChange ? parseISO(lastChange.changedAt) : parseISO(app.createdAt);
  return differenceInDays(new Date(), since);
}

interface ApplicationCardProps {
  app: TrackerApplication;
  onClick: () => void;
  /** When used inside the kanban, dragging handle attrs are spread here */
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  isDragging?: boolean;
}

export function ApplicationCard({ app, onClick, dragHandleProps, isDragging }: ApplicationCardProps) {
  const col = COLUMN_BY_STATUS[app.status];
  const fitScore = app.job.analyses[0]?.overallFitScore;
  const days = daysInStage(app);

  return (
    <div
      {...dragHandleProps}
      onClick={onClick}
      className={`
        group relative bg-card border rounded-lg p-3 cursor-pointer select-none
        hover:border-border/80 hover:bg-accent/30 transition-all
        ${isDragging ? "opacity-50 ring-2 ring-primary/40 shadow-xl" : "shadow-sm"}
      `}
    >
      {/* Company + role */}
      <p className="text-[11px] font-medium text-muted-foreground truncate">{app.job.company}</p>
      <p className="text-sm font-semibold leading-tight truncate mt-0.5">{app.job.title}</p>

      {/* Location */}
      {app.job.location && (
        <p className="text-[11px] text-muted-foreground/70 truncate mt-0.5">{app.job.location}</p>
      )}

      {/* Footer row */}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {/* Fit score */}
        {fitScore !== undefined && (
          <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${fitScoreColor(fitScore)}`}>
            {fitScore}%
          </span>
        )}

        {/* Days in stage */}
        <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
          <Calendar className="w-3 h-3" />
          {days}d
        </span>

        {/* Follow-up indicator */}
        {app.followUpDate && new Date(app.followUpDate) <= new Date() && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-yellow-500/40 text-yellow-400">
            Follow up
          </Badge>
        )}

        {/* Status badge (table view only, hidden in kanban) */}
        <span
          className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-medium ${col.color} ${col.bg} hidden data-[show]:block`}
          data-status-badge
        >
          {col.label}
        </span>

        {/* External link */}
        <a
          href={app.job.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="ml-auto text-muted-foreground/40 hover:text-muted-foreground transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}
