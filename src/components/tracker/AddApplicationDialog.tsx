"use client";

import { useState } from "react";
import { toast } from "sonner";
import { X, Loader2, Plus } from "lucide-react";
import type { AppStatus } from "@/types/tracker";

const STATUS_OPTIONS: { value: AppStatus; label: string }[] = [
  { value: "BOOKMARKED", label: "Bookmarked" },
  { value: "APPLIED", label: "Applied" },
  { value: "SCREENING", label: "Screening" },
  { value: "PHONE_INTERVIEW", label: "Phone Interview" },
  { value: "TECHNICAL_INTERVIEW", label: "Technical Interview" },
  { value: "ONSITE_INTERVIEW", label: "Onsite Interview" },
  { value: "OFFER", label: "Offer" },
  { value: "REJECTED", label: "Rejected" },
];

interface AddApplicationDialogProps {
  onClose: () => void;
  onAdded: () => void;
}

export function AddApplicationDialog({ onClose, onAdded }: AddApplicationDialogProps) {
  const [form, setForm] = useState({
    company: "",
    title: "",
    url: "",
    status: "APPLIED" as AppStatus,
    notes: "",
    location: "",
  });
  const [saving, setSaving] = useState(false);

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const valid = form.company.trim() && form.title.trim();

  async function handleSubmit() {
    if (!valid) return;
    setSaving(true);
    try {
      const res = await fetch("/api/applications/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      if (data.duplicate) {
        toast.info("Application already exists");
      } else {
        toast.success(`Added ${form.title} at ${form.company}`);
      }
      onAdded();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-xl shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold">Add Application</h2>
          </div>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">
                Company <span className="text-destructive">*</span>
              </label>
              <input
                value={form.company}
                onChange={(e) => set("company", e.target.value)}
                placeholder="Stripe"
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">
                Role <span className="text-destructive">*</span>
              </label>
              <input
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Senior Software Engineer"
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">Job URL</label>
            <input
              value={form.url}
              onChange={(e) => set("url", e.target.value)}
              placeholder="https://jobs.lever.co/stripe/abc123"
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">Status</label>
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">Location</label>
              <input
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
                placeholder="San Francisco, CA"
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Any notes about this application..."
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="h-8 px-4 rounded-md border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!valid || saving}
            className="h-8 px-4 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
            Add Application
          </button>
        </div>
      </div>
    </div>
  );
}
