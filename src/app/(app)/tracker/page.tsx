"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { LayoutGrid, List, Plus, Upload, Sheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { KanbanBoard } from "@/components/tracker/KanbanBoard";
import { TableView } from "@/components/tracker/TableView";
import { DetailPanel } from "@/components/tracker/DetailPanel";
import { ImportDialog } from "@/components/tracker/ImportDialog";
import { AddApplicationDialog } from "@/components/tracker/AddApplicationDialog";
import {
  TrackerFilters,
  DEFAULT_FILTERS,
  filtersAreDefault,
  type FilterState,
  type SortField,
} from "@/components/tracker/TrackerFilters";
import { ALL_STATUSES } from "@/components/tracker/constants";
import type { TrackerApplication, AppStatus } from "@/types/tracker";

type View = "board" | "table";

function getDaysInStage(app: TrackerApplication): number {
  const history = app.statusHistory;
  if (history.length > 0) {
    const last = history[history.length - 1];
    return Math.floor(
      (Date.now() - new Date(last.changedAt).getTime()) / 86_400_000
    );
  }
  return Math.floor(
    (Date.now() - new Date(app.createdAt).getTime()) / 86_400_000
  );
}

function getFitScore(app: TrackerApplication): number | null {
  return app.job.analyses[0]?.overallFitScore ?? null;
}

export default function TrackerPage() {
  const [view, setView] = useState<View>("board");
  const [applications, setApplications] = useState<TrackerApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<TrackerApplication | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showAddApp, setShowAddApp] = useState(false);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [syncing, setSyncing] = useState(false);

  async function handleSyncSheets() {
    setSyncing(true);
    try {
      const res = await fetch("/api/integrations/sheets", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "GOOGLE_NOT_CONNECTED") {
          // Initiate Google OAuth
          const authRes = await fetch("/api/auth/google", { method: "POST" });
          const authData = await authRes.json();
          if (authData.success && authData.url) {
            window.location.href = authData.url;
            return;
          }
          toast.error("Failed to connect Google");
          return;
        }
        throw new Error(data.error || "Sync failed");
      }
      toast.success(
        <span>
          Synced {data.count} applications.{" "}
          <a href={data.url} target="_blank" rel="noopener noreferrer" className="underline font-medium">
            Open Sheet
          </a>
        </span>
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  // ── Fetch ────────────────────────────────────────────────────────────────────
  const fetchApps = useCallback(async () => {
    try {
      const res = await fetch("/api/applications");
      const json = await res.json();
      if (json.success) setApplications(json.data as TrackerApplication[]);
    } catch {
      console.error("Failed to load applications");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchApps(); }, [fetchApps]);

  // Keep selected app in sync after updates
  useEffect(() => {
    if (!selected) return;
    const updated = applications.find((a) => a.id === selected.id);
    if (updated) setSelected(updated);
  }, [applications]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mutations ────────────────────────────────────────────────────────────────
  async function patchApp(id: string, data: Record<string, unknown>) {
    const res = await fetch("/api/applications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...data }),
    });
    const json = await res.json();
    if (json.success) {
      await fetchApps();
    }
  }

  const handleStatusChange = useCallback(async (id: string, status: AppStatus) => {
    setApplications((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status } : a))
    );
    await patchApp(id, { status });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNotesChange = useCallback(async (id: string, notes: string) => {
    setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, notes } : a)));
    await patchApp(id, { notes });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFollowUpChange = useCallback(async (id: string, followUpDate: string) => {
    setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, followUpDate } : a)));
    await patchApp(id, { followUpDate });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRemove = useCallback(async (id: string) => {
    setApplications((prev) => prev.filter((a) => a.id !== id));
    setSelected(null);
    await fetch(`/api/applications?id=${id}`, { method: "DELETE" });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived data ────────────────────────────────────────────────────────────
  const availableSources = useMemo(() => {
    const set = new Set(applications.map((a) => a.job.source));
    return [...set].sort();
  }, [applications]);

  // ── Filtering ───────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = filters.search.toLowerCase().trim();

    let result = applications.filter((app) => {
      // Text search
      if (q) {
        const haystack = [
          app.job.company,
          app.job.title,
          app.notes ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      // Status
      if (
        filters.statuses.length > 0 &&
        !filters.statuses.includes(app.status)
      )
        return false;

      // Source
      if (
        filters.sources.length > 0 &&
        !filters.sources.includes(app.job.source)
      )
        return false;

      // Date range
      if (filters.dateFrom) {
        const from = new Date(filters.dateFrom);
        if (new Date(app.createdAt) < from) return false;
      }
      if (filters.dateTo) {
        const to = new Date(filters.dateTo);
        to.setHours(23, 59, 59, 999);
        if (new Date(app.createdAt) > to) return false;
      }

      // Fit score
      if (filters.minFit > 0) {
        const score = getFitScore(app);
        if (score === null || score < filters.minFit) return false;
      }

      return true;
    });

    // Sort
    const dir = filters.sortDir === "asc" ? 1 : -1;
    result.sort((a, b) => {
      switch (filters.sortBy) {
        case "company":
          return dir * a.job.company.localeCompare(b.job.company);
        case "status": {
          const ai = ALL_STATUSES.indexOf(a.status);
          const bi = ALL_STATUSES.indexOf(b.status);
          return dir * (ai - bi);
        }
        case "fitScore": {
          const as = getFitScore(a) ?? -1;
          const bs = getFitScore(b) ?? -1;
          return dir * (as - bs);
        }
        case "daysInStage":
          return dir * (getDaysInStage(a) - getDaysInStage(b));
        case "createdAt":
        default:
          return (
            dir *
            (new Date(a.createdAt).getTime() -
              new Date(b.createdAt).getTime())
          );
      }
    });

    return result;
  }, [applications, filters]);

  // ── Stats (on all applications, not filtered) ───────────────────────────────
  const stats = {
    total: applications.length,
    active: applications.filter((a) => !["REJECTED", "WITHDRAWN", "GHOSTED", "ACCEPTED"].includes(a.status)).length,
    interviews: applications.filter((a) =>
      ["SCREENING", "PHONE_INTERVIEW", "TECHNICAL_INTERVIEW", "ONSITE_INTERVIEW", "FINAL_ROUND"].includes(a.status)
    ).length,
    offers: applications.filter((a) => ["OFFER", "ACCEPTED"].includes(a.status)).length,
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-3.5rem)] md:h-[calc(100vh-4rem)] overflow-hidden">
      {/* Main content */}
      <div className={`flex flex-col flex-1 min-w-0 transition-all ${selected ? "md:mr-[380px]" : ""}`}>

        {/* Header */}
        <div className="shrink-0 px-6 pt-6 pb-4 border-b border-border bg-background">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Applications</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Track every application through your pipeline</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAddApp(true)}
                className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Add</span>
              </button>
              <button
                onClick={() => setShowImport(true)}
                className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Import</span>
              </button>
              <button
                onClick={handleSyncSheets}
                disabled={syncing}
                className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
              >
                {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sheet className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">Sync Sheets</span>
              </button>
              <div className="flex rounded-md border border-border overflow-hidden">
                <button
                  onClick={() => setView("board")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                    view === "board" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  Board
                </button>
                <button
                  onClick={() => setView("table")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                    view === "table" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                  Table
                </button>
              </div>
            </div>
          </div>

          {/* Quick stats */}
          <div className="flex flex-wrap gap-4 md:gap-6 text-sm mb-4">
            {[
              { label: "Total", value: stats.total },
              { label: "Active", value: stats.active, color: "text-sky-400" },
              { label: "Interviews", value: stats.interviews, color: "text-yellow-400" },
              { label: "Offers", value: stats.offers, color: "text-emerald-400" },
            ].map((s) => (
              <div key={s.label} className="flex items-baseline gap-1.5">
                <span className={`text-xl font-bold ${s.color ?? "text-foreground"}`}>{s.value}</span>
                <span className="text-muted-foreground text-xs">{s.label}</span>
              </div>
            ))}
          </div>

          {/* Filters */}
          <TrackerFilters
            filters={filters}
            onChange={setFilters}
            availableSources={availableSources}
            filteredCount={filtered.length}
            totalCount={applications.length}
          />
        </div>

        {/* Content */}
        <div className={`flex-1 overflow-auto ${view === "board" ? "" : "p-6"}`}>
          {loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="rounded-lg border border-border bg-card p-4 animate-pulse">
                  <div className="h-4 bg-muted rounded w-1/3 mb-2" />
                  <div className="h-3 bg-muted rounded w-2/3 mb-1" />
                  <div className="h-3 bg-muted rounded w-1/4" />
                </div>
              ))}
            </div>
          ) : view === "board" ? (
            <div className="p-4 pt-3">
              <KanbanBoard
                applications={filtered}
                onStatusChange={handleStatusChange}
                onSelect={setSelected}
              />
            </div>
          ) : (
            <TableView
              applications={filtered}
              onSelect={setSelected}
            />
          )}
        </div>
      </div>

      {/* Dialogs */}
      {showImport && (
        <ImportDialog
          onClose={() => setShowImport(false)}
          onImported={fetchApps}
        />
      )}
      {showAddApp && (
        <AddApplicationDialog
          onClose={() => setShowAddApp(false)}
          onAdded={fetchApps}
        />
      )}

      {/* Detail panel slide-over */}
      {selected && (
        <div className="fixed inset-0 md:inset-auto md:right-0 md:top-0 md:bottom-0 md:w-[380px] border-l border-border bg-background shadow-xl z-30 flex flex-col">
          <DetailPanel
            app={selected}
            onClose={() => setSelected(null)}
            onStatusChange={handleStatusChange}
            onNotesChange={handleNotesChange}
            onFollowUpChange={handleFollowUpChange}
            onRemove={handleRemove}
            onRefresh={fetchApps}
          />
        </div>
      )}
    </div>
  );
}
