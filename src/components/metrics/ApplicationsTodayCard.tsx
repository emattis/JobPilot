"use client";

import { format, subDays } from "date-fns";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
} from "recharts";

interface Props {
  todayCount: number;
  yesterdayCount: number;
  dailyCounts: number[];
}

export function ApplicationsTodayCard({
  todayCount,
  yesterdayCount,
  dailyCounts,
}: Props) {
  const today = new Date();
  const data = dailyCounts.map((count, i) => {
    const date = subDays(today, 6 - i);
    return {
      day: format(date, "EEE"),
      count,
      // Ensure zero-count bars still render with a tiny visual height
      displayCount: Math.max(count, 0.15),
      isToday: i === 6,
    };
  });

  const maxCount = Math.max(...dailyCounts, 1);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Applications Today
          </p>
          <div className="flex items-baseline gap-3">
            <span className="text-4xl font-bold font-mono tracking-tight">
              {todayCount}
            </span>
            <span className="text-sm text-muted-foreground">
              Yesterday: {yesterdayCount}
            </span>
          </div>
        </div>
      </div>

      {/* 7-day bar chart */}
      <div className="mt-4 -mx-1">
        <ResponsiveContainer width="100%" height={120}>
          <BarChart
            data={data}
            margin={{ top: 16, right: 4, bottom: 0, left: 4 }}
            barCategoryGap="20%"
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              horizontal
              vertical={false}
            />
            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tick={{
                fontSize: 11,
                fill: "hsl(var(--muted-foreground))",
              }}
              dy={4}
            />
            <YAxis hide domain={[0, maxCount + Math.max(maxCount * 0.3, 1)]} />
            <Bar
              dataKey="displayCount"
              radius={[4, 4, 0, 0]}
              maxBarSize={36}
            >
              <LabelList
                dataKey="count"
                position="top"
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  fill: "hsl(var(--muted-foreground))",
                }}
                offset={4}
              />
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={
                    entry.isToday
                      ? "hsl(var(--primary))"
                      : "hsl(var(--primary) / 0.25)"
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[11px] text-muted-foreground mt-1">Last 7 days</p>
    </div>
  );
}
