"use client";
import { scaleLinear } from "d3-scale";
import { useId } from "react";

import { colors } from "@/lib/tokens";
import { cn } from "@/lib/utils";

interface Props {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  area?: boolean;
  showLast?: boolean;
  strokeWidth?: number;
  /** fixed y-domain; defaults to data extent with 10% padding */
  domain?: [number, number];
  /** optional reference band drawn behind the line (e.g. normal operating range) */
  band?: [number, number];
  className?: string;
}

/** Tiny custom SVG sparkline (d3-scale, no chart chrome). Used for live parameters and KPI trends. */
export function LiveSparkline({ values, width = 120, height = 32, color = colors.teal, area = true, showLast = true, strokeWidth = 1.5, domain, band, className }: Props) {
  const id = useId().replace(/:/g, "");
  const n = values.length;
  if (n === 0) return <svg width={width} height={height} className={className} />;
  const x = scaleLinear().domain([0, Math.max(1, n - 1)]).range([1, width - 3]);
  let [lo, hi] = domain ?? [Math.min(...values), Math.max(...values)];
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.12;
  const y = scaleLinear().domain([lo - pad, hi + pad]).range([height - 2, 2]);
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const areaPath = `${line} L${x(n - 1).toFixed(1)},${height} L${x(0).toFixed(1)},${height} Z`;
  const lastX = x(n - 1);
  const lastY = y(values[n - 1]);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={cn("block overflow-visible", className)} aria-hidden>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {band && <rect x={0} y={Math.min(y(band[0]), y(band[1]))} width={width} height={Math.abs(y(band[0]) - y(band[1]))} fill={colors.muted} opacity={0.08} />}
      {area && <path d={areaPath} fill={`url(#g${id})`} />}
      <path d={line} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
      {showLast && (
        <>
          <circle cx={lastX} cy={lastY} r={4.5} fill={color} opacity={0.18} className="animate-status-blink" />
          <circle cx={lastX} cy={lastY} r={2} fill={color} />
        </>
      )}
    </svg>
  );
}
