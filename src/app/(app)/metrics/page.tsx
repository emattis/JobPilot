"use client";

import { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import {
  BarChart2,
  TrendingUp,
  Target,
  Award,
  MessageSquare,
  Loader2,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { ApplicationsTodayCard } from "@/components/metrics/ApplicationsTodayCard";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  FunnelChart,
  Funnel,
  LabelList,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

// ── Types ────────────────────────────────────────────────────────────────────

interface Stats {
  totalApplications: number;
  totalApplied: number;
  responseRate: number;
  interviewRate: number;
  offerRate: number;
  responded: number;
  interviewed: number;
  offered: number;
}

interface FunnelStage {
  stage: string;
  count: number;
  fill?: string;
}

interface WeekData {
  week: string;
  count: number;
}

interface SourceData {
  source: string;
  total: number;
  responded: number;
  rate: number;
}

interface SkillGap {
  skill: string;
  count: number;
}

interface DailyActivity {
  day: string;
  count: number;
}

interface MetricsData {
  stats: Stats;
  funnel: FunnelStage[];
  appsPerWeek: WeekData[];
  sourceEffectiveness: SourceData[];
  skillGaps: SkillGap[];
  dailyActivity: DailyActivity[];
}

interface SummaryData {
  summary: string;
  weekStats: { applied: number; analyzed: number; avgFitScore: number | null };
}

// ── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  subtitle,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-3xl font-bold tracking-tight">{value}</p>
      {subtitle && (
        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      )}
    </div>
  );
}

// ── Funnel colors ────────────────────────────────────────────────────────────

const FUNNEL_COLORS = ["#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#22c55e"];

// ── Main Page ────────────────────────────────────────────────────────────────

export default function MetricsPage() {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);

  useEffect(() => {
    fetch("/api/metrics")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setMetrics(d.data);
      })
      .finally(() => setLoading(false));

    fetch("/api/metrics/summary")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setSummary(d.data);
      })
      .finally(() => setSummaryLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-8">
        <div>
          <div className="h-7 bg-muted rounded w-40 mb-2 animate-pulse" />
          <div className="h-4 bg-muted rounded w-72 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5 animate-pulse">
              <div className="h-3 bg-muted rounded w-20 mb-4" />
              <div className="h-8 bg-muted rounded w-16 mb-1" />
              <div className="h-3 bg-muted rounded w-32" />
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-border bg-card p-5 animate-pulse h-28" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5 animate-pulse h-[340px]" />
          ))}
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="p-8 max-w-5xl mx-auto">
        <p className="text-muted-foreground">Failed to load metrics.</p>
      </div>
    );
  }

  const { stats, funnel, appsPerWeek, sourceEffectiveness, skillGaps, dailyActivity } = metrics;
  const todayCount = dailyActivity[dailyActivity.length - 1]?.count ?? 0;
  const yesterdayCount = dailyActivity[dailyActivity.length - 2]?.count ?? 0;

  const funnelData: FunnelStage[] = funnel.map((f, i) => ({
    ...f,
    fill: FUNNEL_COLORS[i] ?? FUNNEL_COLORS[0],
  }));

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6 md:space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
          <BarChart2 className="w-6 h-6 text-primary" />
          Metrics
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track your job search performance and identify areas for improvement.
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Applied"
          value={stats.totalApplied}
          subtitle={`${stats.totalApplications} total tracked`}
          icon={TrendingUp}
          color="bg-blue-500/10 text-blue-400"
        />
        <StatCard
          label="Response Rate"
          value={`${stats.responseRate}%`}
          subtitle={`${stats.responded} of ${stats.totalApplied} got responses`}
          icon={MessageSquare}
          color="bg-emerald-500/10 text-emerald-400"
        />
        <StatCard
          label="Interview Rate"
          value={`${stats.interviewRate}%`}
          subtitle={`${stats.interviewed} reached interview stage`}
          icon={Target}
          color="bg-violet-500/10 text-violet-400"
        />
        <StatCard
          label="Offer Rate"
          value={`${stats.offerRate}%`}
          subtitle={`${stats.offered} offer${stats.offered !== 1 ? "s" : ""} received`}
          icon={Award}
          color="bg-amber-500/10 text-amber-400"
        />
      </div>

      {/* Applications Today */}
      <ApplicationsTodayCard
        todayCount={todayCount}
        yesterdayCount={yesterdayCount}
        dailyCounts={dailyActivity.map((d) => d.count)}
      />

      {/* AI Weekly Summary */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Weekly Summary
          </h2>
        </div>
        {summaryLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Generating AI summary...
          </div>
        ) : summary ? (
          <div>
            <p className="text-sm leading-relaxed text-foreground/90">
              {summary.summary}
            </p>
            <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
              <span>{summary.weekStats.applied} applied this week</span>
              <span>{summary.weekStats.analyzed} jobs analyzed</span>
              {summary.weekStats.avgFitScore !== null && (
                <span>Avg fit: {summary.weekStats.avgFitScore}%</span>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground/60 italic">
            Could not generate summary.
          </p>
        )}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Funnel */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Application Funnel
          </h2>
          {funnelData.every((f) => f.count === 0) ? (
            <EmptyChart message="No applications to show in funnel" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <FunnelChart>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Funnel dataKey="count" data={funnelData} isAnimationActive>
                  <LabelList
                    position="right"
                    fill="hsl(var(--muted-foreground))"
                    fontSize={12}
                    dataKey="stage"
                  />
                  <LabelList
                    position="center"
                    fill="#fff"
                    fontSize={14}
                    fontWeight={600}
                    dataKey="count"
                  />
                  {funnelData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Funnel>
              </FunnelChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Applications per week */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Applications per Week
          </h2>
          {appsPerWeek.length === 0 ? (
            <EmptyChart message="No application history yet" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={appsPerWeek}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(v: string) => format(parseISO(v), "MMM d")}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  labelFormatter={(v) =>
                    `Week of ${format(parseISO(String(v)), "MMM d, yyyy")}`
                  }
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ fill: "#3b82f6", r: 4 }}
                  name="Applications"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Source effectiveness */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Source Effectiveness
          </h2>
          {sourceEffectiveness.length === 0 ? (
            <EmptyChart message="No source data yet" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={sourceEffectiveness} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                  type="category"
                  dataKey="source"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  width={80}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(value, name) => {
                    if (name === "Response Rate") return [`${value}%`, name];
                    return [value, String(name)];
                  }}
                />
                <Bar dataKey="total" fill="#3b82f6" name="Total Applied" radius={[0, 4, 4, 0]} />
                <Bar dataKey="responded" fill="#22c55e" name="Responded" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
          {/* Rate labels below chart */}
          {sourceEffectiveness.length > 0 && (
            <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-border/50">
              {sourceEffectiveness.map((s) => (
                <span key={s.source} className="text-xs text-muted-foreground">
                  <span className="capitalize font-medium text-foreground/80">{s.source}</span>
                  {" "}{s.rate}% response rate
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Skill gap analysis */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            Top Skill Gaps
          </h2>
          {skillGaps.length === 0 ? (
            <EmptyChart message="Analyze more jobs to see skill gaps" />
          ) : (
            <div className="space-y-2.5">
              {skillGaps.map((gap, i) => {
                const maxCount = skillGaps[0].count;
                const pct = Math.round((gap.count / maxCount) * 100);
                return (
                  <div key={gap.skill} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-4 text-right shrink-0">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium capitalize truncate">
                          {gap.skill}
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0 ml-2">
                          {gap.count} job{gap.count !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-400/70 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-[280px] text-sm text-muted-foreground/50 italic">
      {message}
    </div>
  );
}
