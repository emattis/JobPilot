"use client";

import { useEffect, useState } from "react";
import { X, Loader2, FileText } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

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
  // Split on paragraph breaks (2+ newlines), then handle each block
  const blocks = text.split(/\n{2,}/);

  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {blocks.map((block, bi) => {
        const lines = block.split("\n");
        const firstLine = lines[0].trim();

        // Heuristic: section header = short line that is ALL CAPS (or ends with :)
        // and doesn't look like a name / contact info block
        const isHeader =
          firstLine.length > 0 &&
          firstLine.length <= 40 &&
          (firstLine === firstLine.toUpperCase() ||
            firstLine.endsWith(":")) &&
          !/[@.]/g.test(firstLine); // skip email/url lines

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

  return (
    <div className="flex flex-col h-full overflow-hidden border-l border-border bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
            <FileText className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{resume?.name ?? "Loading…"}</p>
            {resume && (
              <p className="text-[11px] text-muted-foreground">
                Uploaded {formatDistanceToNow(new Date(resume.createdAt), { addSuffix: true })}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 ml-2 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Close preview"
        >
          <X className="w-4 h-4" />
        </button>
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
            {/* PDF via iframe */}
            {resume.fileUrl ? (
              <iframe
                src={resume.fileUrl}
                className="w-full h-full border-0"
                title={resume.name}
              />
            ) : (
              /* Text-only rendering */
              <div className="px-6 py-5">
                <FormattedResumeText text={resume.rawText} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
