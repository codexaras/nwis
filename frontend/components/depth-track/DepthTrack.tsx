"use client";
/**
 * Well Depth Track — one custom SVG, depth increasing downward, nine parallel tracks on a single
 * shared depth scale (d3-scale): DEPTH · FORMATION · LITHOLOGY · CASING · EVENTS · ROP · TORQUE · MUD-WEIGHT
 * WINDOW · GAS. Hovering anywhere draws a crosshair across all tracks with a mono depth readout; hovering an
 * event illuminates that depth and shows its detail card.
 */
import { scaleLinear } from "d3-scale";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { SeverityBadge } from "@/components/nwis/SeverityBadge";
import { fmtDepth, fmtNum } from "@/lib/format";
import { colors, formationColor, severityColor, type FormationName, type Severity } from "@/lib/tokens";
import type { CasingString, DepthLog, DrillingEvent, FormationTop, PressurePoint } from "@/lib/types";
import { cn } from "@/lib/utils";

import { useDepthHover } from "./context";
import { LITHOLOGY_PATTERN, LithologyDefs } from "./patterns";

export const EVENT_CODE: Record<string, string> = {
  "Mud Loss": "ML",
  Kick: "K",
  "Stuck Pipe": "SP",
  "Torque Spike": "TQ",
  "Tight Hole": "TH",
  "Cementing Issue": "CI",
  Fishing: "F",
  "Wellbore Instability": "WI",
};

const FORMATION_ABBREV: Record<string, string> = { Alluvium: "ALV", Namsang: "NMS", Dhekiajuli: "DHK", Girujan: "GRJ", Tipam: "TPM", Barail: "BRL", Kopili: "KPL", Sylhet: "SYL", Langpar: "LNP", Basement: "BSM" };

interface TrackDef {
  key: "depth" | "formation" | "lith" | "casing" | "events" | "rop" | "torque" | "mw" | "gas";
  label: string;
  unit?: string;
  base: number; // base width px
  flex: number; // share of extra width
}
const TRACKS: TrackDef[] = [
  { key: "depth", label: "DEPTH", unit: "m MD", base: 58, flex: 0 },
  { key: "formation", label: "FORMATION", base: 112, flex: 0 },
  { key: "lith", label: "LITH", base: 38, flex: 0 },
  { key: "casing", label: "CASING", base: 76, flex: 0 },
  { key: "events", label: "EVENTS", base: 64, flex: 0 },
  { key: "rop", label: "ROP", unit: "m/hr", base: 92, flex: 1 },
  { key: "torque", label: "TORQUE", unit: "kft·lb", base: 92, flex: 1 },
  { key: "mw", label: "MW WINDOW", unit: "ppg", base: 136, flex: 1.4 },
  { key: "gas", label: "GAS", unit: "units", base: 84, flex: 1 },
];
const PP_COLOR = "#6AA5D6";
const FG_COLOR = "#D97A7A";
const NARROW_WINDOW_PPG = 2.2;

export interface DepthTrackProps {
  wellId: string;
  totalDepth: number;
  formations: FormationTop[];
  casing: CasingString[];
  events: DrillingEvent[];
  logs: DepthLog[];
  pressure: PressurePoint[];
  currentDepth?: number | null;
  className?: string;
  /** scroll viewport height (px) */
  height?: number;
  onReadout?: (r: HoverReadout | null) => void;
}

export interface HoverReadout {
  depth: number;
  formation: string | null;
  log: DepthLog | null;
  pressure: PressurePoint | null;
}

function pathFrom(points: [number, number][]): string {
  return points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

export function DepthTrack({ wellId, totalDepth, formations, casing, events, logs, pressure, currentDepth, className, height = 560, onReadout }: DepthTrackProps) {
  const { hoverDepth, setHoverDepth, hoverEventId, setHoverEventId, selectedEventId, setSelectedEventId, pxPerM: zoomPx } = useDepthHover();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(760);
  // FIT (null) → whole well inside the viewport; otherwise the chosen px/m
  const pxPerM = zoomPx ?? Math.max(0.08, (height - 34) / totalDepth);

  // responsive width → distribute extra width to curve tracks
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setContainerW(Math.max(700, Math.floor(e.contentRect.width) - 2)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => {
    const baseSum = TRACKS.reduce((a, t) => a + t.base, 0);
    const flexSum = TRACKS.reduce((a, t) => a + t.flex, 0);
    const extra = Math.max(0, containerW - baseSum);
    let x = 0;
    return TRACKS.map((t) => {
      const w = t.base + (flexSum ? (extra * t.flex) / flexSum : 0);
      const def = { ...t, x0: x, x1: x + w, w };
      x += w;
      return def;
    });
  }, [containerW]);
  const W = layout[layout.length - 1].x1;
  const H = Math.ceil(totalDepth * pxPerM) + 24;
  const y = useMemo(() => scaleLinear().domain([0, totalDepth]).range([12, 12 + totalDepth * pxPerM]), [totalDepth, pxPerM]);
  const T = useMemo(() => Object.fromEntries(layout.map((t) => [t.key, t])) as Record<TrackDef["key"], (typeof layout)[number]>, [layout]);

  // data scales
  const ropMax = Math.max(40, ...logs.map((l) => l.rop)) * 1.05;
  const tqMax = Math.max(16, ...logs.map((l) => l.torque)) * 1.08;
  const gasMax = Math.max(80, ...logs.map((l) => l.gas_units)) * 1.05;
  const xRop = scaleLinear().domain([0, ropMax]).range([T.rop.x0 + 6, T.rop.x1 - 6]);
  const xTq = scaleLinear().domain([0, tqMax]).range([T.torque.x0 + 6, T.torque.x1 - 6]);
  const xGas = scaleLinear().domain([0, gasMax]).range([T.gas.x0 + 6, T.gas.x1 - 6]);
  const xMw = scaleLinear().domain([8, 17]).range([T.mw.x0 + 8, T.mw.x1 - 8]);

  const ropPath = pathFrom(logs.map((l) => [xRop(l.rop), y(l.depth_m)]));
  const tqPath = pathFrom(logs.map((l) => [xTq(l.torque), y(l.depth_m)]));
  const gasPath = pathFrom(logs.map((l) => [xGas(l.gas_units), y(l.depth_m)]));
  const mwPath = pathFrom(logs.map((l) => [xMw(l.mud_weight), y(l.depth_m)]));
  const ecdPath = pathFrom(logs.map((l) => [xMw(l.ecd), y(l.depth_m)]));
  const ppPath = pathFrom(pressure.map((p) => [xMw(p.pore_pressure_ppg), y(p.depth_m)]));
  const fgPath = pathFrom(pressure.map((p) => [xMw(p.fracture_gradient_ppg), y(p.depth_m)]));
  const windowArea = pressure.length
    ? `${pathFrom(pressure.map((p) => [xMw(p.pore_pressure_ppg), y(p.depth_m)]))} ${pathFrom([...pressure].reverse().map((p) => [xMw(p.fracture_gradient_ppg), y(p.depth_m)])).replace(/^M/, "L")} Z`
    : "";
  const areaClose = (path: string, xBase: number, first: number, last: number) => (path ? `${path} L${xBase},${y(last).toFixed(1)} L${xBase},${y(first).toFixed(1)} Z` : "");
  const firstD = logs[0]?.depth_m ?? 0;
  const lastD = logs[logs.length - 1]?.depth_m ?? 0;

  // narrow / overpressure intervals
  const narrow = useMemo(() => {
    type Interval = { from: number; to: number };
    const out: Interval[] = [];
    let run: Interval | null = null;
    for (const p of pressure) {
      const isNarrow = p.fracture_gradient_ppg - p.pore_pressure_ppg < NARROW_WINDOW_PPG;
      if (isNarrow) {
        if (run) run.to = p.depth_m;
        else run = { from: p.depth_m, to: p.depth_m };
      } else if (run) {
        out.push(run);
        run = null;
      }
    }
    if (run) out.push(run);
    return out.filter((r) => r.to - r.from >= 50);
  }, [pressure]);

  // event lanes (avoid overlapping markers)
  const eventLanes = useMemo(() => {
    const sorted = [...events].sort((a, b) => a.depth_m - b.depth_m);
    const lanes = new Map<number, number>();
    let prevY = -Infinity;
    let lane = 0;
    for (const e of sorted) {
      const py = y(e.depth_m);
      lane = py - prevY < 18 ? (lane + 1) % 3 : 0;
      lanes.set(e.id, lane);
      prevY = py;
    }
    return lanes;
  }, [events, y]);

  // hover helpers
  const readoutFor = useCallback(
    (d: number): HoverReadout => {
      const f = formations.find((t) => t.top_m <= d && d < t.base_m) ?? null;
      let log: DepthLog | null = null;
      let best = Infinity;
      for (const l of logs) {
        const dd = Math.abs(l.depth_m - d);
        if (dd < best) {
          best = dd;
          log = l;
        }
      }
      let pp: PressurePoint | null = null;
      best = Infinity;
      for (const p of pressure) {
        const dd = Math.abs(p.depth_m - d);
        if (dd < best) {
          best = dd;
          pp = p;
        }
      }
      return { depth: d, formation: f?.name ?? null, log: best < 60 ? log : log, pressure: pp };
    },
    [formations, logs, pressure],
  );

  useEffect(() => {
    onReadout?.(hoverDepth === null ? null : readoutFor(hoverDepth));
  }, [hoverDepth, readoutFor, onReadout]);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const d = y.invert(e.clientY - rect.top);
    setHoverDepth(Math.max(0, Math.min(totalDepth, d)));
  };
  const onLeave = () => {
    setHoverDepth(null);
    setHoverEventId(null);
  };

  // scroll to selected event / bit
  const scrollToDepth = useCallback(
    (d: number) => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTo({ top: Math.max(0, y(d) - el.clientHeight / 2), behavior: "smooth" });
    },
    [y],
  );
  useEffect(() => {
    if (selectedEventId !== null) {
      const e = events.find((x) => x.id === selectedEventId);
      if (e) scrollToDepth(e.depth_m);
    }
  }, [selectedEventId, events, scrollToDepth]);
  const didInitialScroll = useRef(false);
  useEffect(() => {
    if (didInitialScroll.current) return;
    didInitialScroll.current = true;
    if (selectedEventId === null && currentDepth && zoomPx !== null) {
      const el = scrollRef.current;
      if (el) el.scrollTop = Math.max(0, y(currentDepth) - el.clientHeight * 0.55);
    }
  }, [currentDepth, selectedEventId, y, zoomPx]);

  const hoveredEvent = events.find((e) => e.id === (hoverEventId ?? selectedEventId)) ?? null;
  const gridStep = pxPerM < 0.2 ? 500 : pxPerM < 0.4 ? 250 : 100;
  const gridDepths: number[] = [];
  for (let d = 0; d <= totalDepth; d += gridStep) gridDepths.push(d);
  const activeDepth = hoverDepth;

  return (
    <div className={cn("relative", className)}>
      {/* sticky header */}
      <div className="sticky top-0 z-[2] flex border-b border-border bg-surface/95 backdrop-blur" style={{ width: W }}>
        {layout.map((t) => (
          <div key={t.key} className="flex flex-col justify-end border-r border-border/60 px-1.5 py-1.5 last:border-r-0" style={{ width: t.w }}>
            <div className="hud-label truncate text-[10px]">{t.label}</div>
            <div className="num truncate text-[10px] text-dim">
              {t.key === "rop" && `0 – ${fmtNum(ropMax, 0)} ${t.unit}`}
              {t.key === "torque" && `0 – ${fmtNum(tqMax, 0)} ${t.unit}`}
              {t.key === "gas" && `0 – ${fmtNum(gasMax, 0)}`}
              {t.key === "mw" && "8 – 17 ppg"}
              {t.key === "depth" && t.unit}
              {t.key === "events" && `${events.length} logged`}
              {t.key === "casing" && `${casing.length} strings`}
              {t.key === "formation" && `${formations.length} tops`}
              {t.key === "lith" && " "}
            </div>
          </div>
        ))}
      </div>

      <div ref={scrollRef} className="relative overflow-auto" style={{ height }}>
        <svg width={W} height={H} className="block select-none" onMouseMove={onMove} onMouseLeave={onLeave} onClick={() => setSelectedEventId(null)}>
          <LithologyDefs />
          <defs>
            <linearGradient id="grad-rop" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={colors.teal} stopOpacity="0" />
              <stop offset="100%" stopColor={colors.teal} stopOpacity="0.35" />
            </linearGradient>
            <linearGradient id="grad-gas" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={colors.amber} stopOpacity="0" />
              <stop offset="100%" stopColor={colors.amber} stopOpacity="0.4" />
            </linearGradient>
          </defs>

          {/* track backgrounds + separators */}
          {layout.map((t, i) => (
            <g key={t.key}>
              <rect x={t.x0} y={0} width={t.w} height={H} fill={i % 2 ? colors.surface : colors.bg} opacity={i % 2 ? 0.35 : 0.2} />
              <line x1={t.x1} x2={t.x1} y1={0} y2={H} stroke={colors.border} strokeWidth={1} />
            </g>
          ))}

          {/* depth grid + ruler */}
          {gridDepths.map((d) => (
            <g key={d}>
              <line x1={T.depth.x1} x2={W} y1={y(d)} y2={y(d)} stroke={colors.border} strokeWidth={1} opacity={0.6} />
              <line x1={T.depth.x1 - 6} x2={T.depth.x1} y1={y(d)} y2={y(d)} stroke={colors.muted} strokeWidth={1} />
              <text x={T.depth.x1 - 9} y={y(d) + 3.5} fontSize={10} textAnchor="end" fill={colors.muted} fontFamily="var(--font-jetbrains), monospace">
                {fmtNum(d)}
              </text>
            </g>
          ))}
          {pxPerM >= 0.34 &&
            Array.from({ length: Math.floor(totalDepth / 50) }, (_, i) => (i + 1) * 50)
              .filter((d) => d % gridStep !== 0)
              .map((d) => <line key={d} x1={T.depth.x1 - 3} x2={T.depth.x1} y1={y(d)} y2={y(d)} stroke={colors.dim} strokeWidth={1} />)}

          {/* formations + lithology */}
          {formations.map((f) => {
            const top = y(f.top_m);
            const h = Math.max(1, y(f.base_m) - top);
            const fill = formationColor[f.name as FormationName] ?? f.color ?? colors.dim;
            const hot = activeDepth !== null && activeDepth >= f.top_m && activeDepth < f.base_m;
            return (
              <g key={f.id}>
                <rect x={T.formation.x0} y={top} width={T.formation.w} height={h} fill={fill} opacity={hot ? 0.95 : 0.72} />
                <line x1={T.formation.x0} x2={T.gas.x1} y1={top} y2={top} stroke={fill} strokeWidth={1} opacity={0.55} strokeDasharray="2 3" />
                {h >= 14 && (
                  <text x={T.formation.x0 + 6} y={top + Math.min(h - 4, 13)} fontSize={10} fontFamily="var(--font-jetbrains), monospace" letterSpacing={1} fill={colors.text} fontWeight={600} stroke="#0B0F14" strokeWidth={3} paintOrder="stroke" strokeLinejoin="round">
                    {h >= 34 ? f.name.toUpperCase() : FORMATION_ABBREV[f.name] ?? f.name.slice(0, 3).toUpperCase()}
                  </text>
                )}
                {h >= 34 && (
                  <text x={T.formation.x0 + 6} y={top + 25} fontSize={9} fontFamily="var(--font-jetbrains), monospace" fill={colors.text} opacity={0.85} stroke="#0B0F14" strokeWidth={3} paintOrder="stroke" strokeLinejoin="round">
                    {fmtNum(f.top_m)} m
                  </text>
                )}
                <rect x={T.lith.x0 + 3} y={top} width={T.lith.w - 6} height={h} fill={`url(#${LITHOLOGY_PATTERN[f.lithology] ?? "lith-shale"})`} />
              </g>
            );
          })}
          {/* TD marker */}
          <line x1={T.depth.x0} x2={W} y1={y(totalDepth)} y2={y(totalDepth)} stroke={colors.muted} strokeWidth={1.5} />
          <text x={W - 6} y={y(totalDepth) - 4} fontSize={10} textAnchor="end" fill={colors.muted} fontFamily="var(--font-jetbrains), monospace">
            TD {fmtDepth(totalDepth, 0).toUpperCase()}
          </text>

          {/* casing strings */}
          {casing.map((c, i) => {
            const cx = T.casing.x0 + 12 + i * ((T.casing.w - 24) / Math.max(1, casing.length - 1));
            const shoeY = y(c.shoe_depth_m);
            const tocY = y(c.cement_top_m);
            const hot = activeDepth !== null && Math.abs(activeDepth - c.shoe_depth_m) < 25;
            return (
              <g key={c.id}>
                <rect x={cx + 2} y={tocY} width={5} height={Math.max(0, shoeY - tocY)} fill="url(#hatch-cement)" />
                <line x1={cx} x2={cx} y1={y(0)} y2={shoeY} stroke={hot ? colors.amber : colors.text} strokeWidth={i === casing.length - 1 ? 1.6 : 1.2} opacity={0.85} />
                <polygon points={`${cx - 5},${shoeY} ${cx + 5},${shoeY} ${cx},${shoeY + 7}`} fill={hot ? colors.amber : colors.text} opacity={0.9} />
                <text x={cx + (i === casing.length - 1 ? -8 : 9)} y={shoeY + 4} fontSize={9} textAnchor={i === casing.length - 1 ? "end" : "start"} fill={colors.muted} fontFamily="var(--font-jetbrains), monospace">
                  {c.size_in}
                </text>
              </g>
            );
          })}

          {/* curves */}
          <path d={areaClose(ropPath, T.rop.x0 + 6, firstD, lastD)} fill="url(#grad-rop)" />
          <path d={ropPath} fill="none" stroke={colors.teal} strokeWidth={1.3} />
          <path d={tqPath} fill="none" stroke={colors.amber} strokeWidth={1.3} />
          <path d={areaClose(gasPath, T.gas.x0 + 6, firstD, lastD)} fill="url(#grad-gas)" />
          <path d={gasPath} fill="none" stroke={colors.amber} strokeWidth={1.2} />

          {/* mud-weight window */}
          {[9, 11, 13, 15].map((v) => (
            <g key={v}>
              <line x1={xMw(v)} x2={xMw(v)} y1={0} y2={H} stroke={colors.border} strokeWidth={1} opacity={0.5} />
            </g>
          ))}
          <path d={windowArea} fill={PP_COLOR} opacity={0.08} />
          {narrow.map((r) => (
            <g key={r.from}>
              <rect x={T.mw.x0} y={y(r.from)} width={T.mw.w} height={Math.max(2, y(r.to) - y(r.from))} fill="url(#hatch-overpressure)" />
              <rect x={T.mw.x0} y={y(r.from)} width={T.mw.w} height={Math.max(2, y(r.to) - y(r.from))} fill="none" stroke="#EF4444" strokeOpacity={0.5} strokeWidth={1} />
              <text x={T.mw.x1 - 6} y={y(r.from) + 12} fontSize={9} textAnchor="end" fill="#EF4444" fontFamily="var(--font-jetbrains), monospace" letterSpacing={0.8}>
                OVERPRESSURE
              </text>
            </g>
          ))}
          <path d={ppPath} fill="none" stroke={PP_COLOR} strokeWidth={1.4} />
          <path d={fgPath} fill="none" stroke={FG_COLOR} strokeWidth={1.4} />
          <path d={ecdPath} fill="none" stroke={colors.amber} strokeWidth={1} strokeDasharray="3 3" opacity={0.9} />
          <path d={mwPath} fill="none" stroke={colors.amber} strokeWidth={1.6} />

          {/* events */}
          {events.map((e) => {
            const cy = y(e.depth_m);
            const lane = eventLanes.get(e.id) ?? 0;
            const cx = T.events.x0 + T.events.w / 2 + (lane === 1 ? -14 : lane === 2 ? 14 : 0);
            const tone = severityColor[e.severity as Severity];
            const hot = hoverEventId === e.id || selectedEventId === e.id;
            return (
              <g
                key={e.id}
                className="cursor-pointer"
                onMouseEnter={() => {
                  setHoverEventId(e.id);
                  setHoverDepth(e.depth_m);
                }}
                onMouseLeave={() => setHoverEventId(null)}
                onClick={(ev) => {
                  ev.stopPropagation();
                  setSelectedEventId(selectedEventId === e.id ? null : e.id);
                }}
              >
                {hot && <circle cx={cx} cy={cy} r={13} fill={tone} opacity={0.18} />}
                <circle cx={cx} cy={cy} r={7.5} fill="#0B0F14" stroke={tone} strokeWidth={hot ? 2 : 1.5} />
                <circle cx={cx} cy={cy} r={7.5} fill={tone} opacity={0.22} />
                <text x={cx} y={cy + 3} fontSize={7.5} textAnchor="middle" fill={tone} fontFamily="var(--font-jetbrains), monospace" fontWeight={600}>
                  {EVENT_CODE[e.event_type] ?? "•"}
                </text>
                {/* tick on the ruler + across tracks when hot */}
                {hot && <line x1={T.events.x1} x2={W} y1={cy} y2={cy} stroke={tone} strokeWidth={1} opacity={0.5} strokeDasharray="2 3" />}
              </g>
            );
          })}

          {/* current bit depth */}
          {currentDepth !== null && currentDepth !== undefined && (
            <g>
              <line x1={T.depth.x0} x2={W} y1={y(currentDepth)} y2={y(currentDepth)} stroke={colors.amber} strokeWidth={1.5} strokeDasharray="6 4" />
              <rect x={W - 92} y={y(currentDepth) - 16} width={88} height={14} rx={3} fill={colors.amber} />
              <text x={W - 48} y={y(currentDepth) - 5.5} fontSize={9.5} textAnchor="middle" fill="#0B0F14" fontFamily="var(--font-jetbrains), monospace" fontWeight={600}>
                BIT {fmtDepth(currentDepth).toUpperCase()}
              </text>
            </g>
          )}

          {/* crosshair */}
          {activeDepth !== null && (
            <g pointerEvents="none">
              <line x1={T.depth.x0} x2={W} y1={y(activeDepth)} y2={y(activeDepth)} stroke={colors.text} strokeWidth={1} opacity={0.7} />
              <rect x={T.depth.x0 + 2} y={y(activeDepth) - 8} width={T.depth.w - 4} height={16} rx={3} fill={colors.text} />
              <text x={T.depth.x0 + T.depth.w / 2} y={y(activeDepth) + 3.5} fontSize={10} textAnchor="middle" fill="#0B0F14" fontFamily="var(--font-jetbrains), monospace" fontWeight={600}>
                {fmtNum(activeDepth, 0)}
              </text>
            </g>
          )}
        </svg>

        {/* event detail card */}
        {hoveredEvent && (
          <div
            className="pointer-events-none absolute z-[4] w-72 rounded-md border border-border-strong bg-surface-2/95 p-3 shadow-card backdrop-blur"
            style={{ left: Math.min(W - 300, T.events.x1 + 10), top: Math.max(8, y(hoveredEvent.depth_m) - 40) }}
          >
            <div className="flex items-center gap-2">
              <SeverityBadge severity={hoveredEvent.severity} />
              <span className="text-body font-medium text-text">{hoveredEvent.event_type}</span>
              <span className="num ml-auto text-[11px] text-muted">{fmtDepth(hoveredEvent.depth_m, 0)}</span>
            </div>
            <div className="hud-label mt-1">
              {hoveredEvent.formation} · NPT {fmtNum(hoveredEvent.npt_hours, 1)} h · MW {hoveredEvent.mud_weight_ppg.toFixed(1)} ppg
            </div>
            <p className="mt-1.5 text-[12px] leading-4 text-text">{hoveredEvent.description}</p>
            {hoveredEvent.mitigation && <p className="mt-1 text-[11px] leading-4 text-muted">Mitigation: {hoveredEvent.mitigation}</p>}
            <div className="num mt-1.5 text-[10px] text-dim">
              {wellId} · {hoveredEvent.source_doc}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Legend for the MW window + curve colours (rendered by the page under the track). */
export function DepthTrackLegend() {
  const items = [
    { c: colors.teal, l: "ROP" },
    { c: colors.amber, l: "Torque / MW" },
    { c: colors.amber, l: "ECD (dashed)", dashed: true },
    { c: PP_COLOR, l: "Pore pressure" },
    { c: FG_COLOR, l: "Fracture gradient" },
    { c: "#EF4444", l: "Narrow window < 2.2 ppg", hatch: true },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((it) => (
        <span key={it.l} className="inline-flex items-center gap-1.5 text-[11px] text-muted">
          <span className="inline-block h-0.5 w-4" style={{ background: it.hatch ? "repeating-linear-gradient(-45deg, #EF4444 0 2px, transparent 2px 5px)" : it.c, height: it.hatch ? 6 : 2, borderTop: it.dashed ? `2px dashed ${it.c}` : undefined, backgroundColor: it.dashed ? "transparent" : undefined }} />
          {it.l}
        </span>
      ))}
    </div>
  );
}
