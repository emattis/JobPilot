"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import {
  X,
  Upload,
  Loader2,
  FileSpreadsheet,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import * as XLSX from "xlsx";

// ── Types ────────────────────────────────────────────────────────────────────

interface ParsedRow {
  [key: string]: string;
}

interface MappedRow {
  company: string;
  title: string;
  url: string;
  status: string;
  appliedAt: string;
  notes: string;
  location: string;
}

type FieldKey = keyof MappedRow;

const FIELDS: { key: FieldKey; label: string; required: boolean }[] = [
  { key: "company", label: "Company", required: true },
  { key: "title", label: "Job Title", required: true },
  { key: "url", label: "Job URL", required: false },
  { key: "status", label: "Status", required: false },
  { key: "appliedAt", label: "Date Applied", required: false },
  { key: "notes", label: "Notes", required: false },
  { key: "location", label: "Location", required: false },
];

// Auto-detect column mappings based on header names
const HEADER_HINTS: Record<FieldKey, string[]> = {
  company: ["company", "employer", "organization", "org"],
  title: ["title", "role", "position", "job title", "job_title", "jobtitle"],
  url: ["url", "link", "job url", "job_url", "posting", "apply link"],
  status: ["status", "stage", "state", "application status"],
  appliedAt: ["applied", "date applied", "date_applied", "applied_at", "appliedat", "applied date", "date"],
  notes: ["notes", "note", "comments", "description"],
  location: ["location", "city", "loc", "office"],
};

function autoMap(headers: string[]): Record<FieldKey, string> {
  const mapping: Record<FieldKey, string> = {
    company: "",
    title: "",
    url: "",
    status: "",
    appliedAt: "",
    notes: "",
    location: "",
  };

  for (const field of FIELDS) {
    const hints = HEADER_HINTS[field.key];
    const match = headers.find((h) =>
      hints.some((hint) => h.toLowerCase().trim() === hint)
    );
    if (match) mapping[field.key] = match;
  }

  // Fallback: partial match
  for (const field of FIELDS) {
    if (mapping[field.key]) continue;
    const hints = HEADER_HINTS[field.key];
    const match = headers.find(
      (h) =>
        hints.some((hint) => h.toLowerCase().includes(hint)) &&
        !Object.values(mapping).includes(h)
    );
    if (match) mapping[field.key] = match;
  }

  return mapping;
}

// ── Import Dialog ────────────────────────────────────────────────────────────

interface ImportDialogProps {
  onClose: () => void;
  onImported: () => void;
}

export function ImportDialog({ onClose, onImported }: ImportDialogProps) {
  const [step, setStep] = useState<"upload" | "map" | "importing" | "done">("upload");
  const [rawRows, setRawRows] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<FieldKey, string>>({
    company: "",
    title: "",
    url: "",
    status: "",
    appliedAt: "",
    notes: "",
    location: "",
  });
  const [result, setResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);

  // ── File parsing ───────────────────────────────────────────────────────────

  const onDrop = useCallback((files: File[]) => {
    const file = files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<ParsedRow>(sheet, { defval: "" });

        if (json.length === 0) {
          toast.error("File is empty or has no data rows");
          return;
        }

        const hdrs = Object.keys(json[0]);
        setHeaders(hdrs);
        setRawRows(json);
        setMapping(autoMap(hdrs));
        setStep("map");
      } catch {
        toast.error("Failed to parse file. Make sure it's a valid CSV or XLSX.");
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
    },
    maxFiles: 1,
  });

  // ── Mapped preview data ────────────────────────────────────────────────────

  const mappedRows: MappedRow[] = rawRows.map((row) => ({
    company: mapping.company ? String(row[mapping.company] ?? "") : "",
    title: mapping.title ? String(row[mapping.title] ?? "") : "",
    url: mapping.url ? String(row[mapping.url] ?? "") : "",
    status: mapping.status ? String(row[mapping.status] ?? "") : "",
    appliedAt: mapping.appliedAt ? String(row[mapping.appliedAt] ?? "") : "",
    notes: mapping.notes ? String(row[mapping.notes] ?? "") : "",
    location: mapping.location ? String(row[mapping.location] ?? "") : "",
  }));

  const validRows = mappedRows.filter((r) => r.company.trim() && r.title.trim());
  const canImport = validRows.length > 0;

  // ── Import ─────────────────────────────────────────────────────────────────

  async function handleImport() {
    setStep("importing");
    try {
      const res = await fetch("/api/applications/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: validRows }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setResult(data.data);
      setStep("done");
      toast.success(`Imported ${data.data.created} application${data.data.created !== 1 ? "s" : ""}`);
      onImported();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
      setStep("map");
    }
  }

  // ── Column mapping selector ────────────────────────────────────────────────

  function ColumnSelect({ field }: { field: FieldKey }) {
    return (
      <div className="relative">
        <select
          value={mapping[field]}
          onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value }))}
          className="h-8 w-full appearance-none pl-2 pr-7 rounded-md border border-border bg-card text-xs cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">— skip —</option>
          {headers.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none text-muted-foreground" />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold">Import Applications</h2>
          </div>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Upload step */}
          {step === "upload" && (
            <div
              {...getRootProps()}
              className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 text-center transition-colors cursor-pointer ${
                isDragActive
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <input {...getInputProps()} />
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <Upload className="w-7 h-7 text-primary" />
              </div>
              <p className="text-sm font-medium">
                Drop your CSV or XLSX file here
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                or <span className="text-primary underline">click to browse</span>
              </p>
              <p className="text-xs text-muted-foreground mt-4">
                Columns should include at least: Company and Job Title
              </p>
            </div>
          )}

          {/* Map step */}
          {step === "map" && (
            <div className="space-y-5">
              {/* Column mapping */}
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Column Mapping
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {FIELDS.map((f) => (
                    <div key={f.key}>
                      <label className="text-[10px] text-muted-foreground mb-1 block">
                        {f.label} {f.required && <span className="text-destructive">*</span>}
                      </label>
                      <ColumnSelect field={f.key} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Preview ({validRows.length} of {rawRows.length} rows valid)
                </h3>
                <div className="border border-border rounded-lg overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">#</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Company</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Title</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">URL</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Applied</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mappedRows.slice(0, 10).map((row, i) => {
                        const valid = row.company.trim() && row.title.trim();
                        return (
                          <tr
                            key={i}
                            className={`border-b border-border/50 ${
                              valid ? "" : "opacity-40"
                            }`}
                          >
                            <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                            <td className="px-3 py-2 font-medium max-w-[120px] truncate">
                              {row.company || <span className="text-destructive italic">missing</span>}
                            </td>
                            <td className="px-3 py-2 max-w-[160px] truncate">
                              {row.title || <span className="text-destructive italic">missing</span>}
                            </td>
                            <td className="px-3 py-2 max-w-[120px] truncate text-muted-foreground">
                              {row.url || "—"}
                            </td>
                            <td className="px-3 py-2">{row.status || "Applied"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{row.appliedAt || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {rawRows.length > 10 && (
                    <p className="text-xs text-muted-foreground px-3 py-2 border-t border-border/50">
                      ...and {rawRows.length - 10} more rows
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Importing step */}
          {step === "importing" && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
              <p className="text-sm font-medium">Importing {validRows.length} applications...</p>
            </div>
          )}

          {/* Done step */}
          {step === "done" && result && (
            <div className="space-y-4 py-4">
              <div className="flex flex-col items-center text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mb-3" />
                <p className="text-lg font-bold">{result.created} imported</p>
                {result.skipped > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {result.skipped} skipped (already existed)
                  </p>
                )}
              </div>
              {result.errors.length > 0 && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                    <span className="text-xs font-medium text-destructive">
                      {result.errors.length} error{result.errors.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {result.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {(step === "map" || step === "done") && (
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border shrink-0">
            {step === "map" && (
              <>
                <button
                  onClick={() => setStep("upload")}
                  className="h-8 px-4 rounded-md border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleImport}
                  disabled={!canImport}
                  className="h-8 px-4 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  Import {validRows.length} application{validRows.length !== 1 ? "s" : ""}
                </button>
              </>
            )}
            {step === "done" && (
              <button
                onClick={onClose}
                className="h-8 px-4 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
              >
                Done
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
