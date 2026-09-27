"use client";
import { BookOpenText, Search, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { DataChip, EmptyState, HudLabel, PageHeader, SectionCard, SeverityBadge, SkeletonList } from "@/components/nwis";
import { EventCard } from "@/components/nwis/EventCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { Switch } from "@/components/ui/switch";
import { getEvents } from "@/lib/api";
import { fmtNum } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { useLive } from "@/lib/live-context";
import { formationColor, type FormationName } from "@/lib/tokens";
import type { DrillingEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

const QUICK = ["stuck pipe barail", "losses tipam", "kick kopili", "cementing", "torque coal seams", "sylhet limestone"];
const PAGE = 20;

export default function KnowledgePage() {
  return (
    <Suspense fallback={<div className="p-4"><SkeletonList rows={8} /></div>}>
      <KnowledgeInner />
    </Suspense>
  );
}

function KnowledgeInner() {
  const search = useSearchParams();
  const { radiusKm } = useLive();
  const [q, setQ] = useState(search.get("q") ?? "");
  const [debounced, setDebounced] = useState(q);
  const [type, setType] = useState<string | null>(null);
  const [formation, setFormation] = useState<string | null>(null);
  const [severity, setSeverity] = useState<string | null>(null);
  const [nearbyOnly, setNearbyOnly] = useState(false);
  const [ingestedOnly, setIngestedOnly] = useState(false);
  const [items, setItems] = useState<DrillingEvent[]>([]);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 280);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    setOffset(0);
  }, [debounced, type, formation, severity, nearbyOnly, ingestedOnly]);

  const res = useAsync(
    () => getEvents({ search: debounced || undefined, type: type ?? undefined, formation: formation ?? undefined, severity: severity ?? undefined, radius_km: nearbyOnly ? radiusKm : undefined, origin: ingestedOnly ? "upload" : undefined, limit: PAGE, offset }),
    [debounced, type, formation, severity, nearbyOnly, ingestedOnly, offset, radiusKm],
  );
  useEffect(() => {
    if (!res.data) return;
    setItems((cur) => (offset === 0 ? res.data!.items : [...cur, ...res.data!.items]));
  }, [res.data, offset]);

  const facets = res.data?.facets;
  const total = res.data?.total ?? 0;
  const activeFilters = [type, formation, severity].filter(Boolean).length + (nearbyOnly ? 1 : 0) + (ingestedOnly ? 1 : 0);
  const lessons = useMemo(() => Array.from(new Set(items.slice(0, 12).map((e) => e.lesson_learned).filter(Boolean))).slice(0, 3), [items]);

  const FacetList = ({ title, entries, value, onChange, color }: { title: string; entries: [string, number][]; value: string | null; onChange: (v: string | null) => void; color?: (k: string) => string | undefined }) => {
    const max = Math.max(1, ...entries.map((e) => e[1]));
    return (
      <div>
        <div className="hud-label mb-1.5">{title}</div>
        <ul className="space-y-0.5">
          {entries.map(([k, n]) => (
            <li key={k}>
              <button onClick={() => onChange(value === k ? null : k)} className={cn("group flex w-full items-center gap-2 rounded-sm px-1.5 py-1 text-left text-[12px] transition-colors hover:bg-surface-2", value === k ? "bg-surface-2 text-text" : "text-muted")}>
                {color?.(k) && <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: color(k) }} />}
                <span className="flex-1 truncate">{k}</span>
                <span className="relative h-1.5 w-12 overflow-hidden rounded-full bg-surface-3">
                  <span className="absolute inset-y-0 left-0 rounded-full bg-amber/70" style={{ width: `${(n / max) * 100}%` }} />
                </span>
                <span className="num w-6 text-right">{n}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div className="space-y-4 p-4">
      <PageHeader question="What has historical experience taught us?">
        <HudLabel value={res.data ? `${fmtNum(total)} RESULTS · ${res.data.ranking.toUpperCase()}` : "—"}>Index</HudLabel>
      </PageHeader>

      <div className="grid grid-cols-12 gap-4">
        {/* filters */}
        <SectionCard className="col-span-12 xl:col-span-3" title="Filters" subtitle={activeFilters ? `${activeFilters} ACTIVE` : "EVENT TYPE · FORMATION · SEVERITY"} actions={activeFilters ? <Button variant="chip" onClick={() => { setType(null); setFormation(null); setSeverity(null); setNearbyOnly(false); setIngestedOnly(false); }}>Clear</Button> : undefined} bodyClassName="space-y-5">
          <div className="space-y-2.5">
            <label className="flex items-center justify-between">
              <span className="text-[12px] text-text">Within {radiusKm} km of the active well</span>
              <Switch checked={nearbyOnly} onCheckedChange={setNearbyOnly} aria-label="Nearby wells only" />
            </label>
            <label className="flex items-center justify-between">
              <span className="text-[12px] text-text">Ingested documents only</span>
              <Switch checked={ingestedOnly} onCheckedChange={setIngestedOnly} aria-label="Ingested events only" />
            </label>
          </div>
          {facets ? (
            <>
              <FacetList title="Event type" entries={Object.entries(facets.event_types).filter((e) => e[1] > 0).sort((a, b) => b[1] - a[1])} value={type} onChange={setType} />
              <FacetList title="Formation" entries={Object.entries(facets.formations).filter((e) => e[1] > 0)} value={formation} onChange={setFormation} color={(k) => formationColor[k as FormationName]} />
              <div>
                <div className="hud-label mb-1.5">Severity</div>
                <div className="flex flex-wrap gap-1.5">
                  {(["Critical", "High", "Medium", "Low"] as const).map((s) => (
                    <button key={s} onClick={() => setSeverity(severity === s ? null : s)} className={cn("rounded-sm transition-opacity", severity && severity !== s && "opacity-40")}>
                      <SeverityBadge severity={s} size="md" label={`${s} ${facets.severities[s] ?? 0}`} />
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <SkeletonList rows={6} />
          )}
        </SectionCard>

        {/* results */}
        <div className="col-span-12 flex flex-col gap-4 xl:col-span-9">
          <SectionCard flush>
            <div className="flex items-center gap-3 px-4 py-3">
              <Search className="h-4 w-4 shrink-0 text-muted" />
              <Input id="knowledge-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search events, mitigations and lessons — e.g. stuck pipe in Barail, losses with 9.9 ppg, remedial squeeze" className="h-9 border-0 bg-transparent px-0 text-[14px] focus-visible:ring-0" aria-label="Search the knowledge base" />
              {q && (
                <button onClick={() => setQ("")} className="rounded-sm p-1 text-muted hover:text-text" aria-label="Clear search">
                  <X className="h-4 w-4" />
                </button>
              )}
              <DataChip variant="synthetic">Synthetic data</DataChip>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-4 py-2">
              <span className="hud-label mr-1">Quick</span>
              {QUICK.map((k) => (
                <button key={k} onClick={() => setQ(k)} className={cn("rounded-sm border border-border bg-surface-2 px-2 py-0.5 text-[11px] text-muted transition-colors hover:border-border-strong hover:text-text", q === k && "border-amber/40 text-amber")}>
                  {k}
                </button>
              ))}
            </div>
          </SectionCard>

          {lessons.length > 0 && (
            <div className="rounded-md border border-teal/30 bg-teal-soft px-4 py-3">
              <div className="hud-label mb-1 text-teal">Lessons in these results</div>
              <ul className="grid gap-x-6 gap-y-1 md:grid-cols-3">
                {lessons.map((l) => (
                  <li key={l} className="text-[12px] leading-4 text-text">
                    {l}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {res.loading && items.length === 0 ? (
            <SkeletonList rows={8} className="rounded-card border border-border bg-surface p-4" />
          ) : items.length === 0 ? (
            <EmptyState icon={BookOpenText} title="No matching events" description="Try a broader term, another formation, or clear the filters." action={<Button onClick={() => { setQ(""); setType(null); setFormation(null); setSeverity(null); }}>Clear all</Button>} />
          ) : (
            <>
              <div className="space-y-2">
                {items.map((e) => (
                  <EventCard key={e.id} event={e} showWell />
                ))}
              </div>
              {items.length < total && (
                <div className="flex items-center justify-center gap-3">
                  <span className="num text-[12px] text-muted">
                    {fmtNum(items.length)} of {fmtNum(total)}
                  </span>
                  <Button variant="secondary" onClick={() => setOffset(items.length)} disabled={res.loading}>
                    {res.loading ? "Loading…" : "Load more"}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
