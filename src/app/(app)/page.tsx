export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db";
import {
  Briefcase,
  Zap,
  TrendingUp,
  Compass,
  ArrowRight,
  Clock,
} from "lucide-react";
import Link from "next/link";
import { ApplicationsTodayCard } from "@/components/metrics/ApplicationsTodayCard";

async function getStats() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const weekAgoStart = new Date(todayStart);
  weekAgoStart.setDate(weekAgoStart.getDate() - 6);

  const [applications, analyses, discovered, profile, recentApps] = await Promise.all([
    prisma.application.count(),
    prisma.jobAnalysis.count(),
    prisma.discoveredJob.count({ where: { dismissed: false } }),
    prisma.userProfile.findFirst({ select: { name: true } }),
    prisma.application.findMany({
      where: { appliedAt: { gte: weekAgoStart } },
      select: { appliedAt: true },
    }),
  ]);

  const applied = await prisma.application.count({
    where: { appliedAt: { not: null } },
  });
  const responded = await prisma.application.count({
    where: { responseAt: { not: null } },
  });

  // Count apps per day for the last 7 days
  const dailyCounts: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date(todayStart);
    dayStart.setDate(dayStart.getDate() - i);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const count = recentApps.filter((a) => {
      if (!a.appliedAt) return false;
      const d = new Date(a.appliedAt);
      return d >= dayStart && d < dayEnd;
    }).length;
    dailyCounts.push(count);
  }

  const todayCount = dailyCounts[6];
  const yesterdayCount = dailyCounts[5];

  return {
    applications,
    analyses,
    discovered,
    responseRate: applied > 0 ? Math.round((responded / applied) * 100) : 0,
    profileName: profile?.name ?? null,
    todayCount,
    yesterdayCount,
    dailyCounts,
  };
}

export default async function DashboardPage() {
  const stats = await getStats();
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const name = stats.profileName;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">
          {greeting}{name ? `, ${name.split(" ")[0]}` : ""}.
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Here&apos;s your job search at a glance.
        </p>
      </div>

      {/* Applications Today */}
      <div className="mb-6">
        <ApplicationsTodayCard
          todayCount={stats.todayCount}
          yesterdayCount={stats.yesterdayCount}
          dailyCounts={stats.dailyCounts}
        />
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-4 mb-8 lg:grid-cols-4">
        <StatCard
          label="Applications"
          value={stats.applications}
          icon={Briefcase}
          href="/tracker"
          color="blue"
        />
        <StatCard
          label="Analyses Run"
          value={stats.analyses}
          icon={Zap}
          href="/analyze"
          color="violet"
        />
        <StatCard
          label="Response Rate"
          value={`${stats.responseRate}%`}
          icon={TrendingUp}
          href="/metrics"
          color="green"
        />
        <StatCard
          label="Jobs in Feed"
          value={stats.discovered}
          icon={Compass}
          href="/discover"
          color="amber"
        />
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Quick actions
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <QuickAction
            href="/analyze"
            icon={Zap}
            title="Analyze a job"
            description="Paste a URL and get an AI fit score"
            color="blue"
          />
          <QuickAction
            href="/discover"
            icon={Compass}
            title="Discover jobs"
            description="Browse AI-curated opportunities"
            color="violet"
          />
          <QuickAction
            href="/resume"
            icon={Briefcase}
            title="Upload resume"
            description="Add or update your resume"
            color="amber"
          />
        </div>
      </div>

      {/* Setup Prompt */}
      {!name && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 flex items-start gap-4">
          <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
            <Clock className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Complete your profile</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Add your background, skills, and preferences so JobPilot can give
              you personalized analysis and recommendations.
            </p>
          </div>
          <Link
            href="/profile"
            className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline shrink-0"
          >
            Set up <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  href,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  href: string;
  color: "blue" | "violet" | "green" | "amber";
}) {
  const colorMap = {
    blue: "text-blue-400 bg-blue-400/10",
    violet: "text-violet-400 bg-violet-400/10",
    green: "text-green-400 bg-green-400/10",
    amber: "text-amber-400 bg-amber-400/10",
  };

  return (
    <Link
      href={href}
      className="group rounded-xl border border-border bg-card p-5 hover:border-border/80 hover:bg-card/80 transition-colors"
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorMap[color]}`}>
          <Icon className="w-4 h-4" />
        </div>
        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <p className="text-2xl font-bold font-mono tracking-tight">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </Link>
  );
}

function QuickAction({
  href,
  icon: Icon,
  title,
  description,
  color,
}: {
  href: string;
  icon: React.ElementType;
  title: string;
  description: string;
  color: "blue" | "violet" | "amber";
}) {
  const colorMap = {
    blue: "text-blue-400 bg-blue-400/10",
    violet: "text-violet-400 bg-violet-400/10",
    amber: "text-amber-400 bg-amber-400/10",
  };

  return (
    <Link
      href={href}
      className="group flex items-start gap-3.5 rounded-xl border border-border bg-card p-4 hover:border-border/80 hover:bg-card/80 transition-colors"
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${colorMap[color]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium group-hover:text-primary transition-colors">
          {title}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </Link>
  );
}
