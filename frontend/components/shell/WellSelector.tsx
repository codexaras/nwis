"use client";
import { useMemo } from "react";

import { StatusDot } from "@/components/nwis/HudLabel";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getWells } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { useLive } from "@/lib/live-context";

/** Active-well selector: chooses the well the profile / risk views centre on. The drilling well is marked. */
export function WellSelector() {
  const { focusWellId, setFocusWellId } = useLive();
  const { data } = useAsync(() => getWells(), []);
  const groups = useMemo(() => {
    const g = new Map<string, { id: string; is_active: boolean; status: string }[]>();
    for (const w of data?.wells ?? []) g.set(w.field, [...(g.get(w.field) ?? []), { id: w.id, is_active: w.is_active, status: w.status }]);
    return Array.from(g.entries());
  }, [data]);
  const current = data?.wells.find((w) => w.id === focusWellId);

  return (
    <Select value={focusWellId} onValueChange={setFocusWellId}>
      <SelectTrigger className="h-8 w-[180px] gap-2" aria-label="Active well">
        <span className="hud-label shrink-0">Well</span>
        <SelectValue>
          <span className="num inline-flex items-center gap-1.5 text-[13px] text-text">
            {current?.is_active && <StatusDot tone="amber" pulse />}
            {focusWellId}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="w-64">
        {groups.map(([field, wells]) => (
          <SelectGroup key={field}>
            <SelectLabel>{field}</SelectLabel>
            {wells.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                <span className="num inline-flex items-center gap-2">
                  {w.is_active ? <StatusDot tone="amber" pulse /> : <span className="inline-block h-1.5 w-1.5 rounded-full bg-dim" />}
                  {w.id}
                  <span className="text-[11px] uppercase tracking-[0.06em] text-muted">{w.is_active ? "drilling" : w.status}</span>
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
        {!data && (
          <div className="px-2 py-3 text-[12px] text-muted">Loading wells…</div>
        )}
      </SelectContent>
    </Select>
  );
}
