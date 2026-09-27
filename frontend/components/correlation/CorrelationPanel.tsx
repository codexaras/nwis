"use client";
/**
 * Offset Well Correlation — 2–5 stratigraphic columns side by side on one shared depth scale,
 * equivalent formation tops joined by curved correlation lines with translucent cross-section fills, optional
 * casing-shoe / cement-top overlay and incident markers. Hovering a formation highlights it in every well;
 * hovering an event highlights equivalent events (same type, same formation). Optional datum flattening.
 * Responsive: column and gap widths derive from the container width, so all wells stay in view.
 */
import { scaleLinear } from "d3-scale";
import { AnimatePresence, motion } from "framer-motion";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { EVENT_CODE } from "@/components/depth-track/DepthTrack";
import { LITHOLOGY_PATTERN, LithologyDefs } from "@/components/depth-track/patterns";
import { SeverityBadge } from "@/components/nwis/SeverityBadge";
import { fmtDepth, fmtNum } from "@/lib/format";
import { colors, formationColor, severityColor, type FormationName, type Severity } from "@/lib/tokens";
import type { CorrelationResponse, DrillingEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

const FORMATION_ABBREV: Record<string, string> = { Alluvium: "ALV", Namsang: "NMS", Dhekiajuli: "DHK", Girujan: "GRJ", Tipam: "TPM", Barail: "BRL", Kopili: "KPL", Sylhet: "SYL", Langpar: "LNP", Basement: "BSM" };
const MONO = "var(--font-jetbrains), monospace";
const OUTLINE = { stroke: "#0B0F14", strokeWidth: 3, paintOrder: "stroke" as const, strokeLinejoin: "round" as const };

interface Props {
  data: CorrelationResponse;
  showCasing: boolean;
  showEvents: boolean;
  showFills: boolean;
  /** formation name to flatten on (tops aligned horizontally), or null */
  datum: string | null;
  height?: number;
  activeWellId?: string;
  className?: string;
  onHoverFormation?: (name: string | null) => void;
}

const RULER = 58;
const RIGHT = 20;
const TOP = 46;
const BOTTOM = 18;
const GUTTER = 44; // casing strings + shoe labels drawn beside each column (well-schematic style)

export function CorrelationPanel({ data, showCasing, showEvents, showFills, datum, height = 640, activeWellId, className, onHoverFormation }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(880);
  const [hoverFormation, setHoverFormationState] = useState<string | null>(null);
  const [hoverEvent, setHoverEvent] = useState<DrillingEvent | null>(null);
  const [hoverY, setHoverY] = useState<number | null>(null);
  const setHoverFormation = (n: string | null) => {
    setHoverFormationState(n);
    onHoverFormation?.(n);
  };
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(560, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const wells = data.wells;
  const n = wells.length;
  const LEFT = RULER + (showCasing ? GUTTER : 0);
  const avail = width - LEFT - RIGHT;
  const minGap = showCasing ? GUTTER + 12 : 48;
  const colW = Math.max(92, Math.min(150, (avail - Math.max(0, n - 1) * minGap) / n));
  const gapW = n > 1 ? Math.max(minGap, (avail - n * colW) / (n - 1)) : 0;
  const svgW = Math.max(width, LEFT + n * colW + Math.max(0, n - 1) * gapW + RIGHT);

  // datum flattening: shift each column so the datum top sits at the first column's datum top
  const shifts = useMemo(() => {
    if (!datum) return wells.map(() => 0);
    const ref = wells[0]?.formations.find((f) => f.name === datum)?.top_m;
    return wells.map((w) => {
      const t = w.formations.find((f) => f.name === datum)?.top_m;
      return ref !== undefined && t !== undefined ? t - ref : 0;
    });
  }, [wells, datum]);
  const domainMin = Math.min(0, ...wells.map((_, i) => 0 - shifts[i]));
  const domainMax = Math.max(...wells.map((w, i) => w.total_depth_m - shifts[i]), 100);
  const y = useMemo(() => scaleLinear().domain([domainMin, domainMax]).range([TOP, height - BOTTOM]), [domainMin, domainMax, height]);
  const colX = (i: number) => LEFT + i * (colW + gapW);
  const yAt = (i: number, depth: number) => y(depth - shifts[i]);

  const gridStep = domainMax - domainMin > 3000 ? 500 : 250;
  const gridDepths: number[] = [];
  for (let d = Math.ceil(domainMin / gridStep) * gridStep; d <= domainMax; d += gridStep) gridDepths.push(d);

  const curve = (x0: number, y0: number, x1: number, y1: number) => `C${(x0 + (x1 - x0) / 2).toFixed(1)},${y0.toFixed(1)} ${(x0 + (x1 - x0) / 2).toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  const equivalents = (e: DrillingEvent) => hoverEvent && hoverEvent.id !== e.id && hoverEvent.event_type === e.event_type && hoverEvent.formation === e.formation;
  const textX = 6;

  return (
    <div ref={wrapRef} className={cn("relative overflow-x-auto", className)}>
      <svg
        width={svgW}
        height={height}
        className="block select-none"
        onMouseMove={(ev) => {
          const r = ev.currentTarget.getBoundingClientRect();
          const yy = ev.clientY - r.top;
          setHoverY(yy >= TOP && yy <= height - BOTTOM ? yy : null);
        }}
        onMouseLeave={() => {
          setHoverY(null);
          setHoverFormation(null);
          setHoverEvent(null);
        }}
      >
        <LithologyDefs />
        <defs>
          <filter id="corr-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>

        {/* depth grid + ruler */}
        {gridDepths.map((d) => (
          <g key={d}>
            <line x1={RULER - 6} x2={svgW - 12} y1={y(d)} y2={y(d)} stroke={colors.border} strokeWidth={1} opacity={0.5} />
            <text x={RULER - 10} y={y(d) + 3.5} fontSize={10} textAnchor="end" fill={colors.muted} fontFamily={MONO}>
              {fmtNum(d)}
            </text>
          </g>
        ))}
        <text x={RULER - 10} y={TOP - 30} fontSize={9} textAnchor="end" fill={colors.dim} fontFamily={MONO} letterSpacing={1}>
          {datum ? `M · DATUM ${datum.toUpperCase()}` : "M MD"}
        </text>

        {/* cross-section fills + correlation lines between adjacent columns */}
        {wells.slice(0, -1).map((w, i) => {
          const next = wells[i + 1];
          const xr = colX(i) + colW;
          const xl = colX(i + 1);
          return data.formation_order.map((name) => {
            const a = w.formations.find((f) => f.name === name);
            const b = next.formations.find((f) => f.name === name);
            if (!a || !b) return null;
            const fill = formationColor[name as FormationName] ?? colors.dim;
            const hot = hoverFormation === name;
            const ta = yAt(i, a.top_m);
            const tb = yAt(i + 1, b.top_m);
            const ba = yAt(i, a.base_m);
            const bb = yAt(i + 1, b.base_m);
            const fillPath = `M${xr},${ta.toFixed(1)} ${curve(xr, ta, xl, tb)} L${xl},${bb.toFixed(1)} ${curve(xl, bb, xr, ba)} Z`;
            const linePath = `M${xr},${ta.toFixed(1)} ${curve(xr, ta, xl, tb)}`;
            return (
              <g key={`${w.id}-${name}`} onMouseEnter={() => setHoverFormation(name)} onMouseLeave={() => setHoverFormation(null)}>
                {showFills && <path d={fillPath} fill={fill} opacity={hot ? 0.42 : 0.16} className="transition-opacity duration-200" />}
                <path d={linePath} fill="none" stroke={fill} strokeWidth={hot ? 2 : 1.2} opacity={hot ? 1 : 0.7} className="transition-all duration-200" />
                {hot && (
                  <text x={(xr + xl) / 2} y={(ta + tb) / 2 - 5} fontSize={9.5} textAnchor="middle" fill={colors.text} fontFamily={MONO} {...OUTLINE}>
                    {b.top_m - a.top_m >= 0 ? "+" : ""}
                    {fmtNum(b.top_m - a.top_m)} m
                  </text>
                )}
              </g>
            );
          });
        })}

        {/* columns */}
        <AnimatePresence initial={false}>
          {wells.map((w, i) => {
            const x = colX(i);
            const isActive = w.id === activeWellId || w.is_active;
            const meta = isActive ? "ACTIVE · DRILLING" : [w.field.toUpperCase(), w.distance_km !== undefined && w.distance_km !== null ? `${w.distance_km.toFixed(1)} KM ${w.bearing ?? ""}`.trim() : ""].filter(Boolean).join(" · ");
            return (
              <motion.g key={w.id} initial={{ opacity: 0, x: x + 24 }} animate={{ opacity: 1, x }} exit={{ opacity: 0, x: x - 24 }} transition={{ duration: 0.3, ease: "easeOut" }}>
                {/* header */}
                <text x={colW / 2} y={16} fontSize={13} fontWeight={600} textAnchor="middle" fill={isActive ? colors.amber : colors.text} fontFamily={MONO}>
                  {w.id}
                </text>
                <text x={colW / 2} y={30} fontSize={9} textAnchor="middle" fill={colors.muted} fontFamily={MONO} letterSpacing={0.8}>
                  {meta}
                </text>
                {/* formations */}
                {w.formations.map((f) => {
                  const top = yAt(i, f.top_m);
                  const h = Math.max(1, yAt(i, f.base_m) - top);
                  const fill = formationColor[f.name as FormationName] ?? colors.dim;
                  const hot = hoverFormation === f.name;
                  return (
                    <g key={f.id} onMouseEnter={() => setHoverFormation(f.name)} onMouseLeave={() => setHoverFormation(null)} className="cursor-default">
                      <rect x={0} y={top} width={colW} height={h} fill={fill} opacity={hot ? 0.98 : 0.78} stroke={hot ? colors.text : "none"} strokeWidth={1} className="transition-opacity duration-150" />
                      <rect x={colW - 10} y={top} width={10} height={h} fill={`url(#${LITHOLOGY_PATTERN[f.lithology] ?? "lith-shale"})`} opacity={0.9} />
                      {h >= 13 && (
                        <text x={textX} y={top + Math.min(h - 3, 12)} fontSize={9.5} fontWeight={600} fill={colors.text} fontFamily={MONO} letterSpacing={0.8} {...OUTLINE}>
                          {h >= 30 && colW >= 120 ? f.name.toUpperCase() : FORMATION_ABBREV[f.name] ?? f.name.slice(0, 3).toUpperCase()}
                        </text>
                      )}
                      {h >= 30 && (
                        <text x={textX} y={top + 23} fontSize={8.5} fill={colors.text} opacity={0.85} fontFamily={MONO} {...OUTLINE}>
                          {fmtNum(f.top_m)} m
                        </text>
                      )}
                    </g>
                  );
                })}
                {/* TD */}
                <line x1={-4} x2={colW + 4} y1={yAt(i, w.total_depth_m)} y2={yAt(i, w.total_depth_m)} stroke={colors.text} strokeWidth={1.5} />
                <text x={colW / 2} y={yAt(i, w.total_depth_m) + 11} fontSize={9} textAnchor="middle" fill={colors.muted} fontFamily={MONO}>
                  TD {fmtNum(w.total_depth_m)} m
                </text>
                {/* casing strings in the gutter beside the column: shoe triangles + size labels, cement hatched */}
                {showCasing &&
                  w.casing.map((c, ci) => {
                    const cx = -GUTTER + 8 + ci * 5;
                    const shoe = yAt(i, c.shoe_depth_m);
                    const toc = yAt(i, c.cement_top_m);
                    return (
                      <g key={c.id}>
                        <rect x={cx - 1.5} y={toc} width={3} height={Math.max(0, shoe - toc)} fill="url(#hatch-cement)" />
                        <line x1={cx} x2={cx} y1={yAt(i, 0)} y2={shoe} stroke={colors.text} strokeWidth={1} opacity={0.9} />
                        <polygon points={`${cx - 3.5},${shoe} ${cx + 3.5},${shoe} ${cx},${shoe + 6}`} fill={colors.text} />
                        <line x1={cx + 3.5} x2={-1} y1={shoe} y2={shoe} stroke={colors.text} strokeWidth={0.8} opacity={0.5} strokeDasharray="2 2" />
                        <text x={-3} y={shoe - 3} fontSize={7.5} textAnchor="end" fill={colors.text} fontFamily={MONO} opacity={0.9} {...OUTLINE}>
                          {c.size_in}
                        </text>
                      </g>
                    );
                  })}
                {/* events (right lane) */}
                {showEvents &&
                  w.events.map((e, ei) => {
                    const cy = yAt(i, e.depth_m);
                    const lane = ei % 2;
                    const cx = colW - 24 - lane * 15;
                    const tone = severityColor[e.severity as Severity];
                    const hot = hoverEvent?.id === e.id;
                    const eq = equivalents(e);
                    return (
                      <g key={e.id} className="cursor-pointer" onMouseEnter={() => setHoverEvent(e)} onMouseLeave={() => setHoverEvent(null)}>
                        {(hot || eq) && <circle cx={cx} cy={cy} r={11} fill={tone} opacity={0.3} filter="url(#corr-glow)" />}
                        <circle cx={cx} cy={cy} r={6.5} fill="#0B0F14" stroke={eq ? colors.text : tone} strokeWidth={hot || eq ? 2 : 1.4} />
                        <circle cx={cx} cy={cy} r={6.5} fill={tone} opacity={0.25} />
                        <text x={cx} y={cy + 2.8} fontSize={6.8} fontWeight={600} textAnchor="middle" fill={tone} fontFamily={MONO}>
                          {EVENT_CODE[e.event_type] ?? "•"}
                        </text>
                      </g>
                    );
                  })}
              </motion.g>
            );
          })}
        </AnimatePresence>

        {/* crosshair with per-column depth readouts */}
        {hoverY !== null && (
          <g pointerEvents="none">
            <line x1={RULER - 6} x2={svgW - 12} y1={hoverY} y2={hoverY} stroke={colors.text} strokeWidth={1} opacity={0.6} strokeDasharray={datum ? "3 3" : undefined} />
            {wells.map((_, i) => {
              const d = y.invert(hoverY) + shifts[i];
              return (
                <g key={i}>
                  <rect x={colX(i) + colW / 2 - 24} y={hoverY - 8} width={48} height={14} rx={3} fill={colors.text} />
                  <text x={colX(i) + colW / 2} y={hoverY + 2.5} fontSize={9.5} fontWeight={600} textAnchor="middle" fill="#0B0F14" fontFamily={MONO}>
                    {fmtNum(d)}
                  </text>
                </g>
              );
            })}
          </g>
        )}
      </svg>

      {hoverEvent && (
        <div className="pointer-events-none absolute z-[4] w-72 rounded-md border border-border-strong bg-surface-2/95 p-3 shadow-card backdrop-blur" style={{ left: Math.min(svgW - 300, colX(wells.findIndex((w) => w.id === hoverEvent.well_id)) + colW + 8), top: Math.max(8, yAt(wells.findIndex((w) => w.id === hoverEvent.well_id), hoverEvent.depth_m) - 30) }}>
          <div className="flex items-center gap-2">
            <SeverityBadge severity={hoverEvent.severity} />
            <span className="text-body font-medium text-text">{hoverEvent.event_type}</span>
            <span className="num ml-auto text-[11px] text-muted">{hoverEvent.well_id}</span>
          </div>
          <div className="hud-label mt-1">
            {fmtDepth(hoverEvent.depth_m, 0)} · {hoverEvent.formation} · NPT {fmtNum(hoverEvent.npt_hours, 1)} h
          </div>
          <p className="mt-1.5 text-[12px] leading-4 text-text">{hoverEvent.description}</p>
          <div className="mt-1.5 text-[10px] uppercase tracking-[0.08em] text-muted">Equivalent events highlighted in other wells</div>
        </div>
      )}
    </div>
  );
}
