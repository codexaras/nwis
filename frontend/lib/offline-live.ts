/**
 * Client-side live-feed simulation used when the backend is unreachable.
 * Seeded from /demo-data/live.json + the active well's formation tops + offset events; same rules as the backend:
 * ~2 m every 3 s at 1x, alerts when the bit is within 150 m above High/Critical offset events inside the radius.
 */
import type { DrillingEvent, EventsResponse, FormationTop, LiveAlert, LiveControls, LiveParams, LiveSnapshot, WellDetail } from "./types";

const RATE_M_PER_S = 2 / 3;
const LOOKAHEAD_M = 150;

const BASELINE: Record<string, Omit<LiveParams, "mud_weight" | "ecd" | "hookload" | "flow_rate">> = {
  Alluvium: { rop: 36, wob: 8, rpm: 120, torque: 4, spp: 1200, gas_units: 6 },
  Namsang: { rop: 31, wob: 10, rpm: 120, torque: 5, spp: 1500, gas_units: 8 },
  Dhekiajuli: { rop: 25, wob: 12, rpm: 110, torque: 6, spp: 1800, gas_units: 9 },
  Girujan: { rop: 12, wob: 15, rpm: 90, torque: 8.5, spp: 2100, gas_units: 12 },
  Tipam: { rop: 18, wob: 15, rpm: 100, torque: 8, spp: 2300, gas_units: 45 },
  Barail: { rop: 8, wob: 18, rpm: 80, torque: 12, spp: 2600, gas_units: 28 },
  Kopili: { rop: 6, wob: 20, rpm: 70, torque: 13, spp: 2950, gas_units: 70 },
  Sylhet: { rop: 4, wob: 22, rpm: 60, torque: 14, spp: 3050, gas_units: 35 },
  Langpar: { rop: 5, wob: 22, rpm: 60, torque: 14, spp: 3100, gas_units: 20 },
  Basement: { rop: 2, wob: 25, rpm: 50, torque: 16, spp: 3200, gas_units: 10 },
};
const MW: Record<string, [number, number]> = {
  Alluvium: [8.6, 8.9], Namsang: [8.8, 9.1], Dhekiajuli: [9.0, 9.3], Girujan: [9.4, 9.8], Tipam: [9.6, 10.2],
  Barail: [10.4, 11.1], Kopili: [12.2, 13.4], Sylhet: [11.6, 12.6], Langpar: [11.4, 12.0], Basement: [11.0, 11.6],
};
const ACTIONS: Record<string, string> = {
  "Stuck Pipe": "Increase circulation before connections, ream every stand through the interval, keep jars armed and spot a lubricant pill on any torque rise.",
  "Torque Spike": "Step WOB and RPM down before the interval, run a wiper trip to condition the hole and raise the lubricity of the mud system.",
  "Tight Hole": "Improve hole cleaning with hi-vis sweeps, back-ream on trips and switch to an inhibitive mud system across reactive clays.",
  "Mud Loss": "Pre-treat mud with fine/medium LCM, reduce ECD by lowering flow rate and keep LCM pills staged before entering the interval.",
  Kick: "Raise mud weight to the recommended value before the transition, flow-check every connection, slow-drill the top 30 m and confirm BOP test status.",
  "Cementing Issue": "Centralise casing, condition mud to low gels before the job, use adequate spacer and consider two-stage cementing across loss zones.",
  Fishing: "Verify fishing tools on location, limit overpull to string design and avoid dry drilling through hard stringers.",
  "Wellbore Instability": "Raise mud weight modestly, minimise open-hole exposure time and control tripping speeds through the interval.",
};
const SEV_RANK: Record<string, number> = { Low: 0, Medium: 1, High: 2, Critical: 3 };

interface SimState {
  base: LiveSnapshot;
  tops: FormationTop[];
  offsets: DrillingEvent[];
  depthAt: number;
  t0: number;
  speed: number;
  radius: number;
  firstSeen: Map<string, string>;
  injected: { e: DrillingEvent; expires: number }[];
}
let state: SimState | null = null;

async function load(): Promise<SimState> {
  if (state) return state;
  const [base, well, events] = await Promise.all([
    fetch("/demo-data/live.json").then((r) => r.json() as Promise<LiveSnapshot>),
    fetch("/demo-data/wells/DLJ-ACT-01.json").then((r) => r.json() as Promise<WellDetail>),
    fetch("/demo-data/events.json").then((r) => r.json() as Promise<EventsResponse>),
  ]);
  state = {
    base,
    tops: well.formations,
    offsets: events.items.filter((e) => e.well_id !== base.well_id && (e.severity === "High" || e.severity === "Critical")),
    depthAt: base.start_depth_m,
    t0: performance.now(),
    speed: 1,
    radius: base.radius_km,
    firstSeen: new Map(),
    injected: [],
  };
  return state;
}

function formationAt(tops: FormationTop[], d: number): FormationTop {
  return tops.find((t) => t.top_m <= d && d < t.base_m) ?? tops[tops.length - 1];
}

function paramsAt(s: SimState, depth: number): LiveParams {
  const f = formationAt(s.tops, depth);
  const b = BASELINE[f.name] ?? BASELINE.Tipam;
  const rel = Math.max(0, Math.min(1, (depth - f.top_m) / Math.max(1, f.base_m - f.top_m)));
  const wave = 1 + 0.06 * Math.sin(depth / 23) + 0.04 * Math.sin(depth / 7.3) + 0.03 * Math.sin(depth / 2.1);
  let torqueF = 1;
  let ropF = 1;
  for (const e of s.offsets) {
    const ahead = e.depth_m - depth;
    if (ahead >= 0 && ahead <= 120 && (e.distance_km ?? 99) <= s.radius && ["Stuck Pipe", "Torque Spike", "Tight Hole"].includes(e.event_type)) {
      const k = 1 - ahead / 120;
      torqueF = Math.max(torqueF, 1 + 0.22 * k);
      ropF = Math.min(ropF, 1 - 0.15 * k);
    }
  }
  const kop = s.tops.find((t) => t.name === "Kopili");
  const gasF = kop && kop.top_m - depth >= 0 && kop.top_m - depth <= 100 ? 1 + 1.6 * (1 - (kop.top_m - depth) / 100) : 1;
  const [lo, hi] = MW[f.name] ?? [9.6, 10.2];
  const mw = +(lo + (hi - lo) * rel).toFixed(2);
  const j = () => 1 + (Math.sin(depth * 12.9898) * 43758.5453 % 1) * 0.02 - 0.01;
  return {
    rop: +(b.rop * wave * ropF * j()).toFixed(1),
    wob: +(b.wob * (1 + 0.03 * Math.sin(depth / 13))).toFixed(1),
    rpm: Math.round(b.rpm * (1 + 0.02 * Math.sin(depth / 5))),
    torque: +(b.torque * wave * torqueF * j()).toFixed(1),
    spp: Math.round(b.spp * (1 + 0.03 * Math.sin(depth / 17))),
    mud_weight: mw,
    ecd: +(mw + 0.24 + 0.00004 * depth).toFixed(2),
    gas_units: Math.round(b.gas_units * wave * gasF),
    hookload: Math.round(165 + depth * 0.032 + 3 * Math.sin(depth / 9)),
    flow_rate: Math.round(640 + 12 * Math.sin(depth / 31)),
  };
}

export async function offlineLive(controls: LiveControls = {}): Promise<LiveSnapshot> {
  const s = await load();
  const now = performance.now();
  const currentDepth = () => Math.min(s.base.planned_td_m, s.depthAt + ((now - s.t0) / 1000) * RATE_M_PER_S * s.speed);
  if (controls.reset) {
    s.depthAt = s.base.start_depth_m;
    s.t0 = now;
    s.speed = 1;
    s.firstSeen.clear();
    s.injected = [];
  }
  if (controls.speed !== undefined) {
    s.depthAt = currentDepth();
    s.t0 = now;
    s.speed = controls.speed;
  }
  if (controls.jump_to_depth !== undefined) {
    s.depthAt = Math.max(50, Math.min(s.base.planned_td_m, controls.jump_to_depth));
    s.t0 = now;
    s.firstSeen.clear();
  }
  if (controls.radius_km !== undefined) s.radius = controls.radius_km;
  const depth = +currentDepth().toFixed(1);
  if (controls.trigger_alert) {
    const cand = s.offsets
      .filter((e) => (e.distance_km ?? 99) <= s.radius && e.depth_m - depth > LOOKAHEAD_M)
      .sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity] || a.depth_m - b.depth_m)[0];
    if (cand) s.injected = [...s.injected.filter((i) => i.e.id !== cand.id), { e: cand, expires: now + 90_000 }];
  }
  s.injected = s.injected.filter((i) => i.expires > now && i.e.depth_m > depth);

  const f = formationAt(s.tops, depth);
  const next = s.tops.find((t) => t.top_m > depth) ?? null;
  const nowIso = new Date().toISOString();
  const inWindow = s.offsets.filter((e) => (e.distance_km ?? 99) <= s.radius && e.depth_m - depth >= 0 && e.depth_m - depth <= LOOKAHEAD_M);
  const list = [...inWindow, ...s.injected.map((i) => i.e).filter((e) => !inWindow.some((x) => x.id === e.id))];
  const alerts: LiveAlert[] = list.map((e) => {
    const id = `ev-${e.id}`;
    if (!s.firstSeen.has(id)) s.firstSeen.set(id, nowIso);
    const ahead = +(e.depth_m - depth).toFixed(1);
    return {
      id, event_id: e.id, well_id: e.well_id, depth_m: e.depth_m, distance_ahead_m: ahead, event_type: e.event_type, severity: e.severity,
      formation: e.formation, distance_km: e.distance_km ?? 0, bearing: "", npt_hours: e.npt_hours, citation: e.citation,
      title: `${e.event_type.toUpperCase()} RISK · ${e.formation.toUpperCase()}`,
      message: `${e.well_id} reported ${e.severity.toLowerCase()} ${e.event_type.toLowerCase()} at ${Math.round(e.depth_m).toLocaleString("en-US")} m in ${e.formation}, ${(e.distance_km ?? 0).toFixed(1)} km away — ${Math.round(ahead).toLocaleString("en-US")} m ahead of the bit.`,
      recommendation: ACTIONS[e.event_type] ?? "", evidence: e.description, mitigation: e.mitigation, first_seen: s.firstSeen.get(id)!,
      is_demo: s.injected.some((i) => i.e.id === e.id) && !inWindow.some((x) => x.id === e.id),
    };
  });
  for (const k of Array.from(s.firstSeen.keys())) if (!alerts.some((a) => a.id === k)) s.firstSeen.delete(k);
  alerts.sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity] || a.distance_ahead_m - b.distance_ahead_m);

  const history = [];
  for (let i = 0; i < 30; i++) {
    const d = depth - (29 - i) * 2;
    if (d > 0) history.push({ depth_m: +d.toFixed(1), ...paramsAt(s, d) });
  }
  const upcoming = s.tops.filter((t) => t.top_m > depth).map((t) => ({ name: t.name, top_m: t.top_m, distance_m: +(t.top_m - depth).toFixed(1), risk_tendency: t.risk_tendency ?? "", color: t.color ?? "#888" }));
  const clock = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date());
  return {
    ...s.base,
    timestamp: nowIso,
    clock_ist: `${clock} IST`,
    status: depth >= s.base.planned_td_m ? "TD REACHED" : "DRILLING",
    speed: s.speed,
    radius_km: s.radius,
    depth_m: depth,
    progress_pct: +((100 * depth) / s.base.planned_td_m).toFixed(1),
    formation: f.name,
    formation_color: f.color ?? s.base.formation_color,
    formation_top_m: f.top_m,
    formation_base_m: f.base_m,
    formation_rel_pos: +((depth - f.top_m) / Math.max(1, f.base_m - f.top_m)).toFixed(3),
    next_formation: next?.name ?? null,
    next_formation_top_m: next?.top_m ?? null,
    distance_to_next_m: next ? +(next.top_m - depth).toFixed(1) : null,
    params: paramsAt(s, depth),
    history,
    alerts,
    active_alert_count: alerts.length,
    top_alert: alerts[0] ?? null,
    upcoming_formations: upcoming,
    system: { nwis_rt: "OFFLINE DEMO", risk_engine: "SNAPSHOT", feed: "SIMULATED" },
  };
}
