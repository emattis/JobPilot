"use client";

import { useEffect, useState, KeyboardEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, X, Plus, Save, UserCircle } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email required"),
  phone: z.string().optional(),
  location: z.string().optional(),
  linkedinUrl: z.string().optional(),
  portfolioUrl: z.string().optional(),
  githubUrl: z.string().optional(),
  summary: z.string().optional(),
  yearsExperience: z.number().int().nonnegative().optional(),
  minSalary: z.number().int().nonnegative().optional(),
  maxSalary: z.number().int().nonnegative().optional(),
  preferRemote: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

function TagInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState("");

  function add() {
    const trimmed = input.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setInput("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add();
    }
    if (e.key === "Backspace" && !input && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  function remove(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  return (
    <div className="min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm flex flex-wrap gap-1.5 cursor-text focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ring-offset-background">
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 bg-primary/15 text-primary text-xs font-medium px-2 py-0.5 rounded-md"
        >
          {tag}
          <button
            type="button"
            onClick={() => remove(tag)}
            className="hover:text-primary/60 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input
        className="flex-1 min-w-24 bg-transparent outline-none placeholder:text-muted-foreground text-sm"
        placeholder={value.length === 0 ? placeholder : "Add more..."}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={add}
      />
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h2 className="text-sm font-semibold text-foreground mb-4">{title}</h2>
      {children}
    </div>
  );
}

function Field({
  label,
  error,
  children,
  optional,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  optional?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
        {optional && <span className="ml-1 normal-case tracking-normal text-muted-foreground/60 font-normal">optional</span>}
      </label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

const inputClass =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export default function ProfilePage() {
  const [skills, setSkills] = useState<string[]>([]);
  const [targetRoles, setTargetRoles] = useState<string[]>([]);
  const [targetCompanies, setTargetCompanies] = useState<string[]>([]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [preferredLocations, setPreferredLocations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then(({ data }) => {
        if (data) {
          reset({
            name: data.name,
            email: data.email,
            phone: data.phone ?? "",
            location: data.location ?? "",
            linkedinUrl: data.linkedinUrl ?? "",
            portfolioUrl: data.portfolioUrl ?? "",
            githubUrl: data.githubUrl ?? "",
            summary: data.summary ?? "",
            yearsExperience: data.yearsExperience ?? undefined,
            minSalary: data.minSalary ?? undefined,
            maxSalary: data.maxSalary ?? undefined,
            preferRemote: data.preferRemote,
          });
          setSkills(data.skills ?? []);
          setTargetRoles(data.targetRoles ?? []);
          setTargetCompanies(data.targetCompanies ?? []);
          setIndustries(data.industries ?? []);
          setPreferredLocations(data.preferredLocations ?? []);
        }
      })
      .finally(() => setLoading(false));
  }, [reset]);

  async function onSubmit(values: FormValues) {
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          skills,
          targetRoles,
          targetCompanies,
          industries,
          preferredLocations,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "Failed");
      toast.success("Profile saved");
    } catch {
      toast.error("Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <UserCircle className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Profile</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Your background, skills, and job preferences
            </p>
          </div>
        </div>
        <button
          form="profile-form"
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none transition-colors"
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <form id="profile-form" onSubmit={handleSubmit(onSubmit as any)} className="space-y-4">
        {/* Basic Info */}
        <SectionCard title="Basic information">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Full name" error={errors.name?.message}>
              <input
                {...register("name")}
                placeholder="Jane Smith"
                className={inputClass}
              />
            </Field>
            <Field label="Email" error={errors.email?.message}>
              <input
                {...register("email")}
                type="email"
                placeholder="jane@example.com"
                className={inputClass}
              />
            </Field>
            <Field label="Phone" optional>
              <input
                {...register("phone")}
                placeholder="+1 (555) 000-0000"
                className={inputClass}
              />
            </Field>
            <Field label="Location" optional>
              <input
                {...register("location")}
                placeholder="San Francisco, CA"
                className={inputClass}
              />
            </Field>
          </div>
        </SectionCard>

        {/* Online Presence */}
        <SectionCard title="Online presence">
          <div className="grid grid-cols-1 gap-4">
            <Field label="LinkedIn URL" optional>
              <input
                {...register("linkedinUrl")}
                placeholder="https://linkedin.com/in/yourname"
                className={inputClass}
              />
            </Field>
            <Field label="Portfolio / website" optional>
              <input
                {...register("portfolioUrl")}
                placeholder="https://yoursite.com"
                className={inputClass}
              />
            </Field>
            <Field label="GitHub URL" optional>
              <input
                {...register("githubUrl")}
                placeholder="https://github.com/yourhandle"
                className={inputClass}
              />
            </Field>
          </div>
        </SectionCard>

        {/* Summary */}
        <SectionCard title="Professional summary">
          <Field label="Summary" optional>
            <Textarea
              {...register("summary")}
              placeholder="Brief overview of your background, expertise, and what you're looking for..."
              rows={4}
              className="resize-none text-sm"
            />
          </Field>
        </SectionCard>

        {/* Skills & Experience */}
        <SectionCard title="Skills & experience">
          <div className="space-y-4">
            <Field label="Skills" optional>
              <TagInput
                value={skills}
                onChange={setSkills}
                placeholder="Type a skill and press Enter (e.g. TypeScript, React, Python)"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Press Enter or comma to add each skill
              </p>
            </Field>
            <Separator />
            <Field label="Years of experience" optional error={errors.yearsExperience?.message}>
              <input
                {...register("yearsExperience", { valueAsNumber: true })}
                type="number"
                min={0}
                max={50}
                placeholder="5"
                className={`${inputClass} w-32`}
              />
            </Field>
          </div>
        </SectionCard>

        {/* Target Roles & Companies */}
        <SectionCard title="What you're looking for">
          <div className="space-y-4">
            <Field label="Target roles" optional>
              <TagInput
                value={targetRoles}
                onChange={setTargetRoles}
                placeholder="e.g. Senior Software Engineer, Staff Engineer"
              />
            </Field>
            <Field label="Dream companies" optional>
              <TagInput
                value={targetCompanies}
                onChange={setTargetCompanies}
                placeholder="e.g. Stripe, Linear, Vercel"
              />
            </Field>
            <Field label="Industries" optional>
              <TagInput
                value={industries}
                onChange={setIndustries}
                placeholder="e.g. FinTech, Developer Tools, AI/ML"
              />
            </Field>
          </div>
        </SectionCard>

        {/* Location preferences */}
        <SectionCard title="Location preferences">
          <div className="space-y-4">
            <Field label="Preferred locations" optional>
              <TagInput
                value={preferredLocations}
                onChange={setPreferredLocations}
                placeholder='e.g. New York, San Francisco, Remote'
              />
              <p className="text-xs text-muted-foreground mt-1">
                Only jobs in these cities (or remote) will appear in your discovery feed. Leave empty to show all locations.
              </p>
            </Field>
          </div>
        </SectionCard>

        {/* Preferences */}
        <SectionCard title="Compensation & preferences">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Min salary (USD/yr)" optional error={errors.minSalary?.message}>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                    $
                  </span>
                  <input
                    {...register("minSalary", { valueAsNumber: true })}
                    type="number"
                    min={0}
                    placeholder="120000"
                    className={`${inputClass} pl-6`}
                  />
                </div>
              </Field>
              <Field label="Max salary (USD/yr)" optional error={errors.maxSalary?.message}>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                    $
                  </span>
                  <input
                    {...register("maxSalary", { valueAsNumber: true })}
                    type="number"
                    min={0}
                    placeholder="200000"
                    className={`${inputClass} pl-6`}
                  />
                </div>
              </Field>
            </div>
            <Separator />
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative">
                <input
                  {...register("preferRemote")}
                  type="checkbox"
                  className="peer sr-only"
                />
                <div className="w-9 h-5 rounded-full border border-input bg-background peer-checked:bg-primary peer-checked:border-primary transition-colors" />
                <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-muted-foreground peer-checked:translate-x-4 peer-checked:bg-white transition-all" />
              </div>
              <div>
                <p className="text-sm font-medium">Prefer remote</p>
                <p className="text-xs text-muted-foreground">
                  Prioritize remote-friendly roles in analysis and discovery
                </p>
              </div>
            </label>
          </div>
        </SectionCard>
      </form>

      {/* Mobile save button */}
      <div className="mt-6 flex justify-end">
        <button
          form="profile-form"
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none transition-colors"
        >
          {saving ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Plus className="w-3.5 h-3.5" />
              Save profile
            </>
          )}
        </button>
      </div>
    </div>
  );
}
