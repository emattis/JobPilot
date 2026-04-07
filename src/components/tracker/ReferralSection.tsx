"use client";

import { useState, useEffect } from "react";
import { format, parseISO, differenceInDays } from "date-fns";
import {
  Users,
  Plus,
  Loader2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Trash2,
  RefreshCw,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import type { Referral, ReferralStatus, OutreachType } from "@/types/referral";
import { OUTREACH_TYPE_LABELS } from "@/types/referral";

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ReferralStatus, { label: string; color: string; bg: string }> = {
  DRAFT:       { label: "Draft",       color: "text-slate-400",   bg: "bg-slate-500/10"   },
  SENT:        { label: "Sent",        color: "text-sky-400",     bg: "bg-sky-500/10"     },
  RESPONDED:   { label: "Responded",   color: "text-emerald-400", bg: "bg-emerald-500/10" },
  REFERRED:    { label: "Referred",    color: "text-green-400",   bg: "bg-green-500/10"   },
  DECLINED:    { label: "Declined",    color: "text-red-400",     bg: "bg-red-500/10"     },
  NO_RESPONSE: { label: "No Response", color: "text-slate-500",   bg: "bg-slate-500/10"   },
};

function needsFollowUp(r: Referral): boolean {
  if (r.status !== "SENT") return false;
  if (!r.messageSentAt) return false;
  return differenceInDays(new Date(), parseISO(r.messageSentAt)) >= 5;
}

// ── Add contact form ──────────────────────────────────────────────────────────

const OUTREACH_TYPES: OutreachType[] = [
  "WARM_INTRO", "COLD_OUTREACH", "ALUMNI", "HIRING_MANAGER", "RECRUITER", "EMPLOYEE",
];

const RELATIONSHIP_PLACEHOLDERS: Record<OutreachType, string> = {
  WARM_INTRO: "Former colleague at Acme",
  COLD_OUTREACH: "Found them on LinkedIn",
  ALUMNI: "Alumni from MIT CS '20",
  HIRING_MANAGER: "Hiring manager for this role",
  RECRUITER: "Recruiter who posted the role",
  EMPLOYEE: "Works on the same team",
};

function AddContactForm({
  onAdd,
  onCancel,
}: {
  onAdd: (data: { contactName: string; contactRole: string; contactCompany: string; outreachType: OutreachType; relationship: string }) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({ contactName: "", contactRole: "", contactCompany: "", outreachType: "WARM_INTRO" as OutreachType, relationship: "" });

  function set(k: keyof typeof form, v: string) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  const valid = form.contactName.trim() && form.relationship.trim();

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2.5">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">New Contact</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-muted-foreground mb-0.5 block">Name *</label>
          <input
            value={form.contactName}
            onChange={(e) => set("contactName", e.target.value)}
            placeholder="Jane Smith"
            className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground mb-0.5 block">Outreach type</label>
          <select
            value={form.outreachType}
            onChange={(e) => set("outreachType", e.target.value)}
            className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {OUTREACH_TYPES.map((t) => (
              <option key={t} value={t}>{OUTREACH_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground mb-0.5 block">Their role</label>
          <input
            value={form.contactRole}
            onChange={(e) => set("contactRole", e.target.value)}
            placeholder="Staff Engineer"
            className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground mb-0.5 block">Their company</label>
          <input
            value={form.contactCompany}
            onChange={(e) => set("contactCompany", e.target.value)}
            placeholder="Same company as job"
            className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </div>
      <div>
        <label className="text-[10px] text-muted-foreground mb-0.5 block">Connection context *</label>
        <input
          value={form.relationship}
          onChange={(e) => set("relationship", e.target.value)}
          placeholder={RELATIONSHIP_PLACEHOLDERS[form.outreachType]}
          className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>
      <div className="flex gap-2 pt-0.5">
        <button
          onClick={() => valid && onAdd(form)}
          disabled={!valid}
          className="flex items-center gap-1.5 h-7 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <Plus className="w-3 h-3" />
          Generate outreach
        </button>
        <button
          onClick={onCancel}
          className="h-7 px-3 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Single referral card ──────────────────────────────────────────────────────

function ReferralCard({
  referral,
  onUpdate,
  onDelete,
}: {
  referral: Referral;
  onUpdate: (id: string, data: Partial<Referral>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);
  const [editingMessage, setEditingMessage] = useState(false);
  const [message, setMessage] = useState(referral.messageTemplate ?? "");
  const [regenerating, setRegenerating] = useState(false);

  const sc = STATUS_CONFIG[referral.status];
  const followUp = needsFollowUp(referral);

  async function copyMessage() {
    if (!message) return;
    await navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function saveMessage() {
    await onUpdate(referral.id, { messageTemplate: message });
    setEditingMessage(false);
  }

  async function markSent() {
    await onUpdate(referral.id, {
      status: "SENT",
      messageSentAt: new Date().toISOString(),
    });
  }

  async function markResponded() {
    await onUpdate(referral.id, {
      status: "RESPONDED",
      responseReceivedAt: new Date().toISOString(),
    });
  }

  async function markReferred() {
    await onUpdate(referral.id, {
      status: "REFERRED",
      referralMade: true,
      referralDate: new Date().toISOString(),
    });
  }

  async function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    await onUpdate(referral.id, { status: e.target.value as ReferralStatus });
  }

  async function regenerateMessage() {
    setRegenerating(true);
    try {
      const res = await fetch("/api/referrals/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: referral.id }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setMessage(data.data.messageTemplate ?? "");
      toast.success("Message regenerated");
    } catch {
      toast.error("Failed to regenerate message");
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className={`rounded-lg border transition-colors ${followUp ? "border-yellow-500/40 bg-yellow-500/5" : "border-border bg-card"}`}>
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{referral.contactName}</span>
            {referral.contactRole && (
              <span className="text-[11px] text-muted-foreground">
                {referral.contactRole}{referral.contactCompany ? ` @ ${referral.contactCompany}` : ""}
              </span>
            )}
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              {OUTREACH_TYPE_LABELS[referral.outreachType]}
            </span>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${sc.color} ${sc.bg}`}>
              {sc.label}
            </span>
            {followUp && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-yellow-400 bg-yellow-500/10 px-1.5 py-0.5 rounded-full">
                <AlertCircle className="w-3 h-3" />
                Follow up
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground/70 mt-0.5 truncate">{referral.relationship}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {referral.contactLinkedin && (
            <a
              href={referral.contactLinkedin}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-1 text-muted-foreground/40 hover:text-sky-400 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(referral.id); }}
            className="p-1 text-muted-foreground/30 hover:text-destructive transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground/40" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/40" />}
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-border/50 pt-2.5 space-y-3">
          {/* Outreach message */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Outreach message</p>
              <div className="flex items-center gap-1">
                <button
                  onClick={regenerateMessage}
                  disabled={regenerating}
                  className="flex items-center gap-1 h-6 px-2 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                  title="Regenerate with AI"
                >
                  {regenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  Regenerate
                </button>
                <button
                  onClick={copyMessage}
                  disabled={!message}
                  className="flex items-center gap-1 h-6 px-2 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            {editingMessage ? (
              <div className="space-y-1.5">
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={7}
                  className="text-xs font-mono resize-none"
                />
                <div className="flex gap-1.5">
                  <button onClick={saveMessage} className="h-6 px-2.5 rounded bg-primary text-primary-foreground text-[10px] font-medium">Save</button>
                  <button onClick={() => { setEditingMessage(false); setMessage(referral.messageTemplate ?? ""); }} className="h-6 px-2.5 rounded border border-border text-[10px] text-muted-foreground hover:text-foreground">Cancel</button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => setEditingMessage(true)}
                className="text-xs text-foreground/80 bg-muted/30 border border-border/50 rounded-md p-2.5 whitespace-pre-wrap leading-relaxed cursor-text min-h-[60px] hover:border-border transition-colors"
              >
                {message || <span className="text-muted-foreground/40 italic">No message yet — click to write or regenerate</span>}
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {referral.status === "DRAFT" && message && (
              <button
                onClick={markSent}
                className="h-7 px-3 rounded-md bg-sky-500/10 text-sky-400 border border-sky-500/20 text-xs font-medium hover:bg-sky-500/20 transition-colors"
              >
                Mark as Sent
              </button>
            )}
            {referral.status === "SENT" && (
              <button
                onClick={markResponded}
                className="h-7 px-3 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-medium hover:bg-emerald-500/20 transition-colors"
              >
                Mark Responded
              </button>
            )}
            {(referral.status === "SENT" || referral.status === "RESPONDED") && (
              <button
                onClick={markReferred}
                className="h-7 px-3 rounded-md bg-green-500/10 text-green-400 border border-green-500/20 text-xs font-medium hover:bg-green-500/20 transition-colors"
              >
                Referral Made ✓
              </button>
            )}
            {/* Manual status override */}
            <div className="relative ml-auto">
              <select
                value={referral.status}
                onChange={handleStatusChange}
                className="h-7 appearance-none pl-2 pr-6 rounded-md border border-border bg-card text-[10px] text-muted-foreground cursor-pointer focus:outline-none"
              >
                {(Object.keys(STATUS_CONFIG) as ReferralStatus[]).map((s) => (
                  <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none text-muted-foreground/50" />
            </div>
          </div>

          {/* Dates */}
          <div className="flex gap-4 text-[11px] text-muted-foreground/70">
            {referral.messageSentAt && (
              <span>Sent {format(parseISO(referral.messageSentAt), "MMM d")}</span>
            )}
            {referral.responseReceivedAt && (
              <span>Responded {format(parseISO(referral.responseReceivedAt), "MMM d")}</span>
            )}
            {referral.referralDate && (
              <span className="text-green-400/70">Referred {format(parseISO(referral.referralDate), "MMM d")}</span>
            )}
          </div>

          {/* LinkedIn input */}
          {!referral.contactLinkedin && (
            <LinkedInInput referralId={referral.id} onUpdate={onUpdate} />
          )}
        </div>
      )}
    </div>
  );
}

function LinkedInInput({
  referralId,
  onUpdate,
}: {
  referralId: string;
  onUpdate: (id: string, data: Partial<Referral>) => Promise<void>;
}) {
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!url.trim()) return;
    setSaving(true);
    await onUpdate(referralId, { contactLinkedin: url.trim() });
    setSaving(false);
  }

  return (
    <div className="flex gap-1.5">
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="LinkedIn URL (optional)"
        className="flex-1 h-7 rounded-md border border-input bg-background px-2.5 text-xs placeholder:text-muted-foreground/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <button
        onClick={save}
        disabled={!url.trim() || saving}
        className="h-7 px-2.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
      >
        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
      </button>
    </div>
  );
}

// ── Main section ──────────────────────────────────────────────────────────────

interface ReferralSectionProps {
  applicationId: string;
  jobTitle: string;
  jobCompany: string;
}

export function ReferralSection({ applicationId, jobTitle, jobCompany }: ReferralSectionProps) {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch(`/api/referrals?applicationId=${applicationId}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setReferrals(d.data); })
      .finally(() => setLoading(false));
  }, [applicationId]);

  async function handleAdd(form: {
    contactName: string;
    contactRole: string;
    contactCompany: string;
    outreachType: OutreachType;
    relationship: string;
  }) {
    setCreating(true);
    setAdding(false);
    try {
      const res = await fetch("/api/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId, ...form }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
      setReferrals((prev) => [data.data, ...prev]);
      toast.success(`Outreach draft created for ${form.contactName}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create contact";
      console.error("[ReferralSection] create failed:", msg);
      toast.error(msg);
      setAdding(true);
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdate(id: string, fields: Partial<Referral>) {
    const res = await fetch("/api/referrals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...fields }),
    });
    const data = await res.json();
    if (data.success) {
      setReferrals((prev) => prev.map((r) => (r.id === id ? data.data : r)));
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/referrals?id=${id}`, { method: "DELETE" });
    setReferrals((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" />
          Outreach
          {referrals.length > 0 && (
            <span className="font-normal text-muted-foreground/60">({referrals.length})</span>
          )}
        </h3>
        {!adding && !creating && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 h-6 px-2 rounded-md text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent border border-border transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add contact
          </button>
        )}
      </div>

      {adding && (
        <div className="mb-3">
          <AddContactForm onAdd={handleAdd} onCancel={() => setAdding(false)} />
        </div>
      )}

      {creating && (
        <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Generating personalized outreach…
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : referrals.length === 0 && !adding && !creating ? (
        <p className="text-xs text-muted-foreground/50 italic">
          No contacts added yet. Know someone at {jobCompany}?
        </p>
      ) : (
        <div className="space-y-2">
          {referrals.map((r) => (
            <ReferralCard
              key={r.id}
              referral={r}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
