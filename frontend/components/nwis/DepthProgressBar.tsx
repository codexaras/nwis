"use client";
import { scaleLinear } from "d3-scale";

import { fmtDepth } from "@/lib/format";
import { colors, formationColor, type FormationName, type Severity } from "@/lib/tokens";
import { cn } from "@/lib/utils";

import { severityTone } from "./SeverityBadge";

interface Band {
  name: string;
  top_m: number;
  base_m: number;
  color?: string | null;
}

interface Marker {
  depth_m: number;
  severity: Severity | string;
  label?: string;
}

interface Props {
  formations: Band[];
  currentDepth: number;
  plannedTd: number;
  /** offset-event markers (depth along this well) */
  markers?: Marker[];
  /** look-ahead window drawn ahead of the bit (m) */
  lookaheadM?: number;
  height?: number;
  className?: string;
}

/** Horizontal well-path strip: formation bands, bit position, look-ahead window and offset-risk markers. */
export function DepthProgressBar({ formations, currentDepth, plannedTd, markers = [], lookaheadM = 150, height = 48, className }: Props) {
  const width = 1000; // viewBox units; scales to container width
  const x = scaleLinear().domain([0, plannedTd]).range([0, width]);
  const bandTop = 16;
  const bandH = height - 28;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={cn("block h-auto w-full", className)} style={{ height }} aria-hidden>
      {formations.map((f) => {
        const x0 = x(f.top_m);
        const x1 = x(Math.min(f.base_m, plannedTd));
        const drilled = Math.min(x1, x(currentDepth));
        const fill = formationColor[f.name as FormationName] ?? f.color ?? colors.dim;
        return (
          <g key={f.name}>
            <rect x={x0} y={bandTop} width={Math.max(0, x1 - x0)} height={bandH} fill={fill} opacity={0.22} />
            {drilled > x0 && <rect x={x0} y={bandTop} width={drilled - x0} height={bandH} fill={fill} opacity={0.55} />}
            <line x1={x1} x2={x1} y1={bandTop} y2={bandTop + bandH} stroke={colors.bg} strokeWidth={2} />
            {x1 - x0 > 70 && (
              <text x={x0 + 6} y={bandTop + bandH / 2 + 4} fontSize={11.5} fontFamily="var(--font-jetbrains), monospace" letterSpacing={1} fill={colors.text} opacity={0.9}>
                {f.name.toUpperCase()}
              </text>
            )}
          </g>
        );
      })}
      {/* look-ahead window */}
      <rect x={x(currentDepth)} y={bandTop} width={Math.max(0, x(Math.min(plannedTd, currentDepth + lookaheadM)) - x(currentDepth))} height={bandH} fill={colors.amber} opacity={0.12} />
      {/* markers */}
      {markers.map((m, i) => {
        const mx = x(Math.min(plannedTd, m.depth_m));
        const tone = severityTone(m.severity);
        const passed = m.depth_m < currentDepth;
        return <polygon key={i} points={`${mx},${bandTop + bandH + 2} ${mx - 4},${bandTop + bandH + 9} ${mx + 4},${bandTop + bandH + 9}`} fill={tone} opacity={passed ? 0.35 : 0.95} />;
      })}
      {/* bit */}
      <line x1={x(currentDepth)} x2={x(currentDepth)} y1={5} y2={bandTop + bandH + 2} stroke={colors.amber} strokeWidth={2} />
      <circle cx={x(currentDepth)} cy={5} r={3} fill={colors.amber} />
      <text x={Math.min(width - 4, x(currentDepth) + 7)} y={11} fontSize={11.5} fontFamily="var(--font-jetbrains), monospace" fill={colors.amber} textAnchor={x(currentDepth) > width - 140 ? "end" : "start"} dx={x(currentDepth) > width - 140 ? -14 : 0}>
        BIT {fmtDepth(currentDepth).toUpperCase()}
      </text>
      {/* scale labels sit above the band so they never collide with markers below it */}
      <text x={width - 2} y={11} fontSize={10.5} fontFamily="var(--font-jetbrains), monospace" fill={colors.muted} textAnchor="end">
        TD {fmtDepth(plannedTd, 0).toUpperCase()}
      </text>
      <text x={2} y={11} fontSize={10.5} fontFamily="var(--font-jetbrains), monospace" fill={colors.muted}>
        0 M
      </text>
    </svg>
  );
}
