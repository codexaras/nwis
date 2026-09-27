"use client";
/** FIELD MODE dashboard: high-contrast, large type — depth, formation, active alert, recommended action. */
import { ShieldAlert } from "lucide-react";

import { FormationChip, HudLabel, SeverityBadge, severityTone } from "@/components/nwis";
import { DepthProgressBar } from "@/components/nwis/DepthProgressBar";
import { ACTIVE_WELL_ID, getNearby, getWell } from "@/lib/api";
import { fmtDepth, fmtNum } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { useLive } from "@/lib/live-context";

export function FieldDashboard() {
  const { snap, alerts, radiusKm, offline } = useLive();
  const active = useAsync(() => getWell(ACTIVE_WELL_ID), []);
  const nearby = useAsync(() => getNearby(radiusKm), [radiusKm]);
  const markers = (nearby.data?.wells ?? []).flatMap((w) => w.key_events.filter((e) => e.severity === "High" || e.severity === "Critical").map((e) => ({ depth_m: e.depth_m, severity: e.severity })));
  const top = snap?.top_alert ?? null;
  const tone = top ? severityTone(top.severity) : undefined;
  return (
    <div className="space-y-5 p-5" data-testid="field-dashboard">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <HudLabel dot={offline ? "amber" : "teal"} pulse className="[&>span:last-child]:text-[13px]">
            {offline ? "OFFLINE SIM" : "LIVE · SIMULATED"}
          </HudLabel>
          <HudLabel value={snap?.well_id ?? "—"} valueClassName="text-[14px] text-amber">
            Well
          </HudLabel>
          <HudLabel value={`${radiusKm} KM`} valueClassName="text-[14px]">
            Window
          </HudLabel>
        </div>
        <HudLabel value={snap?.clock_ist ?? "—"} valueClassName="text-[14px]">
          Last update
        </HudLabel>
      </div>

      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-12 rounded-card border border-border bg-surface p-6 lg:col-span-5">
          <div className="hud-label text-[13px]">Current depth · MD</div>
          <div className="num mt-2 text-[96px] font-medium leading-[96px] tracking-tight text-amber" style={{ textShadow: "0 0 32px rgba(245,158,11,0.3)" }}>
            {snap ? fmtNum(snap.depth_m, 1) : "——"}
            <span className="ml-3 text-[36px] font-normal text-muted">m</span>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-6">
            <div>
              <div className="hud-label text-[13px]">Formation</div>
              <div className="mt-2 text-[28px] font-semibold leading-8 text-text">{snap?.formation ?? "—"}</div>
              {snap && <FormationChip name={snap.formation} size="md" className="mt-2" />}
            </div>
            <div>
              <div className="hud-label text-[13px]">Next formation</div>
              <div className="mt-2 text-[28px] font-semibold leading-8 text-text">{snap?.next_formation ?? "—"}</div>
              <div className="num mt-1 text-[20px] text-amber">{snap?.next_formation ? `${fmtDepth(snap.distance_to_next_m ?? 0, 0)} ahead` : ""}</div>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-4 gap-4 border-t border-border pt-5">
            {(
              [
                ["ROP", snap?.params.rop, "m/hr", 1],
                ["Torque", snap?.params.torque, "kft·lb", 1],
                ["MW", snap?.params.mud_weight, "ppg", 2],
                ["Gas", snap?.params.gas_units, "units", 0],
              ] as const
            ).map(([l, v, u, d]) => (
              <div key={l}>
                <div className="hud-label text-[12px]">{l}</div>
                <div className="num text-[30px] leading-9 text-text">{v !== undefined ? fmtNum(v, d) : "—"}</div>
                <div className="text-[12px] text-muted">{u}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="col-span-12 flex flex-col gap-5 lg:col-span-7">
          <div className="relative overflow-hidden rounded-card border bg-surface p-6" style={{ borderColor: tone ? `${tone}80` : undefined }}>
            {tone && <span className="absolute inset-y-0 left-0 w-2" style={{ background: tone, boxShadow: `0 0 20px ${tone}` }} />}
            {top ? (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <SeverityBadge severity={top.severity} size="md" className="text-[13px]" />
                  <span className="text-[26px] font-semibold leading-8 text-text">{top.title}</span>
                  <span className="num ml-auto text-[26px] text-amber">{fmtDepth(top.distance_ahead_m, 0)} ahead</span>
                </div>
                <p className="mt-3 text-[19px] leading-7 text-text">{top.message}</p>
                <div className="mt-4 rounded-md border border-amber/40 bg-amber-soft p-4">
                  <div className="hud-label text-[13px] text-amber">Recommended action</div>
                  <p className="mt-1 text-[19px] leading-7 text-text">{top.recommendation}</p>
                </div>
                <div className="num mt-3 text-[14px] text-muted">
                  Evidence [{top.citation}] · {top.distance_km.toFixed(1)} km {top.bearing} · NPT {fmtNum(top.npt_hours, 1)} h
                </div>
              </>
            ) : (
              <div className="flex items-center gap-4 py-6">
                <ShieldAlert className="h-10 w-10 text-teal" />
                <div>
                  <div className="text-[26px] font-semibold text-text">No active alert</div>
                  <div className="text-[16px] text-muted">Monitoring offset wells within {radiusKm} km, 150 m ahead of the bit.</div>
                </div>
              </div>
            )}
          </div>

          {alerts.length > 1 && (
            <div className="rounded-card border border-border bg-surface p-5">
              <div className="hud-label text-[13px]">Also in window</div>
              <ul className="mt-3 divide-y divide-border">
                {alerts.slice(1, 5).map((a) => (
                  <li key={a.id} className="flex items-center gap-4 py-3">
                    <SeverityBadge severity={a.severity} size="md" />
                    <span className="text-[18px] text-text">{a.event_type}</span>
                    <span className="num text-[16px] text-muted">
                      {a.well_id} · {fmtDepth(a.depth_m, 0)}
                    </span>
                    <span className="num ml-auto text-[20px] text-amber">{fmtDepth(a.distance_ahead_m, 0)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* look-ahead strip + formations ahead, large */}
      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-12 rounded-card border border-border bg-surface p-5 lg:col-span-7">
          <div className="mb-2 flex items-center justify-between">
            <span className="hud-label text-[13px]">Well path · look-ahead window · offset risk markers</span>
            <span className="num text-[13px] text-muted">{markers.length} HIGH / CRITICAL OFFSET EVENTS</span>
          </div>
          {snap && active.data ? <DepthProgressBar formations={active.data.formations} currentDepth={snap.depth_m} plannedTd={snap.planned_td_m} markers={markers} height={72} /> : <div className="h-[72px] animate-pulse rounded-sm bg-surface-3/60" />}
        </div>
        <div className="col-span-12 rounded-card border border-border bg-surface p-5 lg:col-span-5">
          <div className="hud-label text-[13px]">Formations ahead</div>
          <ul className="mt-3 space-y-3">
            {(snap?.upcoming_formations ?? []).slice(0, 3).map((f) => (
              <li key={f.name} className="flex items-center gap-4">
                <FormationChip name={f.name} abbrev size="md" className="w-16 justify-center" />
                <span className="text-[20px] font-semibold text-text">{f.name}</span>
                <span className="num ml-auto text-[22px] text-amber">{fmtDepth(f.distance_m, 0)}</span>
              </li>
            ))}
            {snap && snap.upcoming_formations.length === 0 && <li className="text-[16px] text-muted">Planned TD within the current formation.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
