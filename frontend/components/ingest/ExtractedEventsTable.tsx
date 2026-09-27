"use client";
import { Plus, Trash2 } from "lucide-react";

import { SeverityBadge } from "@/components/nwis/SeverityBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { eventTypes, formations as FORMATIONS } from "@/lib/tokens";
import type { ExtractedEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  rows: ExtractedEvent[];
  wellOptions: { id: string; label: string }[];
  onChange: (rows: ExtractedEvent[]) => void;
  disabled?: boolean;
}

const SEVERITIES = ["Low", "Medium", "High", "Critical"] as const;

function confidenceTone(c: number) {
  return c >= 0.85 ? "#22C55E" : c >= 0.65 ? "#EAB308" : "#F97316";
}

/** Editable review table for extracted events (engineer edits before Confirm & Save). */
export function ExtractedEventsTable({ rows, wellOptions, onChange, disabled }: Props) {
  const update = (i: number, patch: Partial<ExtractedEvent>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => onChange(rows.filter((_, j) => j !== i));
  const add = () =>
    onChange([
      ...rows,
      { well_id: rows[0]?.well_id ?? wellOptions[0]?.id ?? null, event_type: "Mud Loss", depth_m: 0, formation: null, severity: "Medium", npt_hours: 0, mud_weight_ppg: 0, description: "", mitigation: "", lesson_learned: "", confidence: 0.5, method: "manual" },
    ]);

  return (
    <div data-testid="review-table" className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className={cn("rounded-md border border-border bg-bg/50 p-3", disabled && "opacity-60")}>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-[1.15fr_1.1fr_0.7fr_1fr_0.95fr_1.1fr]">
            <label className="flex flex-col gap-1">
              <span className="hud-label">Well</span>
              <Select value={r.well_id ?? ""} onValueChange={(v) => update(i, { well_id: v })} disabled={disabled}>
                <SelectTrigger className="h-7 text-[12px]" aria-label="Well">
                  <SelectValue placeholder="Select well" />
                </SelectTrigger>
                <SelectContent>
                  {wellOptions.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      <span className="num">{w.id}</span> <span className="text-[11px] text-muted">{w.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="hud-label">Event type</span>
              <Select value={r.event_type} onValueChange={(v) => update(i, { event_type: v })} disabled={disabled}>
                <SelectTrigger className="h-7 text-[12px]" aria-label="Event type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {eventTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="hud-label">Depth · m MD</span>
              <Input id={`ev-depth-${i}`} type="number" step="1" value={r.depth_m} onChange={(e) => update(i, { depth_m: Number(e.target.value) })} className="num h-7 text-[12px]" disabled={disabled} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="hud-label">Formation</span>
              <Select value={r.formation ?? "auto"} onValueChange={(v) => update(i, { formation: v === "auto" ? null : v })} disabled={disabled}>
                <SelectTrigger className="h-7 text-[12px]" aria-label="Formation">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (from depth)</SelectItem>
                  {FORMATIONS.map((f) => (
                    <SelectItem key={f.name} value={f.name}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="hud-label">Severity</span>
              <Select value={r.severity} onValueChange={(v) => update(i, { severity: v as ExtractedEvent["severity"] })} disabled={disabled}>
                <SelectTrigger className="h-7 text-[12px]" aria-label="Severity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((s) => (
                    <SelectItem key={s} value={s}>
                      <span className="inline-flex items-center gap-2">
                        <SeverityBadge severity={s} variant="dot" /> {s}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="hud-label">NPT h</span>
                <Input id={`ev-npt-${i}`} type="number" step="0.5" value={r.npt_hours} onChange={(e) => update(i, { npt_hours: Number(e.target.value) })} className="num h-7 text-[12px]" disabled={disabled} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="hud-label">MW ppg</span>
                <Input id={`ev-mw-${i}`} type="number" step="0.1" value={r.mud_weight_ppg} onChange={(e) => update(i, { mud_weight_ppg: Number(e.target.value) })} className="num h-7 text-[12px]" disabled={disabled} />
              </label>
            </div>
          </div>
          <label className="mt-2 flex flex-col gap-1">
            <span className="hud-label">Description</span>
            <textarea id={`ev-desc-${i}`} value={r.description} onChange={(e) => update(i, { description: e.target.value })} rows={2} disabled={disabled} className="w-full resize-y rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] leading-4 text-text focus:outline-none focus-visible:border-amber focus-visible:ring-1 focus-visible:ring-amber/40" />
          </label>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="hud-label">Mitigation</span>
              <Input id={`ev-mit-${i}`} value={r.mitigation} onChange={(e) => update(i, { mitigation: e.target.value })} className="h-7 text-[12px]" disabled={disabled} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="hud-label">Lesson learned</span>
              <Input id={`ev-les-${i}`} value={r.lesson_learned} onChange={(e) => update(i, { lesson_learned: e.target.value })} className="h-7 text-[12px]" disabled={disabled} />
            </label>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="hud-label">Confidence</span>
              <span className="relative h-1.5 w-28 overflow-hidden rounded-full bg-surface-3">
                <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.round(r.confidence * 100)}%`, background: confidenceTone(r.confidence) }} />
              </span>
              <span className="num text-[11px] text-text">{Math.round(r.confidence * 100)}%</span>
              <span className="num text-[10px] uppercase tracking-[0.08em] text-dim">{r.method}</span>
            </div>
            <button onClick={() => remove(i)} disabled={disabled} className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] text-muted hover:bg-surface-2 hover:text-sev-critical disabled:opacity-50">
              <Trash2 className="h-3 w-3" /> Remove
            </button>
          </div>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={add} disabled={disabled}>
        <Plus className="h-3.5 w-3.5" /> Add event
      </Button>
    </div>
  );
}
