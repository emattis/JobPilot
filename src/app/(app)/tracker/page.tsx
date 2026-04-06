"use client";

import { useState, useEffect, useCallback } from "react";
import { LayoutGrid, List, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KanbanBoard } from "@/components/tracker/KanbanBoard";
import { TableView } from "@/components/tracker/TableView";
import { DetailPanel } from "@/components/tracker/DetailPanel";
import { ImportDialog } from "@/components/tracker/ImportDialog";
import { AddApplicationDialog } from "@/components/tracker/AddApplicationDialog";
import type { TrackerApplication, AppStatus } from "@/types/tracker";

type View = "board" | "table";

export default function TrackerPage() {
  const [view, setView] = useState<View>("board");
  const [applications, setApplications] = useState<TrackerApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<TrackerApplication | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showAddApp, setShowAddApp] = useState(false);

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
      // Refetch to get fresh statusHistory
      await fetchApps();
    }
  }

  const handleStatusChange = useCallback(async (id: string, status: AppStatus) => {
    // Optimistic update
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

  // ── Stats ────────────────────────────────────────────────────────────────────
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
              {/* Add buttons */}
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
              {/* View toggle */}
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
          <div className="flex flex-wrap gap-4 md:gap-6 text-sm">
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
                applications={applications}
                onStatusChange={handleStatusChange}
                onSelect={setSelected}
              />
            </div>
          ) : (
            <TableView
              applications={applications}
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
          />
        </div>
      )}
    </div>
  );
}
