"use client";
/** Secondary analytical view: depth (50 m bins) × event-type heatmap of risk scores 0–100. */
import { useState } from "react";

import { fmtNum } from "@/lib/format";
import { colors, formationColor, type FormationName } from "@/lib/tokens";
import type { RiskProfile } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  profile: RiskProfile;
  currentDepth: number | null;
  rowH?: number;
  className?: string;
}

function cellColor(score: number): { fill: string; opacity: number } {
  if (score < 15) return { fill: colors.surface3, opacity: 0.6 };
  if (score < 40) return { fill: colors.teal, opacity: 0.12 + (score / 40) * 0.25 };
  if (score < 60) return { fill: "#EAB308", opacity: 0.35 + ((score - 40) / 20) * 0.3 };
  if (score < 80) return { fill: "#F97316", opacity: 0.5 + ((score - 60) / 20) * 0.3 };
  return { fill: "#EF4444", opacity: 0.75 + ((score - 80) / 20) * 0.25 };
}

const LEFT = 150;
const TOPH = 34;

export function RiskHeatmap({ profile, currentDepth, rowH = 6, className }: Props) {
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const types = profile.heatmap.event_types;
  const depths = profile.heatmap.depths;
  const [width, setWidth] = useState(900);
  const colW = (width - LEFT - 8) / types.length;
  const height = TOPH + depths.length * rowH + 10;
  const yOf = (d: number) => TOPH + ((d - profile.bin_m) / profile.bin_m) * rowH;

  return (
    <div
      className={cn("relative", className)}
      ref={(el) => {
        if (el && Math.abs(el.clientWidth - width) > 2) setWidth(Math.max(640, el.clientWidth));
      }}
    >
      <svg width={width} height={height} className="block select-none" onMouseLeave={() => setHover(null)}>
        {/* column headers */}
        {types.map((t, c) => (
          <text key={t} x={LEFT + c * colW + colW / 2} y={14} fontSize={9.5} textAnchor="middle" fill={hover?.c === c ? colors.text : colors.muted} fontFamily="var(--font-jetbrains), monospace" letterSpacing={0.8}>
            {t.toUpperCase()}
          </text>
        ))}
        <text x={LEFT + (types.length * colW) / 2} y={27} fontSize={8.5} textAnchor="middle" fill={colors.dim} fontFamily="var(--font-jetbrains), monospace" letterSpacing={1}>
          SCORE 0–100 · IDW OFFSET FREQUENCY 70% + RANDOMFOREST 30%
        </text>
        {/* formation labels along the left */}
        {profile.formations.map((f) => {
          const a = yOf(Math.max(profile.bin_m, f.top_m));
          const b = yOf(Math.min(profile.planned_td_m, f.base_m));
          const fill = formationColor[f.name as FormationName] ?? f.color;
          return (
            <g key={f.name}>
              <rect x={LEFT - 66} y={a} width={6} height={Math.max(1, b - a)} fill={fill} opacity={0.85} />
              {b - a > 10 && (
                <text x={LEFT - 72} y={Math.min(b - 3, a + 10)} fontSize={9} textAnchor="end" fill={colors.muted} fontFamily="var(--font-jetbrains), monospace">
                  {f.name.toUpperCase()}
                </text>
              )}
              <line x1={LEFT - 58} x2={width - 4} y1={a} y2={a} stroke={fill} strokeWidth={1} opacity={0.5} strokeDasharray="2 3" />
            </g>
          );
        })}
        {/* depth labels */}
        {depths
          .filter((d) => d % 500 === 0)
          .map((d) => (
            <text key={d} x={LEFT - 12} y={yOf(d) + 3} fontSize={9} textAnchor="end" fill={colors.muted} fontFamily="var(--font-jetbrains), monospace">
              {fmtNum(d)}
            </text>
          ))}
        {/* cells */}
        {profile.heatmap.values.map((row, r) =>
          row.map((score, c) => {
            const { fill, opacity } = cellColor(score);
            const hot = hover?.r === r && hover?.c === c;
            return (
              <rect
                key={`${r}-${c}`}
                x={LEFT + c * colW + 1}
                y={yOf(depths[r])}
                width={colW - 2}
                height={rowH - 1}
                fill={fill}
                opacity={hot ? 1 : opacity}
                stroke={hot ? colors.text : "none"}
                strokeWidth={1}
                onMouseEnter={() => setHover({ r, c })}
              />
            );
          }),
        )}
        {currentDepth !== null && (
          <g>
            <line x1={LEFT - 58} x2={width - 4} y1={yOf(currentDepth)} y2={yOf(currentDepth)} stroke={colors.amber} strokeWidth={1.5} />
            <text x={width - 6} y={yOf(currentDepth) - 3} fontSize={9} textAnchor="end" fill={colors.amber} fontFamily="var(--font-jetbrains), monospace">
              BIT {fmtNum(currentDepth)} M
            </text>
          </g>
        )}
      </svg>
      {hover && (
        <div className="pointer-events-none absolute z-[3] rounded-md border border-border-strong bg-surface-2/95 px-2.5 py-1.5 text-[11px] shadow-card" style={{ left: Math.min(width - 190, LEFT + hover.c * colW + 8), top: Math.max(TOPH, yOf(depths[hover.r]) - 44) }}>
          <div className="num text-text">
            {fmtNum(depths[hover.r])} m · {profile.bins[hover.r]?.formation}
          </div>
          <div className="text-muted">
            {types[hover.c]} · <span className="num text-text">{Math.round(profile.heatmap.values[hover.r][hover.c])}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
