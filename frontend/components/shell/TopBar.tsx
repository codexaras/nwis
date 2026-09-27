"use client";
import { SlidersHorizontal } from "lucide-react";
import { usePathname } from "next/navigation";

import { DataChip } from "@/components/nwis/DataChip";
import { FormationChip } from "@/components/nwis/FormationChip";
import { HudLabel } from "@/components/nwis/HudLabel";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tip } from "@/components/ui/tooltip";
import { fmtDepth } from "@/lib/format";
import { useLive } from "@/lib/live-context";
import { navForPath } from "@/lib/nav";
import { cn } from "@/lib/utils";

import { AlertBell } from "./AlertBell";
import { Clock } from "./Clock";
import { WellSelector } from "./WellSelector";

export function TopBar() {
  const pathname = usePathname();
  const nav = navForPath(pathname);
  const { snap, offline, fieldMode, setFieldMode, setDemoOpen } = useLive();

  return (
    <header className="relative z-10 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface/80 px-4 backdrop-blur">
      {/* page identity */}
      <div className="min-w-0 shrink">
        <h1 className="truncate text-title font-semibold leading-5 text-text">{nav.title}</h1>
        <div className="truncate text-[12px] leading-4 text-muted">{nav.question}</div>
      </div>

      {/* compact live readout — only where there is room (≥ 1536 px); the dashboard carries the full strip */}
      <div className="hidden min-w-0 flex-1 items-center justify-center overflow-hidden 2xl:flex">
        <div className={cn("flex items-center gap-3 whitespace-nowrap rounded-md border border-border bg-bg/60 px-3 py-1.5", snap?.status === "TD REACHED" && "border-amber/30")}>
          <HudLabel dot={offline ? "amber" : "teal"} pulse>
            {offline ? "OFFLINE SIM" : "LIVE · SIMULATED"}
          </HudLabel>
          <span className="h-3 w-px bg-border" />
          <HudLabel value={snap ? `${fmtDepth(snap.depth_m).toUpperCase()} MD` : "—"} valueClassName="text-amber">
            BIT DEPTH
          </HudLabel>
          <span className="h-3 w-px bg-border" />
          {snap ? <FormationChip name={snap.formation} /> : <span className="num text-[12px] text-text">—</span>}
          {snap?.next_formation && (
            <>
              <span className="h-3 w-px bg-border" />
              <HudLabel value={`${snap.next_formation.toUpperCase()} · ${fmtDepth(snap.distance_to_next_m ?? 0, 0).toUpperCase()}`}>NEXT</HudLabel>
            </>
          )}
        </div>
      </div>

      {/* right cluster */}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <WellSelector />
        <Clock />
        <AlertBell />
        <span className="mx-1 hidden h-5 w-px bg-border lg:block" />
        <div className="hidden items-center gap-2 lg:flex">
          <Tip label="All data is synthetic demonstration data; the live feed is simulated." side="bottom">
            <span>
              <DataChip variant="synthetic">Synthetic data</DataChip>
            </span>
          </Tip>
          {offline && (
            <Tip label="Backend unreachable — serving bundled demo snapshots and a client-side simulation." side="bottom">
              <span>
                <DataChip variant="offline">Offline demo data</DataChip>
              </span>
            </Tip>
          )}
        </div>
        <label className="ml-1 flex cursor-pointer select-none items-center gap-2">
          <span className={cn("hud-label", fieldMode && "text-amber")}>Field mode</span>
          <Switch checked={fieldMode} onCheckedChange={setFieldMode} aria-label="Toggle field mode" />
        </label>
        <Button variant="chip" onClick={() => setDemoOpen(true)} className="border-amber/40 bg-amber-soft text-amber hover:text-amber" title="Demo controls (Ctrl+Shift+D)">
          <SlidersHorizontal className="h-3 w-3" />
          Demo
        </Button>
      </div>
    </header>
  );
}
