"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Database,
  Plus,
  RefreshCw,
  Loader2,
  Trash2,
  ExternalLink,
  ChevronDown,
  Zap,
  Building2,
  Globe,
  X,
  Check,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// ── Types ──────────────────────────────────────────────────────────────────

interface CompanySource {
  id: string;
  name: string;
  slug: string;
  atsType: string;
  careerUrl: string;
  vcSource: string | null;
  active: boolean;
  lastScanned: string | null;
  jobsFound: number;
}

interface VCSourceRecord {
  id: string;
  name: string;
  portfolioUrl: string;
  scraperType: string;
  active: boolean;
  lastScanned: string | null;
  companiesFound: number;
  jobsFound: number;
}

type SourceKind = "company" | "vc";

interface ScanState {
  id: string;
  kind: SourceKind;
  message: string;
}

const TYPE_OPTIONS = [
  { value: "company_career", label: "Company Career Page" },
  { value: "ats_board", label: "ATS Board" },
  { value: "vc_portfolio", label: "VC Portfolio" },
  { value: "job_board", label: "Job Board" },
];

const ATS_OPTIONS = [
  { value: "auto", label: "Auto-detect" },
  { value: "greenhouse", label: "Greenhouse" },
  { value: "lever", label: "Lever" },
  { value: "ashby", label: "Ashby" },
  { value: "workday", label: "Workday" },
  { value: "custom", label: "Custom" },
];

const ATS_COLORS: Record<string, string> = {
  greenhouse: "bg-green-500/10 text-green-400 border-green-500/20",
  lever: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  ashby: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  workday: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  custom: "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

const SUGGESTED_SOURCES = [
  { name: "YC Work at a Startup", url: "https://www.workatastartup.com/jobs", type: "job_board" as const, atsType: "custom" as const },
  { name: "a16z Portfolio Jobs", url: "https://jobs.a16z.com", type: "vc_portfolio" as const, atsType: "custom" as const },
  { name: "Contrary Jobs", url: "https://jobs.contrary.com", type: "vc_portfolio" as const, atsType: "custom" as const },
  { name: "Anthropic", url: "https://boards.greenhouse.io/anthropic", type: "ats_board" as const, atsType: "greenhouse" as const },
  { name: "Stripe", url: "https://jobs.lever.co/stripe", type: "ats_board" as const, atsType: "lever" as const },
  { name: "OpenAI", url: "https://boards.greenhouse.io/openai", type: "ats_board" as const, atsType: "greenhouse" as const },
  { name: "Vercel", url: "https://boards.greenhouse.io/vercel", type: "ats_board" as const, atsType: "greenhouse" as const },
  { name: "Figma", url: "https://boards.greenhouse.io/figma", type: "ats_board" as const, atsType: "greenhouse" as const },
  { name: "Notion", url: "https://boards.greenhouse.io/notion", type: "ats_board" as const, atsType: "greenhouse" as const },
  { name: "Ramp", url: "https://boards.greenhouse.io/ramp", type: "ats_board" as const, atsType: "greenhouse" as const },
  { name: "Scale AI", url: "https://boards.greenhouse.io/scaleai", type: "ats_board" as const, atsType: "greenhouse" as const },
  { name: "Databricks", url: "https://boards.greenhouse.io/databricks", type: "ats_board" as const, atsType: "greenhouse" as const },
  { name: "Plaid", url: "https://boards.greenhouse.io/plaid", type: "ats_board" as const, atsType: "greenhouse" as const },
  { name: "Rippling", url: "https://jobs.lever.co/rippling", type: "ats_board" as const, atsType: "lever" as const },
  { name: "Brex", url: "https://boards.greenhouse.io/brex", type: "ats_board" as const, atsType: "greenhouse" as const },
];

// ── Page ───────────────────────────────────────────────────────────────────

export default function SourcesPage() {
  const [companies, setCompanies] = useState<CompanySource[]>([]);
  const [vcSources, setVcSources] = useState<VCSourceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [scanning, setScanning] = useState<ScanState | null>(null);
  const [scanAllRunning, setScanAllRunning] = useState(false);

  // Add form state
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formType, setFormType] = useState("ats_board");
  const [formAts, setFormAts] = useState("auto");
  const [adding, setAdding] = useState(false);

  const loadSources = useCallback(async () => {
    try {
      const res = await fetch("/api/sources");
      const data = await res.json();
      if (data.success) {
        setCompanies(data.data.companies);
        setVcSources(data.data.vcSources);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  // ── Add source ─────────────────────────────────────────────────────────

  async function handleAdd() {
    if (!formName.trim() || !formUrl.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          url: formUrl.trim(),
          type: formType,
          atsType: formAts,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Failed to add");
      toast.success(`Added ${formName}`);
      setFormName("");
      setFormUrl("");
      setFormType("ats_board");
      setFormAts("auto");
      setShowAdd(false);
      await loadSources();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add source");
    } finally {
      setAdding(false);
    }
  }

  async function handleQuickAdd(s: typeof SUGGESTED_SOURCES[number]) {
    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: s.name, url: s.url, type: s.type, atsType: s.atsType }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Added ${s.name}`);
      await loadSources();
    } catch {
      toast.error(`Failed to add ${s.name}`);
    }
  }

  // ── Toggle active ──────────────────────────────────────────────────────

  async function handleToggle(id: string, kind: SourceKind, active: boolean) {
    // Optimistic
    if (kind === "company") {
      setCompanies((prev) => prev.map((c) => (c.id === id ? { ...c, active } : c)));
    } else {
      setVcSources((prev) => prev.map((v) => (v.id === id ? { ...v, active } : v)));
    }
    await fetch("/api/sources", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, kind, active }),
    });
  }

  // ── Delete ─────────────────────────────────────────────────────────────

  async function handleDelete(id: string, kind: SourceKind) {
    if (kind === "company") {
      setCompanies((prev) => prev.filter((c) => c.id !== id));
    } else {
      setVcSources((prev) => prev.filter((v) => v.id !== id));
    }
    await fetch(`/api/sources?id=${id}&kind=${kind}`, { method: "DELETE" });
    toast.success("Source removed");
  }

  // ── Scan ───────────────────────────────────────────────────────────────

  async function runScan(id: string, kind: SourceKind) {
    setScanning({ id, kind, message: "Starting scan..." });
    try {
      const res = await fetch("/api/sources/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, kind }),
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
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "status") {
              setScanning({ id, kind, message: event.message });
            } else if (event.type === "complete") {
              toast.success(`Scan complete — ${event.newJobs} new jobs found`);
            } else if (event.type === "error") {
              toast.error(event.error);
            }
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(null);
      await loadSources();
    }
  }

  async function runScanAll() {
    setScanAllRunning(true);
    const activeSources: { id: string; kind: SourceKind }[] = [
      ...companies.filter((c) => c.active).map((c) => ({ id: c.id, kind: "company" as const })),
      ...vcSources.filter((v) => v.active).map((v) => ({ id: v.id, kind: "vc" as const })),
    ];

    for (const source of activeSources) {
      await runScan(source.id, source.kind);
    }
    setScanAllRunning(false);
  }

  // ── Which suggested sources are already added ──────────────────────────

  const addedUrls = new Set([
    ...companies.map((c) => c.careerUrl),
    ...vcSources.map((v) => v.portfolioUrl),
  ]);

  const totalSources = companies.length + vcSources.length;
  const activeSources = companies.filter((c) => c.active).length + vcSources.filter((v) => v.active).length;

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Database className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Job Sources</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manage company boards, VC portfolios, and job boards to scan
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runScanAll}
            disabled={scanAllRunning || !!scanning || activeSources === 0}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            {scanAllRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Scan All
          </button>
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Source
          </button>
        </div>
      </div>

      {/* Stats */}
      {totalSources > 0 && (
        <div className="grid grid-cols-3 gap-2 md:gap-3 mb-6">
          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Total sources</p>
            <p className="text-xl font-bold font-mono mt-0.5">{totalSources}</p>
          </div>
          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Active</p>
            <p className="text-xl font-bold font-mono mt-0.5 text-green-400">{activeSources}</p>
          </div>
          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Total jobs found</p>
            <p className="text-xl font-bold font-mono mt-0.5">
              {companies.reduce((s, c) => s + c.jobsFound, 0) + vcSources.reduce((s, v) => s + v.jobsFound, 0)}
            </p>
          </div>
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="rounded-xl border border-border bg-card p-5 mb-6">
          <h3 className="text-sm font-semibold mb-4">Add New Source</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Name</label>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Anthropic"
                  className="w-full h-8 rounded-md border border-border bg-background px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">URL</label>
                <input
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://boards.greenhouse.io/anthropic"
                  className="w-full h-8 rounded-md border border-border bg-background px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Type</label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value)}
                  className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              {(formType === "ats_board" || formType === "company_career") && (
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">ATS Type</label>
                  <select
                    value={formAts}
                    onChange={(e) => setFormAts(e.target.value)}
                    className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {ATS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleAdd}
                disabled={adding || !formName.trim() || !formUrl.trim()}
                className="inline-flex items-center gap-1.5 h-8 px-4 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                Add
              </button>
              <button
                onClick={() => setShowAdd(false)}
                className="h-8 px-3 rounded-md border border-border text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scan status */}
      {scanning && (
        <div className="rounded-xl border border-border bg-card p-4 mb-6 flex items-center gap-3">
          <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
          <p className="text-sm">{scanning.message}</p>
        </div>
      )}

      {/* Source list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5 animate-pulse h-20" />
          ))}
        </div>
      ) : totalSources > 0 ? (
        <div className="space-y-2">
          {/* VC / Job Board sources */}
          {vcSources.map((src) => (
            <SourceRow
              key={src.id}
              id={src.id}
              kind="vc"
              name={src.name}
              url={src.portfolioUrl}
              typeLabel={src.scraperType === "vc_portfolio" ? "VC Portfolio" : "Job Board"}
              atsType={null}
              active={src.active}
              lastScanned={src.lastScanned}
              jobsFound={src.jobsFound}
              extra={src.companiesFound > 0 ? `${src.companiesFound} companies` : undefined}
              scanning={scanning?.id === src.id}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onScan={runScan}
              scanDisabled={!!scanning}
            />
          ))}
          {/* Company sources */}
          {companies.map((src) => (
            <SourceRow
              key={src.id}
              id={src.id}
              kind="company"
              name={src.name}
              url={src.careerUrl}
              typeLabel={src.vcSource ? `via ${src.vcSource}` : "Company"}
              atsType={src.atsType}
              active={src.active}
              lastScanned={src.lastScanned}
              jobsFound={src.jobsFound}
              scanning={scanning?.id === src.id}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onScan={runScan}
              scanDisabled={!!scanning}
            />
          ))}
        </div>
      ) : !showAdd ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center mb-8">
          <Database className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-medium">No sources added yet</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            Add company career pages, ATS boards, or VC portfolios to scan for jobs
          </p>
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add your first source
          </button>
        </div>
      ) : null}

      {/* Suggested sources */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold mb-3">Suggested Sources</h2>
        <p className="text-xs text-muted-foreground mb-4">
          High-value sources from top companies and VC portfolios. Click to add.
        </p>
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_SOURCES.map((s) => {
            const isAdded = addedUrls.has(s.url);
            return (
              <button
                key={s.url}
                onClick={() => !isAdded && handleQuickAdd(s)}
                disabled={isAdded}
                className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs font-medium transition-colors ${
                  isAdded
                    ? "border-green-500/20 bg-green-500/5 text-green-400 cursor-default"
                    : "border-border text-muted-foreground hover:text-foreground hover:bg-white/5"
                }`}
              >
                {isAdded ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                {s.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Source row component ──────────────────────────────────────────────────

function SourceRow({
  id,
  kind,
  name,
  url,
  typeLabel,
  atsType,
  active,
  lastScanned,
  jobsFound,
  extra,
  scanning,
  onToggle,
  onDelete,
  onScan,
  scanDisabled,
}: {
  id: string;
  kind: SourceKind;
  name: string;
  url: string;
  typeLabel: string;
  atsType: string | null;
  active: boolean;
  lastScanned: string | null;
  jobsFound: number;
  extra?: string;
  scanning: boolean;
  onToggle: (id: string, kind: SourceKind, active: boolean) => void;
  onDelete: (id: string, kind: SourceKind) => void;
  onScan: (id: string, kind: SourceKind) => void;
  scanDisabled: boolean;
}) {
  const atsColor = atsType ? ATS_COLORS[atsType] ?? ATS_COLORS.custom : null;

  return (
    <div className={`rounded-xl border border-border bg-card p-4 flex items-center gap-3 transition-opacity ${active ? "" : "opacity-50"}`}>
      {/* Toggle */}
      <button
        onClick={() => onToggle(id, kind, !active)}
        className={`w-9 h-5 rounded-full shrink-0 relative transition-colors ${active ? "bg-green-500" : "bg-muted"}`}
      >
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${active ? "left-[18px]" : "left-0.5"}`} />
      </button>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold truncate">{name}</span>
          {atsType && atsColor && (
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${atsColor}`}>
              {atsType}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">{typeLabel}</span>
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
          {jobsFound > 0 && <span>{jobsFound} jobs</span>}
          {extra && <span>{extra}</span>}
          {lastScanned && (
            <span>Scanned {formatDistanceToNow(new Date(lastScanned), { addSuffix: true })}</span>
          )}
          {!lastScanned && <span>Never scanned</span>}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onScan(id, kind)}
          disabled={scanDisabled || !active}
          className="h-7 px-2.5 rounded-md border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-40 inline-flex items-center gap-1"
        >
          {scanning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
          Scan
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="h-7 w-7 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
        </a>
        <button
          onClick={() => onDelete(id, kind)}
          className="h-7 w-7 rounded-md text-muted-foreground hover:text-destructive transition-colors flex items-center justify-center"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
