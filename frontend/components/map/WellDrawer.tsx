"use client";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, GitCompareArrows, X } from "lucide-react";
import Link from "next/link";

import { EmptyState, FormationChip, HudLabel, KpiReadout, SeverityBadge, SkeletonKpi, SkeletonList } from "@/components/nwis";
import { EventCard } from "@/components/nwis/EventCard";
import { Button } from "@/components/ui/button";
import { ACTIVE_WELL_ID, getWell } from "@/lib/api";
import { fmtDate, fmtDepth, fmtKm } from "@/lib/format";
import { useAsync } from "@/lib/hooks";

/** Right-side intelligence drawer opened from a map marker: well summary, key events, "Open well". */
export function WellDrawer({ wellId, onClose }: { wellId: string | null; onClose: () => void }) {
  const { data: well, loading } = useAsync(() => (wellId ? getWell(wellId) : Promise.resolve(null)), [wellId]);
  const keyEvents = well ? [...well.events].sort((a, b) => b.severity_rank - a.severity_rank || b.npt_hours - a.npt_hours).slice(0, 5) : [];
  return (
    <AnimatePresence>
      {wellId && (
        <motion.aside
          key={wellId}
          initial={{ x: 24, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 24, opacity: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="absolute inset-y-3 right-3 z-[1000] flex w-[360px] max-w-[calc(100%-24px)] flex-col overflow-hidden rounded-card border border-border-strong bg-surface/95 shadow-card backdrop-blur"
        >
          <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="num text-[18px] font-semibold text-text">{wellId}</span>
                {well?.is_active && <HudLabel dot="amber" pulse>Drilling</HudLabel>}
              </div>
              <div className="hud-label mt-0.5 truncate">
                {well ? `${well.field} · ${well.status} · ${well.well_type}` : "Loading well record"}
                {well && !well.is_active && well.distance_km !== undefined ? ` · ${fmtKm(well.distance_km)} ${well.bearing ?? ""}` : ""}
              </div>
            </div>
            <button onClick={onClose} className="rounded-sm p-1 text-muted hover:bg-surface-3 hover:text-text" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {loading && !well ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <SkeletonKpi />
                  <SkeletonKpi />
                </div>
                <SkeletonList rows={4} className="mt-4" />
              </>
            ) : well ? (
              <>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <KpiReadout size="sm" label="Total depth" value={well.total_depth_m} unit="m" tone="amber" hint={well.deepest_formation ? `TD in ${well.deepest_formation}` : undefined} />
                  <KpiReadout size="sm" label="Incidents" value={well.event_count} hint={`${well.high_critical_count} high / critical`} />
                  <KpiReadout size="sm" label="NPT" value={well.npt_hours} unit="h" decimals={0} />
                  <div>
                    <div className="hud-label">Max severity</div>
                    <div className="mt-1.5">{well.max_severity ? <SeverityBadge severity={well.max_severity} size="md" /> : <span className="text-muted">—</span>}</div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="hud-label mb-1.5">Formation tops</div>
                  <div className="flex flex-wrap gap-1">
                    {well.formations.map((f) => (
                      <span key={f.id} className="inline-flex items-center gap-1">
                        <FormationChip name={f.name} abbrev />
                        <span className="num mr-1 text-[10px] text-muted">{fmtDepth(f.top_m, 0)}</span>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="hud-label mb-1.5">Key events · highest severity</div>
                  {keyEvents.length === 0 ? (
                    <EmptyState compact title="No incidents recorded" />
                  ) : (
                    <div className="space-y-1.5">
                      {keyEvents.map((e) => (
                        <EventCard key={e.id} event={e} compact />
                      ))}
                    </div>
                  )}
                </div>

                <div className="num mt-4 text-[10px] text-dim">
                  SPUD {fmtDate(well.spud_date)} · RIG {well.rig} · {well.operator}
                </div>
              </>
            ) : (
              <EmptyState compact title="Well not found" />
            )}
          </div>

          <footer className="flex gap-2 border-t border-border px-4 py-3">
            <Button asChild variant="default" className="flex-1">
              <Link href={`/wells/${wellId}`}>
                Open well <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
            {wellId !== ACTIVE_WELL_ID && (
              <Button asChild variant="secondary" className="flex-1">
                <Link href={`/correlation?wells=${ACTIVE_WELL_ID},${wellId}`}>
                  <GitCompareArrows className="h-3.5 w-3.5" /> Correlate
                </Link>
              </Button>
            )}
          </footer>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
