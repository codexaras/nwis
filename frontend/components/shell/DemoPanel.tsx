"use client";
import { FastForward, Play, RotateCcw, Zap } from "lucide-react";
import { useState } from "react";

import { HudLabel } from "@/components/nwis/HudLabel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/primitives";
import { Slider } from "@/components/ui/slider";
import { fmtDepth } from "@/lib/format";
import { useLive } from "@/lib/live-context";
import { cn } from "@/lib/utils";

/** Hidden demo controls (Ctrl+Shift+D or the DEMO chip): speed, jump presets, reset, trigger alert, radius. */
export function DemoPanel() {
  const { demoOpen, setDemoOpen, snap, control, radiusKm, setRadiusKm } = useLive();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, body: Parameters<typeof control>[0]) => {
    setBusy(key);
    await control(body);
    setBusy(null);
  };
  const speeds = snap?.controls.speeds ?? [1, 5, 20];
  const presets = snap?.controls.presets ?? [];

  return (
    <Dialog open={demoOpen} onOpenChange={setDemoOpen}>
      <DialogContent side="right" className="flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-title font-semibold">Demo controls</DialogTitle>
          <DialogDescription asChild>
            <div className="hud-label mt-0.5">SIMULATION · SYNTHETIC DEMONSTRATION DATA</div>
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <section>
            <div className="mb-2 flex items-center justify-between">
              <HudLabel>Simulation speed</HudLabel>
              <span className="num text-[12px] text-muted">{snap ? `${snap.speed}x` : "—"}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {speeds.map((s) => (
                <Button key={s} variant={snap?.speed === s ? "default" : "secondary"} onClick={() => run(`speed${s}`, { speed: s })} disabled={busy !== null}>
                  {s === 1 ? <Play className="h-3.5 w-3.5" /> : <FastForward className="h-3.5 w-3.5" />}
                  <span className="num">{s}x</span>
                </Button>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <HudLabel>Jump to depth</HudLabel>
              <span className="num text-[12px] text-muted">{snap ? fmtDepth(snap.depth_m) : "—"}</span>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {presets.map((p) => (
                <Button key={p.label} variant="secondary" className="justify-between" onClick={() => run(p.label, { jump_to_depth: p.depth_m })} disabled={busy !== null}>
                  <span>{p.label}</span>
                  <span className="num text-muted">{fmtDepth(p.depth_m)}</span>
                </Button>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <HudLabel>Offset window</HudLabel>
              <span className="num text-[12px] text-amber">{radiusKm} km</span>
            </div>
            <Slider min={1} max={25} step={1} value={[radiusKm]} onValueChange={([v]) => setRadiusKm(v)} />
            <div className="num mt-1 flex justify-between text-[10px] text-dim">
              <span>1 km</span>
              <span>25 km</span>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => run("alert", { trigger_alert: true })} disabled={busy !== null}>
              <Zap className="h-3.5 w-3.5 text-amber" />
              Trigger sample alert
            </Button>
            <Button variant="outline" onClick={() => run("reset", { reset: true })} disabled={busy !== null}>
              <RotateCcw className="h-3.5 w-3.5" />
              Reset simulation
            </Button>
          </section>

          {snap && (
            <section className="rounded-md border border-border bg-bg/60 p-3">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <HudLabel value={snap.status}>Status</HudLabel>
                <HudLabel value={`${snap.progress_pct}%`}>Progress</HudLabel>
                <HudLabel value={snap.formation.toUpperCase()}>Formation</HudLabel>
                <HudLabel value={String(snap.active_alert_count)}>Alerts</HudLabel>
                <HudLabel value={fmtDepth(snap.planned_td_m, 0)}>Planned TD</HudLabel>
                <HudLabel value={String(snap.offset_wells_in_radius)}>Offsets</HudLabel>
              </div>
            </section>
          )}
        </div>
        <div className={cn("border-t border-border px-5 py-3 text-[12px] text-muted")}>
          Toggle with <Kbd>Ctrl</Kbd> + <Kbd>Shift</Kbd> + <Kbd>D</Kbd>
        </div>
      </DialogContent>
    </Dialog>
  );
}
