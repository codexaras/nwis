"use client";
/**
 * Forward Drilling Risk Window: a vertical track starting at CURRENT BIT, formations ahead, predicted
 * risk zones as glowing-but-restrained bands ("3,050 m — TORQUE SPIKE — BARAIL — HIGH · 72%"), SAFE intervals
 * between, and a risk-intensity strip. Zones that overlap in depth are laid out side by side (like overlapping
 * calendar events) so every band and label stays legible. Not a spreadsheet heatmap (that lives below).
 */
import { scaleLinear } from "d3-scale";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { fmtDepth, fmtNum } from "@/lib/format";
import { colors, formationColor, type FormationName } from "@/lib/tokens";
import type { RiskProfile, RiskZone } from "@/lib/types";
import { cn } from "@/lib/utils";

export const LEVEL_COLOR: Record<string, string> = { Critical: "#EF4444", High: "#F97316", Medium: "#EAB308", Low: "#22C55E", Safe: colors.teal };

export function zoneKey(z: RiskZone) {
  return `${z.event_type}-${z.formation}-${z.depth_from_m}`;
}

interface Props {
  profile: RiskProfile;
  zones: RiskZone[];
  currentDepth: number | null;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  height?: number;
  className?: string;
}

const RULER_W = 60;
const FORM_W = 96;
const STRIP_W = 96;
const TOP = 34;
const BOTTOM = 14;
const MONO = "var(--font-jetbrains), monospace";
const OUTLINE = { stroke: "#0B0F14", strokeWidth: 3, paintOrder: "stroke" as const, strokeLinejoin: "round" as const };

export function ForwardRiskWindow({ profile, zones, currentDepth, selectedKey, onSelect, height = 620, className }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(760);
  const [hoverY, setHoverY] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(640, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const from = currentDepth !== null ? Math.max(0, currentDepth - 60) : 0;
  const to = profile.planned_td_m;
  const y = useMemo(() => scaleLinear().domain([from, to]).range([TOP, height - BOTTOM]), [from, to, height]);
  const laneX0 = RULER_W + FORM_W;
  const laneX1 = width - STRIP_W - 12;
  const laneW = laneX1 - laneX0;
  const xScore = scaleLinear().domain([0, 100]).range([laneX1 + 10, width - 4]);

  const gridStep = to - from > 1500 ? 250 : 100;
  const gridDepths: number[] = [];
  for (let d = Math.ceil(from / gridStep) * gridStep; d <= to; d += gridStep) gridDepths.push(d);

  const bins = profile.bins.filter((b) => b.depth_m >= from && b.depth_m <= to);
  const intensityPath = bins.length ? bins.map((b, i) => `${i ? "L" : "M"}${xScore(b.top_score).toFixed(1)},${y(b.depth_m).toFixed(1)}`).join(" ") : "";
  const intensityArea = bins.length ? `${intensityPath} L${xScore(0)},${y(bins[bins.length - 1].depth_m).toFixed(1)} L${xScore(0)},${y(bins[0].depth_m).toFixed(1)} Z` : "";
  const safe = profile.safe_intervals.filter((s) => s.depth_to_m > from && s.depth_from_m < to);
  const hoverBin = hoverY !== null ? bins.reduce<(typeof bins)[number] | null>((best, b) => (best === null || Math.abs(y(b.depth_m) - hoverY) < Math.abs(y(best.depth_m) - hoverY) ? b : best), null) : null;

  // lane assignment for overlapping zones
  const { laneOf, laneCount } = useMemo(() => {
    const lanes: RiskZone[][] = [];
    const laneOf = new Map<string, number>();
    [...zones]
      .sort((a, b) => a.depth_from_m - b.depth_from_m || b.score - a.score)
      .forEach((z) => {
        let i = lanes.findIndex((l) => l[l.length - 1].depth_to_m <= z.depth_from_m + 1);
        if (i < 0) {
          lanes.push([z]);
          i = lanes.length - 1;
        } else lanes[i].push(z);
        laneOf.set(zoneKey(z), i);
      });
    return { laneOf, laneCount: Math.max(1, lanes.length) };
  }, [zones]);
  const bandW = (laneW - 8) / laneCount;
  const topKey = zones[0] ? zoneKey(zones[0]) : null;
  const ordered = [...zones].sort((a, b) => (zoneKey(a) === selectedKey ? 1 : 0) - (zoneKey(b) === selectedKey ? 1 : 0));

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <svg
        width={width}
        height={height}
        className="block select-none"
        onMouseMove={(ev) => {
          const r = ev.currentTarget.getBoundingClientRect();
          const yy = ev.clientY - r.top;
          setHoverY(yy >= TOP && yy <= height - BOTTOM ? yy : null);
        }}
        onMouseLeave={() => setHoverY(null)}
        onClick={() => onSelect(null)}
      >
        <defs>
          <filter id="risk-glow" x="-10%" y="-40%" width="120%" height="180%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <linearGradient id="risk-intensity" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={colors.amber} stopOpacity="0" />
            <stop offset="100%" stopColor={colors.amber} stopOpacity="0.45" />
          </linearGradient>
        </defs>

        {/* lane background + grid */}
        <rect x={laneX0} y={TOP} width={laneW} height={height - TOP - BOTTOM} fill={colors.bg} opacity={0.35} />
        {gridDepths.map((d) => (
          <g key={d}>
            <line x1={RULER_W} x2={width - 4} y1={y(d)} y2={y(d)} stroke={colors.border} strokeWidth={1} opacity={0.5} />
            <text x={RULER_W - 8} y={y(d) + 3.5} fontSize={10} textAnchor="end" fill={colors.muted} fontFamily={MONO}>
              {fmtNum(d)}
            </text>
          </g>
        ))}

        {/* formations ahead */}
        {profile.formations
          .filter((f) => f.base_m > from && f.top_m < to)
          .map((f) => {
            const top = y(Math.max(from, f.top_m));
            const h = Math.max(1, y(Math.min(to, f.base_m)) - top);
            const fill = formationColor[f.name as FormationName] ?? f.color;
            return (
              <g key={f.name}>
                <rect x={RULER_W} y={top} width={FORM_W} height={h} fill={fill} opacity={0.75} />
                <line x1={RULER_W} x2={width - 4} y1={y(f.top_m)} y2={y(f.top_m)} stroke={fill} strokeWidth={1} strokeDasharray="2 3" opacity={0.7} />
                {h > 14 && (
                  <text x={RULER_W + 6} y={top + 12} fontSize={9.5} fontWeight={600} fill={colors.text} fontFamily={MONO} letterSpacing={0.8} {...OUTLINE}>
                    {f.name.toUpperCase()}
                  </text>
                )}
                {h > 28 && (
                  <text x={RULER_W + 6} y={top + 24} fontSize={8.5} fill={colors.text} opacity={0.85} fontFamily={MONO} {...OUTLINE}>
                    {fmtNum(f.top_m)} m
                  </text>
                )}
              </g>
            );
          })}

        {/* safe intervals */}
        {safe.map((s) => {
          const a = y(Math.max(from, s.depth_from_m));
          const b = y(Math.min(to, s.depth_to_m));
          if (b - a < 14) return null;
          return (
            <g key={s.depth_from_m}>
              <line x1={laneX0 + 8} x2={laneX1 - 8} y1={a + 1} y2={a + 1} stroke={colors.teal} strokeWidth={1} strokeDasharray="2 4" opacity={0.45} />
              <line x1={laneX0 + 8} x2={laneX1 - 8} y1={b - 1} y2={b - 1} stroke={colors.teal} strokeWidth={1} strokeDasharray="2 4" opacity={0.45} />
              <text x={(laneX0 + laneX1) / 2} y={(a + b) / 2 + 3.5} fontSize={9.5} textAnchor="middle" fill={colors.teal} opacity={0.8} fontFamily={MONO} letterSpacing={1.5}>
                SAFE · {fmtNum(s.depth_from_m)}–{fmtNum(s.depth_to_m)} M
              </text>
            </g>
          );
        })}

        {/* risk zones (side-by-side lanes when they overlap) */}
        {ordered.map((z) => {
          const key = zoneKey(z);
          const tone = LEVEL_COLOR[z.level] ?? colors.amber;
          const a = y(Math.max(from, z.depth_from_m));
          const b = y(Math.min(to, z.depth_to_m));
          const h = Math.max(6, b - a);
          const lane = laneOf.get(key) ?? 0;
          const x = laneX0 + 4 + lane * bandW;
          const w = bandW - 4;
          const selected = selectedKey === key;
          const dim = selectedKey !== null && !selected;
          const glow = selected || (selectedKey === null && key === topKey);
          const wide = w >= 330;
          const mid = w >= 170;
          const line1 = wide ? `${fmtNum(z.depth_m)} m — ${z.event_type.toUpperCase()} — ${z.formation.toUpperCase()} — ${z.level.toUpperCase()} · ${Math.round(z.score)}%` : mid ? `${z.event_type.toUpperCase()} — ${z.level.toUpperCase()} · ${Math.round(z.score)}%` : `${z.event_type.toUpperCase()}`;
          const line2 = wide ? `${z.evidence_count} offset event${z.evidence_count === 1 ? "" : "s"} · nearest ${z.nearest_offset_km?.toFixed(1) ?? "—"} km · ${z.high_severity_count} high-severity` : mid ? `${fmtNum(z.depth_m)} m · ${z.formation.toUpperCase()} · ${z.evidence_count} ev` : `${z.level.toUpperCase()} ${Math.round(z.score)}% · ${fmtNum(z.depth_m)} m`;
          const labelY = h >= 18 ? a + Math.min(h / 2 + 4, 14) : a - 4;
          return (
            <g
              key={key}
              className="cursor-pointer"
              onClick={(ev) => {
                ev.stopPropagation();
                onSelect(selected ? null : key);
              }}
              opacity={dim ? 0.5 : 1}
            >
              {glow && <rect x={x} y={a} width={w} height={h} fill={tone} opacity={0.35} filter="url(#risk-glow)" />}
              <rect x={x} y={a} width={w} height={h} fill={tone} opacity={selected ? 0.3 : 0.16} stroke={tone} strokeWidth={selected ? 1.6 : 1} strokeOpacity={selected ? 1 : 0.7} rx={2} />
              <line x1={x} x2={x} y1={a} y2={a + h} stroke={tone} strokeWidth={3} />
              <text x={x + 10} y={labelY} fontSize={wide ? 11 : 10} fontWeight={600} fill={colors.text} fontFamily={MONO} letterSpacing={0.6} {...OUTLINE}>
                {line1}
              </text>
              {h >= 34 && (
                <text x={x + 10} y={labelY + 14} fontSize={9.5} fill={colors.muted} fontFamily={MONO} {...OUTLINE}>
                  {line2}
                </text>
              )}
              {selected && <rect x={x - 2} y={a - 2} width={w + 4} height={h + 4} fill="none" stroke={colors.text} strokeWidth={1} strokeDasharray="3 3" rx={3} />}
            </g>
          );
        })}

        {/* intensity strip */}
        <text x={xScore(0)} y={TOP - 18} fontSize={9} fill={colors.dim} fontFamily={MONO} letterSpacing={1}>
          RISK INTENSITY
        </text>
        <text x={xScore(0)} y={TOP - 7} fontSize={9} fill={colors.dim} fontFamily={MONO}>
          0
        </text>
        <text x={xScore(100)} y={TOP - 7} fontSize={9} textAnchor="end" fill={colors.dim} fontFamily={MONO}>
          100
        </text>
        <line x1={xScore(0)} x2={xScore(0)} y1={TOP} y2={height - BOTTOM} stroke={colors.border} />
        {[40, 60, 80].map((v) => (
          <line key={v} x1={xScore(v)} x2={xScore(v)} y1={TOP} y2={height - BOTTOM} stroke={LEVEL_COLOR[v === 80 ? "Critical" : v === 60 ? "High" : "Medium"]} strokeWidth={1} strokeDasharray="1 4" opacity={0.5} />
        ))}
        <path d={intensityArea} fill="url(#risk-intensity)" />
        <path d={intensityPath} fill="none" stroke={colors.amber} strokeWidth={1.4} />

        {/* current bit */}
        {currentDepth !== null && (
          <g>
            <rect x={RULER_W} y={TOP} width={width - RULER_W - 4} height={Math.max(0, y(currentDepth) - TOP)} fill={colors.bg} opacity={0.5} />
            <line x1={RULER_W} x2={width - 4} y1={y(currentDepth)} y2={y(currentDepth)} stroke={colors.amber} strokeWidth={2} />
            <rect x={laneX0 + 4} y={y(currentDepth) - 20} width={188} height={16} rx={3} fill={colors.amber} />
            <text x={laneX0 + 10} y={y(currentDepth) - 8.5} fontSize={10} fontWeight={700} fill="#0B0F14" fontFamily={MONO} letterSpacing={0.8}>
              CURRENT BIT · {fmtDepth(currentDepth).toUpperCase()}
            </text>
            <polygon points={`${laneX0 - 2},${y(currentDepth) - 5} ${laneX0 - 2},${y(currentDepth) + 5} ${laneX0 + 6},${y(currentDepth)}`} fill={colors.amber} />
          </g>
        )}
        {/* TD */}
        <line x1={RULER_W} x2={width - 4} y1={y(to)} y2={y(to)} stroke={colors.muted} strokeWidth={1.5} />
        <text x={width - 6} y={y(to) - 4} fontSize={9.5} textAnchor="end" fill={colors.muted} fontFamily={MONO}>
          PLANNED TD {fmtNum(to)} M
        </text>

        {/* crosshair */}
        {hoverY !== null && hoverBin && (
          <g pointerEvents="none">
            <line x1={RULER_W} x2={width - 4} y1={hoverY} y2={hoverY} stroke={colors.text} strokeWidth={1} opacity={0.55} />
            <rect x={2} y={hoverY - 8} width={RULER_W - 6} height={16} rx={3} fill={colors.text} />
            <text x={RULER_W / 2 - 2} y={hoverY + 3.5} fontSize={10} fontWeight={600} textAnchor="middle" fill="#0B0F14" fontFamily={MONO}>
              {fmtNum(y.invert(hoverY))}
            </text>
            <rect x={laneX1 - 214} y={hoverY - 20} width={206} height={16} rx={3} fill={colors.surface} stroke={colors.border} />
            <text x={laneX1 - 111} y={hoverY - 8.5} fontSize={9.5} textAnchor="middle" fill={colors.text} fontFamily={MONO}>
              {hoverBin.formation.toUpperCase()} · {hoverBin.top_type.toUpperCase()} {Math.round(hoverBin.top_score)}%
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
