"use client";
import { GitCompareArrows, Plus, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { CorrelationPanel } from "@/components/correlation/CorrelationPanel";
import { DataChip, EmptyState, FormationChip, HudLabel, PageHeader, SectionCard, SeverityBadge, SkeletonTrack } from "@/components/nwis";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ACTIVE_WELL_ID, getCorrelation, getWells } from "@/lib/api";
import { fmtNum } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { formations as FORMATIONS } from "@/lib/tokens";
import { cn } from "@/lib/utils";

const DEFAULT_WELLS = ["DLJ-ACT-01", "DLJ-12", "DLJ-18", "NHK-07"];
const MAX_WELLS = 5;

export default function CorrelationPage() {
  return (
    <Suspense fallback={<div className="p-4"><SkeletonTrack height={480} tracks={4} /></div>}>
      <CorrelationInner />
    </Suspense>
  );
}

function CorrelationInner() {
  const search = useSearchParams();
  const initial = (search.get("wells") ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  const [ids, setIds] = useState<string[]>(initial.length >= 1 ? Array.from(new Set([ACTIVE_WELL_ID, ...initial])).slice(0, MAX_WELLS) : DEFAULT_WELLS);
  const [showCasing, setShowCasing] = useState(true);
  const [showEvents, setShowEvents] = useState(true);
  const [showFills, setShowFills] = useState(true);
  const [datum, setDatum] = useState<string>("none");
  const [hoverFormation, setHoverFormation] = useState<string | null>(null);
  const [adding, setAdding] = useState<string>("");

  const wells = useAsync(() => getWells(), []);
  const corr = useAsync(() => getCorrelation(ids), [ids.join(",")]);
  const data = corr.data;

  useEffect(() => {
    if (adding && !ids.includes(adding) && ids.length < MAX_WELLS) setIds((cur) => [...cur, adding]);
    if (adding) setAdding("");
  }, [adding, ids]);

  const candidates = useMemo(() => (wells.data?.wells ?? []).filter((w) => !ids.includes(w.id)).sort((a, b) => a.distance_km - b.distance_km), [wells.data, ids]);

  // incident matrix: formation × well
  const matrix = useMemo(() => {
    if (!data) return [];
    return data.formation_order
      .map((f) => ({
        formation: f,
        cells: data.wells.map((w) => {
          const evs = w.events.filter((e) => e.formation === f);
          const worst = [...evs].sort((a, b) => b.severity_rank - a.severity_rank)[0];
          const top = w.formations.find((t) => t.name === f);
          return { count: evs.length, worst: worst?.severity ?? null, top: top?.top_m ?? null, thickness: top ? top.base_m - top.top_m : null };
        }),
      }))
      .filter((r) => r.cells.some((c) => c.top !== null));
  }, [data]);

  return (
    <div className="space-y-4 p-4">
      <PageHeader question="Where do formations and incidents align?">
        <div className="flex flex-wrap items-center gap-2">
          {ids.map((id) => (
            <span key={id} className={cn("num inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[12px]", id === ACTIVE_WELL_ID ? "border-amber/40 bg-amber-soft text-amber" : "border-border bg-surface-2 text-text")}>
              {id}
              {ids.length > 1 && (
                <button onClick={() => setIds((cur) => cur.filter((x) => x !== id))} className="rounded-sm p-0.5 text-muted hover:text-text" aria-label={`Remove ${id}`}>
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
          {ids.length < MAX_WELLS && (
            <Select value={adding} onValueChange={setAdding}>
              <SelectTrigger className="h-7 w-[170px]" aria-label="Add well">
                <span className="inline-flex items-center gap-1 text-muted">
                  <Plus className="h-3.5 w-3.5" /> <SelectValue placeholder="Add offset well" />
                </span>
              </SelectTrigger>
              <SelectContent>
                {candidates.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    <span className="num">{w.id}</span> <span className="text-[11px] text-muted">· {w.distance_km.toFixed(1)} km {w.bearing}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <span className="mx-1 h-5 w-px bg-border" />
          <label className="flex items-center gap-2">
            <span className="hud-label">Casing</span>
            <Switch checked={showCasing} onCheckedChange={setShowCasing} aria-label="Toggle casing overlay" />
          </label>
          <label className="flex items-center gap-2">
            <span className="hud-label">Events</span>
            <Switch checked={showEvents} onCheckedChange={setShowEvents} aria-label="Toggle event overlay" />
          </label>
          <label className="flex items-center gap-2">
            <span className="hud-label">Section fill</span>
            <Switch checked={showFills} onCheckedChange={setShowFills} aria-label="Toggle cross-section fill" />
          </label>
          <Select value={datum} onValueChange={setDatum}>
            <SelectTrigger className="h-7 w-[190px]" aria-label="Datum">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Datum: true depth</SelectItem>
              {FORMATIONS.map((f) => (
                <SelectItem key={f.name} value={f.name}>
                  Flatten on {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </PageHeader>

      <div className="grid grid-cols-12 gap-4">
        <SectionCard
          className="col-span-12 xl:col-span-8"
          variant="hero"
          flush
          title="Offset well correlation"
          subtitle={hoverFormation ? <span className="text-text">{hoverFormation.toUpperCase()} · TOPS CONNECTED ACROSS {ids.length} WELLS</span> : `${ids.length} WELLS · ${data?.links.length ?? "—"} CORRELATED FORMATIONS · ${data?.event_count ?? "—"} INCIDENTS`}
          actions={<DataChip variant="synthetic">Synthetic data</DataChip>}
          footer={
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
              <span>Curved lines join equivalent formation tops; fills show the correlated interval between wells.</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-3 border border-text/70" /> casing shoe
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full border border-sev-high" /> incident (hover → equivalents)
              </span>
            </div>
          }
        >
          {data ? (
            <div className="p-3">
              <CorrelationPanel data={data} showCasing={showCasing} showEvents={showEvents} showFills={showFills} datum={datum === "none" ? null : datum} activeWellId={ACTIVE_WELL_ID} height={640} onHoverFormation={setHoverFormation} />
            </div>
          ) : corr.error ? (
            <EmptyState icon={GitCompareArrows} title="Correlation unavailable" description={corr.error} className="m-4" />
          ) : (
            <div className="p-4">
              <SkeletonTrack height={600} tracks={ids.length} />
            </div>
          )}
        </SectionCard>

        <div className="col-span-12 flex flex-col gap-4 xl:col-span-4">
          <SectionCard title="Formation tops" subtitle="TOP DEPTH · THICKNESS PER WELL" flush>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="hud-label border-b border-border text-left">
                    <th className="px-3 py-2 font-normal">Formation</th>
                    {data?.wells.map((w) => (
                      <th key={w.id} className={cn("num px-2 py-2 text-right font-normal", w.is_active && "text-amber")}>
                        {w.id.replace("DLJ-ACT-01", "ACT-01")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {matrix.map((r) => (
                    <tr key={r.formation} className={cn("transition-colors", hoverFormation === r.formation && "bg-surface-2")} onMouseEnter={() => setHoverFormation(r.formation)} onMouseLeave={() => setHoverFormation(null)}>
                      <td className="px-3 py-1.5">
                        <FormationChip name={r.formation} abbrev />
                      </td>
                      {r.cells.map((c, i) => (
                        <td key={i} className="num px-2 py-1.5 text-right">
                          {c.top === null ? (
                            <span className="text-dim">—</span>
                          ) : (
                            <>
                              <span className="text-text">{fmtNum(c.top)}</span>
                              <span className="block text-[10px] text-muted">{c.thickness ? `${fmtNum(c.thickness)} m` : ""}</span>
                            </>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard title="Incidents by formation" subtitle="COUNT · WORST SEVERITY" flush className="flex-1">
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="hud-label border-b border-border text-left">
                    <th className="px-3 py-2 font-normal">Formation</th>
                    {data?.wells.map((w) => (
                      <th key={w.id} className={cn("num px-2 py-2 text-center font-normal", w.is_active && "text-amber")}>
                        {w.id.replace("DLJ-ACT-01", "ACT-01")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {matrix.map((r) => (
                    <tr key={r.formation} className={cn(hoverFormation === r.formation && "bg-surface-2")} onMouseEnter={() => setHoverFormation(r.formation)} onMouseLeave={() => setHoverFormation(null)}>
                      <td className="px-3 py-1.5 text-text">{r.formation}</td>
                      {r.cells.map((c, i) => (
                        <td key={i} className="px-2 py-1.5 text-center">
                          {c.top === null ? (
                            <span className="text-dim">—</span>
                          ) : c.count === 0 ? (
                            <span className="text-dim">0</span>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <SeverityBadge severity={c.worst} variant="dot" />
                              <span className="num text-text">{c.count}</span>
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-border px-3 py-2">
              <HudLabel>Hover a row or column to highlight the formation in every well</HudLabel>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
