"use client";
import { Layers, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

import { DepthHoverProvider, useDepthHover } from "@/components/depth-track/context";
import { DepthTrack, DepthTrackLegend, type HoverReadout } from "@/components/depth-track/DepthTrack";
import { DepthTrackControls } from "@/components/depth-track/DepthTrackControls";
import { DataChip, EmptyState, FormationChip, HudLabel, HudStrip, KpiReadout, PageHeader, SectionCard, SeverityBadge, SkeletonKpi, SkeletonTrack } from "@/components/nwis";
import { EventCard } from "@/components/nwis/EventCard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getWell } from "@/lib/api";
import { fmtCoord, fmtDate, fmtDepth, fmtNum } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { useLive } from "@/lib/live-context";
import type { WellDetail } from "@/lib/types";

export default function WellPage() {
  return (
    <Suspense fallback={<div className="p-4"><SkeletonTrack height={480} tracks={5} /></div>}>
      <WellPageInner />
    </Suspense>
  );
}

function WellPageInner() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const id = decodeURIComponent(params.id).toUpperCase();
  const initialEvent = search.get("event") ? Number(search.get("event")) : null;
  const { data: well, loading, error } = useAsync(() => getWell(id), [id]);
  const { snap } = useLive();
  const currentDepth = well?.is_active ? (snap?.depth_m ?? well.current_depth_m ?? null) : null;

  return (
    // remount once the record arrives so the zoom default reflects the well (active → centred on the bit; historical → fit whole well)
    <DepthHoverProvider key={`${id}-${well ? "ready" : "loading"}`} initialSelected={initialEvent} initialZoom={well?.is_active || initialEvent !== null ? 0.34 : null}>
      <div className="space-y-4 p-4">
        <PageHeader question="What happened while this well was drilled?">
          {well && (
            <HudStrip>
              <HudLabel value={well.field.toUpperCase()}>Field</HudLabel>
              <HudLabel value={`${fmtCoord(well.lat)} / ${fmtCoord(well.lon)}`}>Lat / Lon</HudLabel>
              <HudLabel value={well.rig}>Rig</HudLabel>
              <HudLabel value={well.well_type.toUpperCase()}>Type</HudLabel>
              <HudLabel value={well.is_active ? "DRILLING" : well.status.toUpperCase()} dot={well.is_active ? "amber" : undefined} pulse={well.is_active}>
                Status
              </HudLabel>
              {!well.is_active && well.distance_km !== undefined && <HudLabel value={`${well.distance_km.toFixed(1)} KM ${well.bearing ?? ""}`}>From active</HudLabel>}
            </HudStrip>
          )}
        </PageHeader>

        {error && !well ? (
          <EmptyState icon={Layers} title={`Well ${id} not found`} description={error} action={<Button asChild><Link href="/wells/DLJ-ACT-01">Open active well</Link></Button>} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
              {loading && !well ? (
                Array.from({ length: 5 }).map((_, i) => <SkeletonKpi key={i} className="rounded-card border border-border bg-surface p-4" />)
              ) : well ? (
                <>
                  <KpiReadout className="rounded-card border border-border bg-surface p-4" label={well.is_active ? "Current depth · MD" : "Total depth · MD"} value={well.is_active ? (currentDepth ?? well.total_depth_m) : well.total_depth_m} unit="m" decimals={well.is_active ? 1 : 0} tone="amber" hint={well.is_active ? `planned TD ${fmtDepth(well.total_depth_m, 0)}` : well.deepest_formation ? `TD in ${well.deepest_formation}` : undefined} />
                  <KpiReadout className="rounded-card border border-border bg-surface p-4" label="Recorded incidents" value={well.event_count} hint={`${well.high_critical_count} high / critical`} />
                  <KpiReadout className="rounded-card border border-border bg-surface p-4" label="Non-productive time" value={well.npt_hours} unit="h" decimals={1} />
                  <div className="rounded-card border border-border bg-surface p-4">
                    <div className="hud-label">Max severity</div>
                    <div className="mt-2">{well.max_severity ? <SeverityBadge severity={well.max_severity} size="md" /> : <span className="text-muted">—</span>}</div>
                    <div className="mt-1.5 text-[12px] text-muted">{Object.entries(well.events_by_type).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([t, n]) => `${n} ${t.toLowerCase()}`).join(" · ") || "no incidents"}</div>
                  </div>
                  <KpiReadout className="rounded-card border border-border bg-surface p-4" label="Spud date" value={fmtDate(well.spud_date)} countUp={false} hint={well.completion_date ? `completed ${fmtDate(well.completion_date)}` : "in progress"} />
                </>
              ) : null}
            </div>

            {well ? <TrackAndTabs well={well} currentDepth={currentDepth} /> : <SkeletonTrack height={520} tracks={5} className="rounded-card border border-border bg-surface p-4" />}
          </>
        )}
      </div>
    </DepthHoverProvider>
  );
}

function TrackAndTabs({ well, currentDepth }: { well: WellDetail; currentDepth: number | null }) {
  const [readout, setReadout] = useState<HoverReadout | null>(null);
  const { selectedEventId, setSelectedEventId, setHoverEventId, setHoverDepth } = useDepthHover();
  const [sort, setSort] = useState<"depth" | "severity">("depth");
  const events = useMemo(() => {
    const list = [...well.events];
    return sort === "depth" ? list.sort((a, b) => a.depth_m - b.depth_m) : list.sort((a, b) => b.severity_rank - a.severity_rank || b.npt_hours - a.npt_hours);
  }, [well.events, sort]);

  return (
    <div className="grid grid-cols-12 gap-4">
      <SectionCard
        className="col-span-12 xl:col-span-8"
        variant="hero"
        flush
        title="Well depth track"
        subtitle={
          readout ? (
            <span className="text-text">
              {fmtDepth(readout.depth, 0).toUpperCase()} · {readout.formation?.toUpperCase() ?? "—"}
              {readout.log && ` · ROP ${fmtNum(readout.log.rop, 1)} · TQ ${fmtNum(readout.log.torque, 1)} · MW ${readout.log.mud_weight.toFixed(2)} · ECD ${readout.log.ecd.toFixed(2)} · GAS ${fmtNum(readout.log.gas_units)}`}
              {readout.pressure && ` · PP ${readout.pressure.pore_pressure_ppg.toFixed(1)} · FG ${readout.pressure.fracture_gradient_ppg.toFixed(1)}`}
            </span>
          ) : (
            "HOVER FOR CROSSHAIR · CLICK AN EVENT TO PIN IT"
          )
        }
        actions={
          <>
            <DepthTrackControls />
            <DataChip variant="synthetic">Synthetic data</DataChip>
          </>
        }
        footer={<DepthTrackLegend />}
      >
        <DepthTrack
          wellId={well.id}
          totalDepth={well.total_depth_m}
          formations={well.formations}
          casing={well.casing}
          events={well.events}
          logs={well.logs}
          pressure={well.pressure_window}
          currentDepth={currentDepth}
          height={600}
          onReadout={setReadout}
        />
      </SectionCard>

      <SectionCard className="col-span-12 xl:col-span-4" title="Well record" subtitle={`${well.events.length} EVENTS · ${well.casing.length} CASING STRINGS · ${well.lessons.length} LESSONS`} bodyClassName="p-0">
        <Tabs defaultValue="events" className="flex h-full flex-col">
          <TabsList className="mx-4 mt-2">
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="casing">Casing &amp; cementing</TabsTrigger>
            <TabsTrigger value="lessons">Lessons learned</TabsTrigger>
          </TabsList>

          <TabsContent value="events" className="mt-0 flex-1">
            <div className="flex items-center justify-between px-4 py-2">
              <span className="hud-label">Sort</span>
              <div className="flex gap-1">
                <Button variant={sort === "depth" ? "default" : "chip"} size="sm" className="h-6 text-[11px]" onClick={() => setSort("depth")}>
                  Depth
                </Button>
                <Button variant={sort === "severity" ? "default" : "chip"} size="sm" className="h-6 text-[11px]" onClick={() => setSort("severity")}>
                  Severity
                </Button>
              </div>
            </div>
            <div className="max-h-[560px] space-y-2 overflow-y-auto px-4 pb-4">
              {events.length === 0 ? (
                <EmptyState compact icon={ShieldAlert} tone="teal" title="No incidents recorded" />
              ) : (
                events.map((e) => (
                  <EventCard
                    key={e.id}
                    event={e}
                    active={selectedEventId === e.id}
                    onHover={(id) => {
                      setHoverEventId(id);
                      setHoverDepth(id ? e.depth_m : null);
                    }}
                    onSelect={(id) => setSelectedEventId(selectedEventId === id ? null : id)}
                  />
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="casing" className="mt-0 px-4 pb-4">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="hud-label text-left">
                  <th className="py-2 font-normal">String</th>
                  <th className="py-2 font-normal">Size · hole</th>
                  <th className="py-2 text-right font-normal">Shoe</th>
                  <th className="py-2 text-right font-normal">TOC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {well.casing.map((c) => (
                  <tr key={c.id} className="align-top">
                    <td className="py-2 font-medium text-text">{c.string_type}</td>
                    <td className="num py-2 text-muted">
                      {c.size_in} · {c.hole_size_in}
                    </td>
                    <td className="num py-2 text-right text-text">{fmtDepth(c.shoe_depth_m, 0)}</td>
                    <td className="num py-2 text-right text-muted">{fmtDepth(c.cement_top_m, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 space-y-2">
              {well.casing.map((c) => (
                <div key={c.id} className="rounded-md border border-border bg-bg/50 px-3 py-2">
                  <div className="hud-label">{c.string_type} · cementing</div>
                  <p className="mt-0.5 text-[12px] leading-4 text-muted">{c.cementing_notes}</p>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="lessons" className="mt-0 max-h-[600px] space-y-2 overflow-y-auto px-4 pb-4">
            {well.lessons.length === 0 ? (
              <EmptyState compact icon={ShieldAlert} tone="teal" title="No lessons recorded" />
            ) : (
              well.lessons.map((l) => (
                <div key={l.event_id} className="rounded-md border border-border bg-surface px-3 py-2.5 hover:border-border-strong" onMouseEnter={() => setHoverDepth(l.depth_m)} onMouseLeave={() => setHoverDepth(null)}>
                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={l.severity} variant="dot" />
                    <span className="text-[12px] font-medium text-text">{l.event_type}</span>
                    <FormationChip name={l.formation} abbrev />
                    <button className="num ml-auto text-[11px] text-amber hover:underline" onClick={() => setSelectedEventId(l.event_id)}>
                      {l.citation}
                    </button>
                  </div>
                  <p className="mt-1 text-[12px] leading-4 text-muted">{l.lesson_learned}</p>
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </SectionCard>
    </div>
  );
}
