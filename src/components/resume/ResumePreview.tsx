"use client";

import { useEffect, useState } from "react";
import { X, Loader2, FileText, FileOutput } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface ResumeDetail {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  rawText: string;
  fileUrl: string | null;
}

/**
 * Lightly format plain-text resume content for readability.
 * Detects section headers (short ALL-CAPS lines, or lines ending with a colon)
 * and renders them distinctly. Everything else is rendered preserving whitespace.
 */
function FormattedResumeText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);

  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {blocks.map((block, bi) => {
        const lines = block.split("\n");
        const firstLine = lines[0].trim();

        const isHeader =
          firstLine.length > 0 &&
          firstLine.length <= 40 &&
          (firstLine === firstLine.toUpperCase() || firstLine.endsWith(":")) &&
          !/[@.]/g.test(firstLine);

        if (isHeader) {
          return (
            <div key={bi}>
              <p className="text-xs font-bold uppercase tracking-widest text-primary/80 border-b border-border/50 pb-1 mb-2">
                {firstLine}
              </p>
              {lines.slice(1).length > 0 && (
                <pre className="whitespace-pre-wrap font-sans text-sm text-foreground/90 leading-relaxed">
                  {lines.slice(1).join("\n")}
                </pre>
              )}
            </div>
          );
        }

        return (
          <pre key={bi} className="whitespace-pre-wrap font-sans text-sm text-foreground/90 leading-relaxed">
            {block}
          </pre>
        );
      })}
    </div>
  );
}

interface ResumePreviewProps {
  resumeId: string;
  onClose: () => void;
}

export function ResumePreview({ resumeId, onClose }: ResumePreviewProps) {
  const [resume, setResume] = useState<ResumeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setResume(null);
    fetch(`/api/resume?id=${resumeId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setResume(d.data);
        else setError(d.error ?? "Failed to load");
      })
      .catch(() => setError("Network error"))
      .finally(() => setLoading(false));
  }, [resumeId]);

  async function generatePdf() {
    if (!resume) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/resume/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: resume.id }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "Generation failed");
      // Update local state with the new fileUrl so the iframe renders immediately
      setResume((prev) => prev ? { ...prev, fileUrl: data.data.fileUrl } : prev);
      toast.success("PDF generated successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate PDF");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden border-l border-border bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0 gap-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
            <FileText className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{resume?.name ?? "Loading…"}</p>
            {resume && (
              <p className="text-[11px] text-muted-foreground">
                {resume.fileUrl ? "PDF" : "Text only"} · uploaded {formatDistanceToNow(new Date(resume.createdAt), { addSuffix: true })}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Generate PDF button — only for text-only resumes */}
          {resume && !resume.fileUrl && (
            <button
              onClick={generatePdf}
              disabled={generating}
              className="flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
              title="Generate a PDF from the extracted text"
            >
              {generating ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</>
              ) : (
                <><FileOutput className="w-3.5 h-3.5" /> Generate PDF</>
              )}
            </button>
          )}

          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Close preview"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-full text-sm text-destructive px-6 text-center">
            {error}
          </div>
        )}

        {resume && !loading && (
          <>
            {resume.fileUrl ? (
              /* Native PDF rendered in an iframe */
              <iframe
                key={resume.fileUrl}
                src={`${resume.fileUrl}#toolbar=1&navpanes=0`}
                className="w-full h-full border-0"
                title={resume.name}
              />
            ) : (
              /* Text-only fallback with formatted rendering */
              <div className="px-6 py-5">
                <div className="mb-4 flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 border border-border/50 rounded-lg px-3 py-2.5">
                  <FileOutput className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    This resume was saved as extracted text. Click{" "}
                    <button onClick={generatePdf} disabled={generating} className="underline underline-offset-2 hover:text-foreground disabled:no-underline">
                      Generate PDF
                    </button>{" "}
                    to create a formatted PDF version.
                  </span>
                </div>
                <FormattedResumeText text={resume.rawText} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
