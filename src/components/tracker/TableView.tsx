"use client";

import { useState, useMemo } from "react";
import { differenceInDays, parseISO, format } from "date-fns";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import type { TrackerApplication, AppStatus } from "@/types/tracker";
import { COLUMN_BY_STATUS } from "./constants";

type SortKey = "company" | "role" | "status" | "appliedAt" | "daysInStage" | "fitScore";
type SortDir = "asc" | "desc";

function daysInStage(app: TrackerApplication): number {
  const lastChange = app.statusHistory.at(-1);
  const since = lastChange ? parseISO(lastChange.changedAt) : parseISO(app.createdAt);
  return differenceInDays(new Date(), since);
}

function fitScore(app: TrackerApplication): number | null {
  return app.job.analyses[0]?.overallFitScore ?? null;
}

function SortIcon({ col, sort }: { col: SortKey; sort: { key: SortKey; dir: SortDir } | null }) {
  if (!sort || sort.key !== col) return <ChevronsUpDown className="w-3 h-3 text-muted-foreground/40" />;
  return sort.dir === "asc"
    ? <ChevronUp className="w-3 h-3 text-primary" />
    : <ChevronDown className="w-3 h-3 text-primary" />;
}

function fitScoreClass(score: number) {
  if (score >= 80) return "text-emerald-400 bg-emerald-500/10";
  if (score >= 60) return "text-yellow-400 bg-yellow-500/10";
  return "text-red-400 bg-red-500/10";
}

interface TableViewProps {
  applications: TrackerApplication[];
  onSelect: (app: TrackerApplication) => void;
}

export function TableView({ applications, onSelect }: TableViewProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>({
    key: "appliedAt",
    dir: "desc",
  });

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev?.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    );
  }

  const sorted = useMemo(() => {
    const arr = [...applications];
    if (!sort) return arr;

    arr.sort((a, b) => {
      let va: string | number | null = null;
      let vb: string | number | null = null;

      switch (sort.key) {
        case "company":   va = a.job.company; vb = b.job.company; break;
        case "role":      va = a.job.title;   vb = b.job.title;   break;
        case "status":    va = a.status;       vb = b.status;      break;
        case "appliedAt": va = a.appliedAt ?? a.createdAt; vb = b.appliedAt ?? b.createdAt; break;
        case "daysInStage": va = daysInStage(a); vb = daysInStage(b); break;
        case "fitScore":  va = fitScore(a) ?? -1; vb = fitScore(b) ?? -1; break;
      }

      if (va === null) return 1;
      if (vb === null) return -1;
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sort.dir === "asc" ? cmp : -cmp;
    });

    return arr;
  }, [applications, sort]);

  const headers: { key: SortKey; label: string }[] = [
    { key: "company",     label: "Company" },
    { key: "role",        label: "Role" },
    { key: "status",      label: "Status" },
    { key: "appliedAt",   label: "Applied" },
    { key: "daysInStage", label: "Days in Stage" },
    { key: "fitScore",    label: "Fit" },
  ];

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            {headers.map((h) => (
              <th
                key={h.key}
                className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none whitespace-nowrap"
                onClick={() => toggleSort(h.key)}
              >
                <span className="flex items-center gap-1">
                  {h.label}
                  <SortIcon col={h.key} sort={sort} />
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground text-sm">
                No applications yet — save a job from the Analyze page to get started.
              </td>
            </tr>
          )}
          {sorted.map((app) => {
            const col = COLUMN_BY_STATUS[app.status];
            const score = fitScore(app);
            const days = daysInStage(app);
            const appliedDate = app.appliedAt
              ? format(parseISO(app.appliedAt), "MMM d, yyyy")
              : format(parseISO(app.createdAt), "MMM d, yyyy");

            return (
              <tr
                key={app.id}
                className="border-b border-border/50 hover:bg-accent/20 cursor-pointer transition-colors"
                onClick={() => onSelect(app)}
              >
                <td className="px-4 py-3 font-medium">{app.job.company}</td>
                <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate">{app.job.title}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full ${col.color} ${col.bg}`}>
                    {col.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{appliedDate}</td>
                <td className="px-4 py-3 text-muted-foreground text-center">{days}d</td>
                <td className="px-4 py-3">
                  {score !== null ? (
                    <span className={`inline-flex text-[11px] font-bold px-2 py-0.5 rounded ${fitScoreClass(score)}`}>
                      {score}%
                    </span>
                  ) : (
                    <span className="text-muted-foreground/40 text-xs">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
