"use client";

import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import {
  FileText,
  Upload,
  Loader2,
  Star,
  Trash2,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { TailorDialog } from "@/components/resume/TailorDialog";
import { ResumePreview } from "@/components/resume/ResumePreview";

type Resume = {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
};

function UploadZone({ onUploaded }: { onUploaded: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [nameOverride, setNameOverride] = useState("");

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      setUploading(true);
      const form = new FormData();
      form.append("file", file);
      if (nameOverride.trim()) form.append("name", nameOverride.trim());

      try {
        const res = await fetch("/api/resume", { method: "POST", body: form });
        const data = await res.json();

        if (!res.ok || !data.success) {
          toast.error(data.error ?? "Upload failed");
          return;
        }

        toast.success(`"${data.data.name}" uploaded — ${data.data.charCount.toLocaleString()} characters extracted`);
        setNameOverride("");
        onUploaded();
      } catch {
        toast.error("Upload failed. Please try again.");
      } finally {
        setUploading(false);
      }
    },
    [nameOverride, onUploaded]
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } =
    useDropzone({
      onDrop,
      accept: { "application/pdf": [".pdf"] },
      maxFiles: 1,
      disabled: uploading,
    });

  return (
    <div className="space-y-3">
      {/* Optional name override */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={nameOverride}
          onChange={(e) => setNameOverride(e.target.value)}
          placeholder='Resume name (optional, e.g. "Senior SWE v3")'
          className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
        />
      </div>

      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={cn(
          "relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 text-center transition-colors cursor-pointer",
          isDragActive && !isDragReject
            ? "border-primary bg-primary/5"
            : isDragReject
            ? "border-destructive bg-destructive/5"
            : "border-border hover:border-primary/50 hover:bg-primary/3",
          uploading && "pointer-events-none opacity-60"
        )}
      >
        <input {...getInputProps()} />

        {uploading ? (
          <>
            <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
            <p className="text-sm font-medium">Parsing PDF…</p>
            <p className="text-xs text-muted-foreground mt-1">
              Extracting text from your resume
            </p>
          </>
        ) : isDragActive && !isDragReject ? (
          <>
            <Upload className="w-10 h-10 text-primary mb-4" />
            <p className="text-sm font-medium text-primary">Drop to upload</p>
          </>
        ) : isDragReject ? (
          <>
            <FileText className="w-10 h-10 text-destructive mb-4" />
            <p className="text-sm font-medium text-destructive">PDF files only</p>
          </>
        ) : (
          <>
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Upload className="w-7 h-7 text-primary" />
            </div>
            <p className="text-sm font-medium">
              Drop your resume PDF here
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              or{" "}
              <span className="text-primary underline underline-offset-2">
                click to browse
              </span>
            </p>
            <p className="text-xs text-muted-foreground mt-3">
              PDF only · Text-based (not scanned)
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function ResumeList({
  resumes,
  onRefresh,
  selectedId,
  onSelect,
}: {
  resumes: Resume[];
  onRefresh: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [tailoring, setTailoring] = useState<Resume | null>(null);

  async function setDefault(id: string) {
    setLoadingId(id);
    try {
      const res = await fetch("/api/resume", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error();
      toast.success("Default resume updated");
      onRefresh();
    } catch {
      toast.error("Failed to update");
    } finally {
      setLoadingId(null);
    }
  }

  async function deleteResume(id: string, name: string) {
    setLoadingId(id);
    try {
      const res = await fetch(`/api/resume?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success(`"${name}" deleted`);
      onRefresh();
    } catch {
      toast.error("Failed to delete");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <>
    {tailoring && (
      <TailorDialog
        resume={tailoring}
        onClose={() => setTailoring(null)}
        onSaved={onRefresh}
      />
    )}
    <div className="space-y-2">
      {resumes.map((resume) => (
        <div
          key={resume.id}
          onClick={() => onSelect(resume.id)}
          className={cn(
            "flex items-center gap-4 rounded-xl border px-4 py-3.5 transition-colors cursor-pointer",
            selectedId === resume.id
              ? "border-primary bg-primary/8 ring-1 ring-primary/30"
              : resume.isDefault
              ? "border-primary/30 bg-primary/5 hover:border-primary/50"
              : "border-border bg-card hover:border-border/80 hover:bg-accent/20"
          )}
        >
          {/* Icon */}
          <div
            className={cn(
              "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
              resume.isDefault ? "bg-primary/15" : "bg-muted"
            )}
          >
            {resume.isDefault ? (
              <CheckCircle2 className="w-4 h-4 text-primary" />
            ) : (
              <FileText className="w-4 h-4 text-muted-foreground" />
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium truncate">{resume.name}</p>
              {resume.isDefault && (
                <span className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-md">
                  <Star className="w-2.5 h-2.5" />
                  Default
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Uploaded{" "}
              {formatDistanceToNow(new Date(resume.createdAt), {
                addSuffix: true,
              })}
            </p>
          </div>

          {/* Actions — stop propagation so clicks don't open the preview */}
          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            {/* Tailor for job */}
            <button
              onClick={() => setTailoring(resume)}
              disabled={loadingId === resume.id}
              title="Tailor for a job"
              className="h-8 px-2.5 rounded-lg flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Tailor
            </button>

            {!resume.isDefault && (
              <button
                onClick={() => setDefault(resume.id)}
                disabled={loadingId === resume.id}
                title="Set as default"
                className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
              >
                {loadingId === resume.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Star className="w-3.5 h-3.5" />
                )}
              </button>
            )}
            <button
              onClick={() => deleteResume(resume.id, resume.name)}
              disabled={loadingId === resume.id}
              title="Delete resume"
              className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
            >
              {loadingId === resume.id ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      ))}
    </div>
    </>
  );
}

export default function ResumePage() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [previewId, setPreviewId] = useState<string | null>(null);

  async function fetchResumes() {
    try {
      const res = await fetch("/api/resume");
      const data = await res.json();
      if (data.success) setResumes(data.data);
    } catch {
      // silently fail on list fetch
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => { fetchResumes(); }, []);

  function handleSelect(id: string) {
    setPreviewId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="flex flex-col md:flex-row h-auto md:h-[calc(100vh-4rem)] overflow-hidden">
      {/* Left: list pane */}
      <div className={`flex flex-col overflow-y-auto transition-all ${previewId ? "md:w-[420px] md:shrink-0 md:border-r border-border" : "flex-1"}`}>
        <div className="p-8 max-w-3xl mx-auto w-full">
          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Resume</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Upload and manage your resume versions
              </p>
            </div>
          </div>

          {/* Upload card */}
          <div className="rounded-xl border border-border bg-card p-6 mb-6">
            <h2 className="text-sm font-semibold mb-4">Upload a resume</h2>
            <UploadZone onUploaded={fetchResumes} />
          </div>

          {/* Resume list */}
          {loadingList ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : resumes.length > 0 ? (
            <div>
              <h2 className="text-sm font-semibold mb-3">
                Your resumes
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({resumes.length})
                </span>
              </h2>
              <ResumeList
                resumes={resumes}
                onRefresh={fetchResumes}
                selectedId={previewId}
                onSelect={handleSelect}
              />
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No resumes uploaded yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Right: preview pane */}
      {previewId && (
        <div className="flex-1 overflow-hidden">
          <ResumePreview
            resumeId={previewId}
            onClose={() => setPreviewId(null)}
          />
        </div>
      )}
    </div>
  );
}
