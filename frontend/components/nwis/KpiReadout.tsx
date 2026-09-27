"use client";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { ReactNode } from "react";

import { useCountUp } from "@/lib/hooks";
import { fmtNum } from "@/lib/format";
import { cn } from "@/lib/utils";

import { LiveSparkline } from "./LiveSparkline";

interface Props {
  label: ReactNode;
  value: number | string | null | undefined;
  unit?: string;
  decimals?: number;
  hint?: ReactNode;
  trend?: { direction: "up" | "down" | "flat"; text?: string; good?: boolean };
  size?: "sm" | "md" | "lg" | "hero";
  spark?: number[];
  sparkColor?: string;
  tone?: "default" | "amber" | "teal" | "critical" | "high";
  className?: string;
  loading?: boolean;
  countUp?: boolean;
}

const VALUE_SIZE = { sm: "text-hero-sm", md: "text-hero-md", lg: "text-hero-lg", hero: "text-[64px] leading-[64px]" };
const TONE = { default: "text-text", amber: "text-amber", teal: "text-teal", critical: "text-sev-critical", high: "text-sev-high" };

function AnimatedNumber({ value, decimals }: { value: number; decimals: number }) {
  const v = useCountUp(value, 650);
  return <>{fmtNum(v, decimals)}</>;
}

/** Monospace numeric readout with label, unit, optional trend and sparkline. Subtle count-up on change. */
export function KpiReadout({ label, value, unit, decimals = 0, hint, trend, size = "md", spark, sparkColor, tone = "default", className, loading, countUp = true }: Props) {
  const isNum = typeof value === "number";
  const TrendIcon = trend?.direction === "up" ? ArrowUpRight : trend?.direction === "down" ? ArrowDownRight : Minus;
  const trendTone = trend ? (trend.good === undefined ? "text-muted" : trend.good ? "text-sev-low" : "text-sev-high") : "";
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <div className="hud-label truncate">{label}</div>
      <div className="flex items-end justify-between gap-3">
        <div className={cn("num min-w-0 font-medium tabular-nums", VALUE_SIZE[size], TONE[tone], loading && "animate-pulse text-dim")}>
          {loading ? "——" : isNum ? (countUp ? <AnimatedNumber value={value} decimals={decimals} /> : fmtNum(value, decimals)) : (value ?? "—")}
          {unit && !loading && <span className={cn("ml-1 font-normal text-muted", size === "hero" ? "text-hero-sm" : size === "lg" ? "text-title" : "text-body")}>{unit}</span>}
        </div>
        {spark && spark.length > 1 && <LiveSparkline values={spark} width={size === "sm" ? 64 : 88} height={size === "sm" ? 22 : 28} color={sparkColor} className="shrink-0" />}
      </div>
      {(hint || trend) && (
        <div className="flex items-center gap-2 text-[12px] text-muted">
          {trend && (
            <span className={cn("num inline-flex items-center gap-0.5", trendTone)}>
              <TrendIcon className="h-3 w-3" />
              {trend.text}
            </span>
          )}
          {hint && <span className="truncate">{hint}</span>}
        </div>
      )}
    </div>
  );
}
