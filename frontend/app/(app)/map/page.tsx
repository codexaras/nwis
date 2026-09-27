"use client";
import { Filter, MapPinned } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { NearbyMap } from "@/components/map/NearbyMapDynamic";
import { WellDrawer } from "@/components/map/WellDrawer";
import { DataChip, EmptyState, HudLabel, SkeletonTrack } from "@/components/nwis";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ACTIVE_WELL_ID, getNearby, getWells } from "@/lib/api";
import { fmtNum } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { useLive } from "@/lib/live-context";
import { eventTypes, formations as FORMATIONS, severityColor } from "@/lib/tokens";

const ALL = "__all__";

export default function MapPage() {
  return (
    <Suspense fallback={<div className="p-4"><SkeletonTrack height={480} tracks={3} /></div>}>
      <MapPageInner />
    </Suspense>
  );
}

function MapPageInner() {
  const router = useRouter();
  const search = useSearchParams();
  const { radiusKm, setRadiusKm, snap } = useLive();
  const [localRadius, setLocalRadius] = useState(radiusKm);
  const [type, setType] = useState<string>(ALL);
  const [formation, setFormation] = useState<string>(ALL);
  const [selected, setSelected] = useState<string | null>(search.get("well"));

  useEffect(() => setLocalRadius(radiusKm), [radiusKm]);

  const wells = useAsync(() => getWells(), []);
  const filtered = useAsync(
    () => (type !== ALL || formation !== ALL ? getNearby(radiusKm, ACTIVE_WELL_ID, { type: type === ALL ? undefined : type, formation: formation === ALL ? undefined : formation }) : Promise.resolve(null)),
    [radiusKm, type, formation],
  );
  const nearby = useAsync(() => getNearby(radiusKm), [radiusKm]);

  const active = wells.data?.wells.find((w) => w.is_active);
  const center = active ? { lat: active.lat, lon: active.lon, id: active.id } : { lat: 27.4821, lon: 95.1242, id: ACTIVE_WELL_ID };
  const highlightIds = useMemo(() => (filtered.data ? new Set(filtered.data.wells.map((w) => w.id)) : null), [filtered.data]);
  const matchCounts = useMemo(() => (filtered.data ? Object.fromEntries(filtered.data.wells.map((w) => [w.id, w.event_count])) : undefined), [filtered.data]);
  const filterActive = type !== ALL || formation !== ALL;
  const inWindow = nearby.data?.count ?? 0;

  return (
    <div className="relative h-[calc(100vh-56px)] w-full overflow-hidden">
      {wells.data ? (
        <NearbyMap center={center} wells={wells.data.wells} radiusKm={radiusKm} selectedId={selected} onSelect={(id) => setSelected(id)} highlightIds={highlightIds} matchCounts={matchCounts} />
      ) : wells.error ? (
        <EmptyState icon={MapPinned} title="Map unavailable" description={wells.error} className="m-4" />
      ) : (
        <div className="plot-grid h-full w-full" />
      )}

      {/* floating controls — left column */}
      <div className="absolute left-3 top-3 z-[1000] flex w-[280px] flex-col gap-3">
        <div className="rounded-card border border-border-strong bg-surface/92 p-3 shadow-card backdrop-blur">
          <div className="flex items-center justify-between">
            <HudLabel dot="amber" pulse>
              Offset window
            </HudLabel>
            <span className="num text-[13px] text-amber">{localRadius} km</span>
          </div>
          <Slider className="mt-3" min={1} max={25} step={1} value={[localRadius]} onValueChange={([v]) => setLocalRadius(v)} onValueCommit={([v]) => setRadiusKm(v)} aria-label="Offset window radius" />
          <div className="num mt-1 flex justify-between text-[10px] text-dim">
            <span>1 km</span>
            <span>25 km</span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3">
            <div>
              <div className="hud-label">Wells</div>
              <div className="num text-[15px] text-text">{nearby.data ? inWindow : "—"}</div>
            </div>
            <div>
              <div className="hud-label">Incidents</div>
              <div className="num text-[15px] text-text">{nearby.data ? nearby.data.total_events : "—"}</div>
            </div>
            <div>
              <div className="hud-label">NPT</div>
              <div className="num text-[15px] text-text">{nearby.data ? `${fmtNum(nearby.data.total_npt_hours, 0)} h` : "—"}</div>
            </div>
          </div>
        </div>

        <div className="rounded-card border border-border-strong bg-surface/92 p-3 shadow-card backdrop-blur">
          <div className="flex items-center justify-between">
            <HudLabel>
              <Filter className="mr-1 inline h-3 w-3" />
              Filter offsets
            </HudLabel>
            {filterActive && (
              <button
                className="text-[11px] text-amber hover:underline"
                onClick={() => {
                  setType(ALL);
                  setFormation(ALL);
                }}
              >
                Clear
              </button>
            )}
          </div>
          <div className="mt-2 grid gap-2">
            <Select value={type} onValueChange={setType}>
              <SelectTrigger aria-label="Event type">
                <SelectValue placeholder="Event type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All event types</SelectItem>
                {eventTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={formation} onValueChange={setFormation}>
              <SelectTrigger aria-label="Formation">
                <SelectValue placeholder="Formation" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All formations</SelectItem>
                {FORMATIONS.map((f) => (
                  <SelectItem key={f.name} value={f.name}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {filterActive && (
            <div className="mt-2 text-[11px] text-muted">
              {filtered.data ? `${filtered.data.count} well${filtered.data.count === 1 ? "" : "s"} with matching incidents · ${filtered.data.total_events} events` : "Filtering…"}
            </div>
          )}
        </div>
      </div>

      {/* top-right HUD */}
      <div className="absolute right-3 top-3 z-[1000] flex flex-col items-end gap-2">
        <div className="flex items-center gap-2">
          <DataChip variant="synthetic">Synthetic data</DataChip>
          <DataChip variant="simulated">Live · simulated</DataChip>
        </div>
        <div className="rounded-md border border-border-strong bg-surface/92 px-3 py-2 shadow-card backdrop-blur">
          <div className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1">
            <HudLabel value={center.id} valueClassName="text-amber">
              Active well
            </HudLabel>
            <HudLabel value={snap ? `${fmtNum(snap.depth_m, 1)} M` : "—"}>Bit depth</HudLabel>
            <HudLabel value={`${center.lat.toFixed(4)} / ${center.lon.toFixed(4)}`}>Lat / Lon</HudLabel>
            <HudLabel value={snap?.formation.toUpperCase() ?? "—"}>Formation</HudLabel>
          </div>
          <div className="mt-2 flex justify-end border-t border-border pt-2">
            <Button variant="chip" onClick={() => router.push("/correlation")}>
              Compare offsets
            </Button>
          </div>
        </div>
      </div>

      {/* legend */}
      <div className="absolute bottom-3 left-[68px] z-[1000] rounded-md border border-border-strong bg-surface/92 px-3 py-2 shadow-card backdrop-blur">
        <div className="hud-label mb-1.5">Legend</div>
        <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-[11px] text-muted">
          <span className="inline-flex items-center gap-2">
            <span className="relative inline-block h-3 w-3 rounded-full bg-amber shadow-[0_0_8px_#F59E0B]" /> Active well · drilling
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full border border-dashed border-amber/70" /> Offset window
          </span>
          {(["Low", "Medium", "High", "Critical"] as const).map((s) => (
            <span key={s} className="inline-flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-text" style={{ boxShadow: `0 0 0 2px ${severityColor[s]}` }} /> Max severity {s.toLowerCase()}
            </span>
          ))}
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-dim opacity-50" /> Beyond window
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-0.5 w-4 border-t border-dashed border-amber/70" /> Distance to nearest
          </span>
        </div>
      </div>

      {/* drawer */}
      <WellDrawer wellId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
