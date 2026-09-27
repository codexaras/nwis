"use client";
import { Activity, ArrowRight, Maximize2, Radar, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { FieldDashboard } from "@/components/dashboard/FieldDashboard";
import { NearbyMap } from "@/components/map/NearbyMapDynamic";
import { DataChip, EmptyState, FormationChip, HudLabel, HudStrip, KpiReadout, LiveSparkline, SectionCard, SeverityBadge, SkeletonList, StatusDot } from "@/components/nwis";
import { DepthProgressBar } from "@/components/nwis/DepthProgressBar";
import { Button } from "@/components/ui/button";
import { ACTIVE_WELL_ID, getNearby, getStats, getWell, getWells } from "@/lib/api";
import { fmtCoord, fmtDepth, fmtIsoTimeIST, fmtNum } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { useLive } from "@/lib/live-context";
import { colors } from "@/lib/tokens";

const PARAMS: { key: "rop" | "wob" | "rpm" | "torque" | "spp" | "mud_weight" | "ecd" | "gas_units"; label: string; unit: string; decimals: number; color: string }[] = [
  { key: "rop", label: "ROP", unit: "m/hr", decimals: 1, color: colors.teal },
  { key: "wob", label: "WOB", unit: "klbs", decimals: 1, color: colors.teal },
  { key: "rpm", label: "RPM", unit: "rpm", decimals: 0, color: colors.teal },
  { key: "torque", label: "Torque", unit: "kft·lb", decimals: 1, color: colors.amber },
  { key: "spp", label: "SPP", unit: "psi", decimals: 0, color: colors.teal },
  { key: "mud_weight", label: "Mud weight", unit: "ppg", decimals: 2, color: colors.teal },
  { key: "ecd", label: "ECD", unit: "ppg", decimals: 2, color: colors.teal },
  { key: "gas_units", label: "Gas", unit: "units", decimals: 0, color: colors.amber },
];

/** Operations Overview — Live Drilling Command Center. */
export default function DashboardPage() {
  const router = useRouter();
  const { snap, loading, radiusKm, alerts, offline, fieldMode } = useLive();
  const stats = useAsync(() => getStats(radiusKm), [radiusKm]);
  const nearby = useAsync(() => getNearby(radiusKm), [radiusKm]);
  const wells = useAsync(() => getWells(), []);
  const active = useAsync(() => getWell(ACTIVE_WELL_ID), []);
  const top = snap?.top_alert ?? null;
  const nearest = nearby.data?.wells[0];
  const currentFormationIncidents = nearby.data && snap ? nearby.data.wells.reduce((a, w) => a + w.key_events.filter((e) => e.formation === snap.formation).length, 0) : null;
  const markers = (nearby.data?.wells ?? []).flatMap((w) => w.key_events.filter((e) => e.severity === "High" || e.severity === "Critical").map((e) => ({ depth_m: e.depth_m, severity: e.severity })));
  const drilling = snap?.status === "DRILLING";

  if (fieldMode) return <FieldDashboard />;

  return (
    <div className="space-y-4 p-4">
      {/* header strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface/60 px-4 py-2">
        <HudStrip>
          <HudLabel value={snap?.well_id ?? "—"} valueClassName="text-amber">
            Well
          </HudLabel>
          <HudLabel dot={offline ? "amber" : "teal"} pulse>
            {snap?.status === "TD REACHED" ? "TD REACHED" : offline ? "OFFLINE SIM" : "LIVE · SIMULATED"}
          </HudLabel>
          <HudLabel value={snap ? `${fmtDepth(snap.depth_m).toUpperCase()} MD` : "—"}>Bit depth</HudLabel>
          <HudLabel value={snap?.formation.toUpperCase() ?? "—"}>Formation</HudLabel>
          <HudLabel value={snap ? `${fmtCoord(snap.lat)} / ${fmtCoord(snap.lon)}` : "—"}>Lat / Lon</HudLabel>
          <HudLabel value={snap?.rig ?? "—"}>Rig</HudLabel>
          <HudLabel value={`${radiusKm} KM`}>Offset window</HudLabel>
        </HudStrip>
        <HudLabel value={snap ? `${fmtIsoTimeIST(snap.timestamp)} IST` : "—"}>Last update</HudLabel>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* ------------------------------------------------------------------ live hero */}
        <SectionCard
          className="col-span-12 xl:col-span-8"
          variant="hero"
          title="Live drilling command center"
          subtitle={snap ? `${snap.well_id} · ${snap.field.toUpperCase()} · ${snap.rig}` : "CONNECTING TO NWIS-RT"}
          actions={<DataChip variant={offline ? "offline" : "simulated"}>{offline ? "Offline sim" : "Live feed · simulated"}</DataChip>}
          bodyClassName="flex flex-col gap-5"
        >
          {/* rig state strip */}
          <div className="-mt-1 flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-border pb-3">
            <HudLabel dot={drilling ? "green" : "muted"} pulse={drilling}>On bottom</HudLabel>
            <HudLabel dot={drilling ? "green" : "muted"} pulse={drilling}>Rotating</HudLabel>
            <HudLabel dot={drilling ? "green" : "muted"} pulse={drilling}>Circulating</HudLabel>
            <HudLabel dot="teal">BOP tested</HudLabel>
            <HudLabel value={snap ? `${snap.speed}X` : "—"}>Sim speed</HudLabel>
            <HudLabel value={snap ? `${fmtNum(snap.params.hookload)} KLBS` : "—"}>Hookload</HudLabel>
            <HudLabel value={snap ? `${fmtNum(snap.params.flow_rate)} GPM` : "—"}>Flow</HudLabel>
          </div>
          <div className="grid grid-cols-12 gap-6">
            {/* depth + formation + active risk */}
            <div className="col-span-12 flex flex-col gap-4 md:col-span-4">
              <div>
                <div className="hud-label">Current depth · MD</div>
                <div className="num mt-1 text-[56px] font-medium leading-[56px] tracking-tight text-amber" style={{ textShadow: "0 0 24px rgba(245,158,11,0.25)" }}>
                  {snap ? fmtNum(snap.depth_m, 1) : <span className="text-dim">——</span>}
                  <span className="ml-2 text-hero-sm font-normal text-muted">m</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-[12px] text-muted">
                  <span className="num">{snap ? `${fmtNum(snap.progress_pct, 1)}%` : "—"}</span>
                  <span>of planned TD {snap ? fmtDepth(snap.planned_td_m, 0) : "—"}</span>
                </div>
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-3">
                  <div className="h-full rounded-full bg-amber transition-[width] duration-700" style={{ width: `${snap?.progress_pct ?? 0}%` }} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="hud-label mb-1">Formation</div>
                  {snap ? <FormationChip name={snap.formation} size="md" /> : <span className="text-muted">—</span>}
                  {snap && (
                    <div className="num mt-1 whitespace-nowrap text-[11px] text-muted">
                      {fmtNum(snap.formation_top_m)}–{fmtNum(snap.formation_base_m)} m
                    </div>
                  )}
                </div>
                <div>
                  <div className="hud-label mb-1">Upcoming</div>
                  {snap?.next_formation ? (
                    <>
                      <FormationChip name={snap.next_formation} size="md" />
                      <div className="num mt-1 text-[11px] text-amber">{fmtDepth(snap.distance_to_next_m ?? 0, 0)} ahead</div>
                    </>
                  ) : (
                    <span className="text-muted">TD in formation</span>
                  )}
                </div>
              </div>

              <div className="rounded-md border border-border bg-bg/50 p-3">
                <div className="flex items-center justify-between">
                  <span className="hud-label">Active risk</span>
                  {top ? <SeverityBadge severity={top.severity} /> : <span className="hud-label text-teal">Clear</span>}
                </div>
                {top ? (
                  <>
                    <div className="mt-1 text-[12px] font-medium text-text">{top.title}</div>
                    <div className="num mt-0.5 text-[11px] text-muted">
                      {top.citation} · {fmtDepth(top.distance_ahead_m, 0)} ahead
                    </div>
                  </>
                ) : (
                  <div className="mt-1 text-[12px] text-muted">No High / Critical offset event within 150 m ahead.</div>
                )}
              </div>
            </div>

            {/* live parameters */}
            <div className="col-span-12 grid grid-cols-2 gap-x-4 gap-y-3 md:col-span-8 lg:grid-cols-4">
              {PARAMS.map((p) => (
                <div key={p.key} className="rounded-md border border-border bg-bg/50 px-3 py-2">
                  <div className="flex items-baseline justify-between">
                    <span className="hud-label">{p.label}</span>
                    <span className="text-[10px] text-dim">{p.unit}</span>
                  </div>
                  <div className="num mt-0.5 text-[20px] leading-6 text-text">{snap ? fmtNum(snap.params[p.key], p.decimals) : "—"}</div>
                  <LiveSparkline values={snap ? snap.history.map((h) => h[p.key]) : []} width={150} height={26} color={p.color} className="mt-1 w-full" />
                </div>
              ))}
            </div>
          </div>

          {/* well path */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <HudLabel>Well path · formations · look-ahead window · offset risk markers</HudLabel>
              <span className="num text-[11px] text-muted">
                {markers.length} HIGH / CRITICAL OFFSET EVENTS · {radiusKm} KM
              </span>
            </div>
            {snap && active.data ? <DepthProgressBar formations={active.data.formations} currentDepth={snap.depth_m} plannedTd={snap.planned_td_m} markers={markers} /> : <div className="h-12 animate-pulse rounded-sm bg-surface-3/60" />}
          </div>

          {/* offset intelligence */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-4 lg:grid-cols-4">
            <KpiReadout size="sm" label="Nearest offset" value={nearest ? nearest.id : "—"} hint={nearest ? `${nearest.distance_km.toFixed(1)} km ${nearest.bearing} · ${nearest.event_count} incidents` : undefined} countUp={false} />
            <KpiReadout size="sm" label={`Offsets in ${radiusKm} km`} value={nearby.data?.count ?? 0} hint={nearby.data ? `${nearby.data.total_events} incidents · ${fmtNum(nearby.data.total_npt_hours, 0)} h NPT` : undefined} />
            <KpiReadout size="sm" label={`Key incidents · ${snap?.formation ?? "—"}`} value={currentFormationIncidents ?? 0} hint="in current formation, offset wells" />
            <KpiReadout size="sm" label="Next risk marker" value={alerts[0] ? alerts[0].distance_ahead_m : null} unit="m" tone={alerts[0] ? (alerts[0].severity === "Critical" ? "critical" : "high") : "teal"} hint={alerts[0] ? `${alerts[0].event_type} · ${alerts[0].well_id}` : "window clear"} />
          </div>
        </SectionCard>

        {/* ------------------------------------------------------------------ active intelligence */}
        <SectionCard
          className="col-span-12 xl:col-span-4"
          title="Active intelligence"
          subtitle={`${alerts.length} ACTIVE · ${radiusKm} KM · 150 M AHEAD`}
          actions={
            <Button asChild variant="chip">
              <Link href="/risk">
                Risk view <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          }
          bodyClassName="flex flex-col gap-3"
        >
          {top ? (
            <>
              <div className="flex items-center gap-2">
                <SeverityBadge severity={top.severity} size="md" />
                <span className="hud-label text-text">{top.title}</span>
                {top.is_demo && <span className="hud-label text-amber">DEMO</span>}
              </div>
              <p className="text-body text-text">{top.message}</p>
              <div className="rounded-md border border-border bg-bg/60 p-3">
                <div className="hud-label mb-1">Offset evidence</div>
                <p className="text-[12px] leading-4 text-muted">{top.evidence}</p>
              </div>
              <div className="rounded-md border border-amber/30 bg-amber-soft p-3">
                <div className="hud-label mb-1 text-amber">Recommended action</div>
                <p className="text-[12px] leading-4 text-text">{top.recommendation}</p>
              </div>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="num text-[11px] text-muted">
                  [{top.citation}] · {top.distance_km.toFixed(1)} km {top.bearing} · NPT {fmtNum(top.npt_hours, 1)} h
                </span>
                <Button asChild variant="default" size="sm">
                  <Link href={`/wells/${top.well_id}?event=${top.event_id}`}>View evidence</Link>
                </Button>
              </div>
            </>
          ) : (
            <EmptyState icon={ShieldAlert} tone="teal" title="No active alert" description={`Monitoring High / Critical offset events within ${radiusKm} km, 150 m ahead of the bit.`} className="flex-1" />
          )}
          {alerts.length > 1 && (
            <div className="border-t border-border pt-3">
              <div className="hud-label mb-1.5">Also in window</div>
              <ul className="space-y-1">
                {alerts.slice(1, 4).map((a) => (
                  <li key={a.id} className="flex items-center gap-2 text-[12px]">
                    <SeverityBadge severity={a.severity} variant="dot" />
                    <span className="text-text">{a.event_type}</span>
                    <span className="num text-muted">{a.citation}</span>
                    <span className="num ml-auto text-amber">{fmtDepth(a.distance_ahead_m, 0)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </SectionCard>

        {/* ------------------------------------------------------------------ map + formations + KPIs */}
        <SectionCard
          className="col-span-12 lg:col-span-6 xl:col-span-5"
          flush
          title="Nearby wells"
          subtitle={`${nearby.data?.count ?? "—"} OFFSETS IN ${radiusKm} KM · DARK CANVAS BASEMAP`}
          actions={
            <Button asChild variant="chip">
              <Link href="/map">
                Open map <Maximize2 className="h-3 w-3" />
              </Link>
            </Button>
          }
        >
          <div className="relative h-[300px] cursor-pointer" onClick={() => router.push("/map")} role="link" aria-label="Open the nearby wells map">
            {wells.data ? (
              <NearbyMap center={{ lat: wells.data.wells.find((w) => w.is_active)?.lat ?? 27.4821, lon: wells.data.wells.find((w) => w.is_active)?.lon ?? 95.1242, id: ACTIVE_WELL_ID }} wells={wells.data.wells} radiusKm={radiusKm} compact showDistanceLines={false} onSelect={(id) => router.push(id ? `/map?well=${id}` : "/map")} />
            ) : (
              <div className="plot-grid h-full w-full" />
            )}
            <div className="pointer-events-none absolute bottom-2 left-2 z-[1000] flex items-center gap-2">
              {nearest && (
                <span className="rounded-sm border border-border-strong bg-surface/90 px-2 py-1 text-[11px] text-muted backdrop-blur">
                  Nearest <span className="num text-text">{nearest.id}</span> · <span className="num">{nearest.distance_km.toFixed(1)} km {nearest.bearing}</span>
                </span>
              )}
            </div>
          </div>
        </SectionCard>

        <SectionCard className="col-span-12 lg:col-span-6 xl:col-span-4" title="Formations ahead" subtitle="RISK MARKERS FROM OFFSET EXPERIENCE">
          {!snap ? (
            <SkeletonList rows={3} />
          ) : snap.upcoming_formations.length === 0 ? (
            <EmptyState compact icon={Radar} title="Planned TD within current formation" />
          ) : (
            <ul className="space-y-2">
              {snap.upcoming_formations.map((f) => {
                const hits = alerts.filter((a) => a.formation === f.name);
                const worst = hits.sort((a, b) => ["Low", "Medium", "High", "Critical"].indexOf(b.severity) - ["Low", "Medium", "High", "Critical"].indexOf(a.severity))[0];
                return (
                  <li key={f.name} className="flex items-center gap-3 rounded-md border border-border bg-bg/40 px-3 py-2">
                    <FormationChip name={f.name} abbrev className="w-14 justify-center" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-body font-medium text-text">{f.name}</span>
                        <span className="num text-[12px] text-amber">{fmtDepth(f.distance_m, 0)} ahead</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[12px] text-muted">{f.risk_tendency}</span>
                        {worst && <SeverityBadge severity={worst.severity} className="shrink-0" label={`${hits.length} in window`} />}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard className="col-span-12 xl:col-span-3" title="Offset window" subtitle="COMPACT KPIS · SYNTHETIC DATA" bodyClassName="grid grid-cols-2 gap-x-4 gap-y-4 xl:grid-cols-1">
          <KpiReadout size="sm" label={`Offset wells · ${radiusKm} km`} value={stats.data?.offset_wells_in_radius ?? 0} hint={`${stats.data?.offset_events ?? 0} recorded incidents`} />
          <KpiReadout size="sm" label="Offset NPT hours" value={stats.data?.offset_npt_hours ?? 0} unit="h" hint={`${stats.data?.offset_high_critical ?? 0} high / critical`} />
          <KpiReadout size="sm" label="Indexed reports" value={stats.data?.indexed_reports ?? 0} hint={`${stats.data?.events_total ?? 0} events in knowledge base`} />
          <KpiReadout size="sm" label="Active alerts" value={alerts.length} tone={alerts.length ? (alerts[0].severity === "Critical" ? "critical" : "high") : "teal"} hint={alerts.length ? alerts[0].title : "150 m look-ahead clear"} />
        </SectionCard>
      </div>

      {/* alert feed */}
      <SectionCard title="Alert feed" subtitle="NEW ALERTS ALSO ARRIVE AS TOASTS" actions={<span className="inline-flex items-center gap-2"><StatusDot tone="teal" pulse /><span className="hud-label">{loading && !snap ? "Connecting" : "Monitoring"}</span></span>}>
        {alerts.length === 0 ? (
          <EmptyState compact icon={Activity} tone="teal" title="Feed clear" description="Alerts appear here as the bit approaches depths where offset wells had High or Critical incidents." />
        ) : (
          <ul className="divide-y divide-border">
            {alerts.map((a) => (
              <li key={a.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                <SeverityBadge severity={a.severity} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <span className="hud-label text-text">{a.title}</span>
                    <span className="num text-[11px] text-muted">{a.citation}</span>
                    {a.is_demo && <span className="hud-label text-amber">DEMO</span>}
                  </div>
                  <p className="text-[12px] leading-4 text-muted">{a.message}</p>
                  <p className="text-[12px] leading-4 text-dim">{a.recommendation}</p>
                </div>
                <div className="shrink-0 text-right">
                  <div className="num text-[12px] text-amber">{fmtDepth(a.distance_ahead_m, 0)}</div>
                  <Link href={`/wells/${a.well_id}?event=${a.event_id}`} className="text-[11px] text-muted hover:text-text hover:underline">
                    evidence
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
