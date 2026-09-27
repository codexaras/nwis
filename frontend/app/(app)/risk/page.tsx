"use client";
import { ArrowUpRight, Radar, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { DataChip, EmptyState, FormationChip, HudLabel, KpiReadout, PageHeader, SectionCard, SeverityBadge, SkeletonList, SkeletonTrack } from "@/components/nwis";
import { ForwardRiskWindow, LEVEL_COLOR, zoneKey } from "@/components/risk/ForwardRiskWindow";
import { RiskHeatmap } from "@/components/risk/RiskHeatmap";
import { Button } from "@/components/ui/button";
import { ACTIVE_WELL_ID, getRisk } from "@/lib/api";
import { fmtDepth, fmtNum } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { useLive } from "@/lib/live-context";
import type { RiskZone } from "@/lib/types";
import { cn } from "@/lib/utils";

const LEVEL_TO_SEV: Record<string, string> = { Critical: "Critical", High: "High", Medium: "Medium", Low: "Low", Safe: "Low" };

export default function RiskPage() {
  const { snap, radiusKm, focusWellId } = useLive();
  const wellId = focusWellId || ACTIVE_WELL_ID;
  const risk = useAsync(() => getRisk(wellId, radiusKm), [wellId, radiusKm]);
  const profile = risk.data;
  const isActive = profile?.is_active ?? wellId === ACTIVE_WELL_ID;
  const currentDepth = isActive ? (snap?.depth_m ?? profile?.current_depth_m ?? null) : null;

  // zones ahead of the live bit (re-clipped client-side so the window follows the simulation)
  const zones = useMemo<RiskZone[]>(() => {
    if (!profile) return [];
    const src = profile.top_risks;
    if (currentDepth === null) return src.slice(0, 8);
    const clipped: RiskZone[] = [];
    for (const z of src) {
      const ahead = z.bins.filter((b) => b.depth_m + profile.bin_m / 2 > currentDepth);
      if (!ahead.length) continue;
      const peak = ahead.reduce((a, b) => (b.score > a.score ? b : a));
      const level = peak.score >= 80 ? "Critical" : peak.score >= 60 ? "High" : peak.score >= 40 ? "Medium" : "Low";
      const from = Math.max(z.depth_from_m, currentDepth);
      clipped.push({ ...z, ahead: true, depth_from_m: from, depth_m: peak.depth_m, score: peak.score, level, distance_ahead_m: Math.max(0, from - currentDepth) });
    }
    return clipped.sort((a, b) => b.score - a.score || a.depth_m - b.depth_m);
  }, [profile, currentDepth]);

  const [selected, setSelected] = useState<string | null>(null);
  const [windowHeight, setWindowHeight] = useState(620);
  useEffect(() => {
    const fit = () => setWindowHeight(Math.max(560, Math.min(900, window.innerHeight - 320)));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  useEffect(() => {
    if (zones.length && (selected === null || !zones.some((z) => zoneKey(z) === selected))) setSelected(zoneKey(zones[0]));
  }, [zones, selected]);
  const zone = zones.find((z) => zoneKey(z) === selected) ?? zones[0] ?? null;

  return (
    <div className="space-y-4 p-4">
      <PageHeader question="What problems may occur ahead?">
        {profile && (
          <div className="flex flex-wrap items-center gap-4">
            <HudLabel value={profile.well_id} valueClassName="text-amber">
              Well
            </HudLabel>
            <HudLabel value={`${profile.radius_km} KM · ${profile.offset_wells.length} OFFSETS`}>Window</HudLabel>
            <HudLabel value={currentDepth !== null ? fmtDepth(currentDepth).toUpperCase() : "FULL PROFILE"}>{currentDepth !== null ? "Current bit" : "Scope"}</HudLabel>
            <HudLabel value={`${zones.length}`}>Zones ahead</HudLabel>
            <HudLabel dot="teal">Model risk engine · ready</HudLabel>
          </div>
        )}
      </PageHeader>

      <div className="grid grid-cols-12 gap-4">
        {/* hero */}
        <SectionCard
          className="col-span-12 xl:col-span-7"
          variant="hero"
          flush
          title="Forward drilling risk window"
          subtitle={currentDepth !== null ? `FROM BIT ${fmtDepth(currentDepth).toUpperCase()} → TD ${fmtDepth(profile?.planned_td_m ?? 0, 0).toUpperCase()}` : `FULL WELL · TD ${profile ? fmtDepth(profile.planned_td_m, 0).toUpperCase() : "—"}`}
          actions={<DataChip variant="synthetic">Synthetic data</DataChip>}
          footer={
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {(["Critical", "High", "Medium"] as const).map((l) => (
                <span key={l} className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] text-muted">
                  <span className="inline-block h-2 w-3 rounded-sm" style={{ background: LEVEL_COLOR[l], opacity: 0.8 }} />
                  {l}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] text-muted">
                <span className="inline-block h-0.5 w-3 border-t border-dashed border-teal" /> Safe
              </span>
              <span className="ml-auto">Bands = predicted zones from offset experience in the same formation + RandomForest on drilling parameters. Overlapping zones sit side by side. Click a band for its evidence.</span>
            </div>
          }
        >
          {profile ? (
            <div className="p-3">
              <ForwardRiskWindow profile={profile} zones={zones} currentDepth={currentDepth} selectedKey={selected} onSelect={setSelected} height={windowHeight} />
            </div>
          ) : risk.error ? (
            <EmptyState icon={Radar} title="Risk profile unavailable" description={risk.error} className="m-4" />
          ) : (
            <div className="p-4">
              <SkeletonTrack height={600} tracks={2} />
            </div>
          )}
        </SectionCard>

        {/* why this risk + zones list */}
        <div className="col-span-12 flex flex-col gap-4 xl:col-span-5">
          <SectionCard title="Why this risk?" subtitle={zone ? `${zone.event_type.toUpperCase()} · ${zone.formation.toUpperCase()} · ${fmtNum(zone.depth_from_m)}–${fmtNum(zone.depth_to_m)} M` : "SELECT A ZONE"} bodyClassName="space-y-3">
            {!zone ? (
              <EmptyState compact icon={ShieldAlert} tone="teal" title="No risk zones ahead" description="The remaining interval scores below the reporting threshold." />
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <SeverityBadge severity={LEVEL_TO_SEV[zone.level]} size="md" label={zone.level} />
                      <span className="text-title font-semibold text-text">{zone.event_type}</span>
                      <FormationChip name={zone.formation} />
                    </div>
                    <div className="num mt-1 text-[12px] text-muted">
                      peak at {fmtDepth(zone.depth_m, 0)}
                      {zone.distance_ahead_m !== undefined && currentDepth !== null ? ` · ${fmtDepth(zone.distance_ahead_m, 0)} ahead of the bit` : ""}
                    </div>
                  </div>
                  <KpiReadout label="Score" value={zone.score} unit="%" size="md" tone={zone.level === "Critical" ? "critical" : zone.level === "High" ? "high" : "amber"} countUp={false} />
                </div>

                <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {zone.why.map((w) => (
                    <li key={w} className="flex items-start gap-2 text-[12px] text-text">
                      <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber" />
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>

                <div>
                  <div className="hud-label mb-1">Indicators to watch</div>
                  <div className="flex flex-wrap gap-1.5">
                    {zone.indicators.map((i) => (
                      <span key={i} className="rounded-sm border border-border bg-surface-2 px-2 py-0.5 text-[11px] text-text">
                        {i}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="rounded-md border border-amber/30 bg-amber-soft p-3">
                  <div className="hud-label mb-1 text-amber">Recommended action</div>
                  <p className="text-[12px] leading-4 text-text">{zone.recommended_action}</p>
                  {zone.recommended_mud_weight_ppg && (
                    <div className="num mt-1.5 text-[12px] text-amber">Recommended MW {zone.recommended_mud_weight_ppg.toFixed(1)} ppg</div>
                  )}
                </div>

                <div>
                  <div className="hud-label mb-1.5">Contributing offset wells · {zone.evidence_count} events</div>
                  <ul className="divide-y divide-border">
                    {zone.contributing_wells.slice(0, 5).map((w) => (
                      <li key={w.well_id} className="flex items-start gap-3 py-1.5">
                        <Link href={`/wells/${w.well_id}`} className="num w-16 shrink-0 text-[12px] text-amber hover:underline">
                          {w.well_id}
                        </Link>
                        <span className="num w-20 shrink-0 text-[11px] text-muted">
                          {w.distance_km.toFixed(1)} km {w.bearing}
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {w.events.map((e) => (
                            <Link key={e.event_id} href={`/wells/${w.well_id}?event=${e.event_id}`} className="num inline-flex items-center gap-1 rounded-sm border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] text-text hover:border-border-strong">
                              <SeverityBadge severity={e.severity} variant="dot" />
                              {fmtNum(e.depth_m)} m
                            </Link>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </SectionCard>

          <SectionCard title="Upcoming risk zones" subtitle="RANKED BY SCORE · CLICK TO INSPECT" flush className="flex-1">
            {!profile ? (
              <SkeletonList rows={5} className="p-4" />
            ) : zones.length === 0 ? (
              <EmptyState compact icon={ShieldAlert} tone="teal" title="No zones above threshold" className="m-4" />
            ) : (
              <ul className="divide-y divide-border">
                {zones.map((z) => {
                  const key = zoneKey(z);
                  const on = key === selected;
                  return (
                    <li key={key}>
                      <button onClick={() => setSelected(key)} className={cn("flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-surface-2", on && "bg-surface-2")}>
                        <span className="num w-[68px] shrink-0 whitespace-nowrap text-[12px] text-text">{fmtNum(z.depth_m)} m</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[12px] font-medium text-text">{z.event_type}</span>
                            <FormationChip name={z.formation} abbrev />
                            <span className="num ml-auto text-[11px] text-muted">{z.evidence_count} ev</span>
                          </div>
                          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface-3">
                            <div className="h-full rounded-full" style={{ width: `${z.score}%`, background: LEVEL_COLOR[z.level] }} />
                          </div>
                        </div>
                        <span className="num w-10 shrink-0 text-right text-[12px]" style={{ color: LEVEL_COLOR[z.level] }}>
                          {Math.round(z.score)}%
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>

      {/* heatmap */}
      <SectionCard
        title="Depth × event-type heatmap"
        subtitle="SECONDARY ANALYTICAL VIEW · 50 M BINS · FULL WELL"
        actions={
          <Button asChild variant="chip">
            <Link href={`/wells/${wellId}`}>
              Well profile <ArrowUpRight className="h-3 w-3" />
            </Link>
          </Button>
        }
        footer={profile ? `Offsets considered: ${profile.offset_wells.map((w) => `${w.well_id} (${w.distance_km} km)`).slice(0, 8).join(" · ")}${profile.offset_wells.length > 8 ? ` · +${profile.offset_wells.length - 8} more` : ""} · deterministic (seed 42)` : undefined}
      >
        {profile ? <RiskHeatmap profile={profile} currentDepth={currentDepth} /> : <SkeletonList rows={6} />}
      </SectionCard>
    </div>
  );
}
