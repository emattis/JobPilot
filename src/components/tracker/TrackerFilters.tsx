"use client";

import { useState, useRef, useEffect } from "react";
import {
  Search,
  X,
  ChevronDown,
  SlidersHorizontal,
  ArrowUpDown,
} from "lucide-react";
import type { AppStatus } from "@/types/tracker";
import { COLUMNS, COLUMN_BY_STATUS } from "./constants";

// ── Types ────────────────────────────────────────────────────────────────────

export type SortField =
  | "createdAt"
  | "company"
  | "status"
  | "fitScore"
  | "daysInStage";

export interface FilterState {
  search: string;
  statuses: AppStatus[];
  sources: string[];
  dateFrom: string;
  dateTo: string;
  minFit: number;
  sortBy: SortField;
  sortDir: "asc" | "desc";
}

export const DEFAULT_FILTERS: FilterState = {
  search: "",
  statuses: [],
  sources: [],
  dateFrom: "",
  dateTo: "",
  minFit: 0,
  sortBy: "createdAt",
  sortDir: "desc",
};

export function filtersAreDefault(f: FilterState): boolean {
  return (
    f.search === "" &&
    f.statuses.length === 0 &&
    f.sources.length === 0 &&
    f.dateFrom === "" &&
    f.dateTo === "" &&
    f.minFit === 0 &&
    f.sortBy === "createdAt" &&
    f.sortDir === "desc"
  );
}

// ── Dropdown helper ──────────────────────────────────────────────────────────

function MultiDropdown({
  label,
  options,
  selected,
  onChange,
  renderOption,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (val: string[]) => void;
  renderOption?: (val: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function toggle(val: string) {
    onChange(
      selected.includes(val)
        ? selected.filter((v) => v !== val)
        : [...selected, val]
    );
  }

  const display = renderOption ?? ((v: string) => v);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-xs font-medium transition-colors whitespace-nowrap ${
          selected.length > 0
            ? "bg-primary/10 border-primary/30 text-primary"
            : "border-border text-muted-foreground hover:text-foreground hover:bg-white/5"
        }`}
      >
        {label}
        {selected.length > 0 && (
          <span className="inline-flex items-center justify-center min-w-[1.1rem] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
            {selected.length}
          </span>
        )}
        <ChevronDown className="w-3 h-3 ml-0.5" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 w-52 max-h-64 overflow-y-auto rounded-lg border border-border bg-card shadow-xl">
          {options.map((opt) => (
            <label
              key={opt}
              className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-white/5 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggle(opt)}
                className="rounded border-border"
              />
              <span className="truncate">{display(opt)}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

interface TrackerFiltersProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  availableSources: string[];
  filteredCount: number;
  totalCount: number;
}

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: "createdAt", label: "Date added" },
  { value: "company", label: "Company name" },
  { value: "status", label: "Status" },
  { value: "fitScore", label: "Fit score" },
  { value: "daysInStage", label: "Days in stage" },
];

const FIT_OPTIONS = [
  { value: 0, label: "Any" },
  { value: 40, label: "40+" },
  { value: 60, label: "60+" },
  { value: 70, label: "70+" },
  { value: 80, label: "80+" },
  { value: 90, label: "90+" },
];

export function TrackerFilters({
  filters,
  onChange,
  availableSources,
  filteredCount,
  totalCount,
}: TrackerFiltersProps) {
  const [searchLocal, setSearchLocal] = useState(filters.search);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Debounced search
  function handleSearchChange(val: string) {
    setSearchLocal(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onChange({ ...filters, search: val });
    }, 250);
  }

  // Keep local search in sync if filters are cleared externally
  useEffect(() => {
    if (filters.search !== searchLocal) setSearchLocal(filters.search);
  }, [filters.search]); // eslint-disable-line react-hooks/exhaustive-deps

  const isFiltered = !filtersAreDefault(filters);

  return (
    <div className="space-y-3">
      {/* Row 1: Search + sort */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchLocal}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search company, role, or notes..."
            className="w-full h-8 pl-8 pr-8 rounded-md border border-border bg-card text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {searchLocal && (
            <button
              onClick={() => handleSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-1 ml-auto">
          <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
          <select
            value={filters.sortBy}
            onChange={(e) =>
              onChange({ ...filters, sortBy: e.target.value as SortField })
            }
            className="h-8 rounded-md border border-border bg-card px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            onClick={() =>
              onChange({
                ...filters,
                sortDir: filters.sortDir === "asc" ? "desc" : "asc",
              })
            }
            className="h-8 w-8 rounded-md border border-border flex items-center justify-center text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
            title={filters.sortDir === "asc" ? "Ascending" : "Descending"}
          >
            {filters.sortDir === "asc" ? "↑" : "↓"}
          </button>
        </div>
      </div>

      {/* Row 2: Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground shrink-0" />

        {/* Status multi-select */}
        <MultiDropdown
          label="Status"
          options={COLUMNS.map((c) => c.status)}
          selected={filters.statuses}
          onChange={(statuses) =>
            onChange({ ...filters, statuses: statuses as AppStatus[] })
          }
          renderOption={(v) => COLUMN_BY_STATUS[v as AppStatus]?.label ?? v}
        />

        {/* Source multi-select */}
        {availableSources.length > 0 && (
          <MultiDropdown
            label="Source"
            options={availableSources}
            selected={filters.sources}
            onChange={(sources) => onChange({ ...filters, sources })}
            renderOption={(v) => v.charAt(0).toUpperCase() + v.slice(1)}
          />
        )}

        {/* Fit score */}
        <select
          value={filters.minFit}
          onChange={(e) =>
            onChange({ ...filters, minFit: Number(e.target.value) })
          }
          className={`h-8 rounded-md border px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring ${
            filters.minFit > 0
              ? "bg-primary/10 border-primary/30 text-primary"
              : "border-border bg-card text-muted-foreground"
          }`}
        >
          {FIT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              Fit: {opt.label}
            </option>
          ))}
        </select>

        {/* Date range */}
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) =>
              onChange({ ...filters, dateFrom: e.target.value })
            }
            className={`h-8 rounded-md border px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring ${
              filters.dateFrom
                ? "bg-primary/10 border-primary/30 text-primary"
                : "border-border bg-card text-muted-foreground"
            }`}
          />
          <span className="text-xs text-muted-foreground">–</span>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) =>
              onChange({ ...filters, dateTo: e.target.value })
            }
            className={`h-8 rounded-md border px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring ${
              filters.dateTo
                ? "bg-primary/10 border-primary/30 text-primary"
                : "border-border bg-card text-muted-foreground"
            }`}
          />
        </div>

        {/* Results count + clear */}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {isFiltered
              ? `Showing ${filteredCount} of ${totalCount}`
              : `${totalCount} application${totalCount !== 1 ? "s" : ""}`}
          </span>
          {isFiltered && (
            <button
              onClick={() => onChange({ ...DEFAULT_FILTERS })}
              className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
            >
              <X className="w-3 h-3" />
              Clear filters
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
