"use client";
import { Bell, ShieldAlert } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/nwis/EmptyState";
import { SeverityBadge, severityTone } from "@/components/nwis/SeverityBadge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fmtDepth } from "@/lib/format";
import { useLive } from "@/lib/live-context";
import { cn } from "@/lib/utils";

export function AlertBell() {
  const { alerts, radiusKm } = useLive();
  const top = alerts[0];
  const tone = top ? severityTone(top.severity) : undefined;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`${alerts.length} active alerts`}>
          <Bell className={cn("h-4 w-4", alerts.length && "text-text")} />
          {alerts.length > 0 && (
            <span className="num absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-[#0B0F14]" style={{ background: tone, boxShadow: `0 0 8px ${tone}` }}>
              {alerts.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px]">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div>
            <div className="text-title font-semibold">Active alerts</div>
            <div className="hud-label">OFFSET WINDOW {radiusKm} KM · 150 M LOOK-AHEAD</div>
          </div>
          <Button asChild variant="chip">
            <Link href="/risk">Risk view</Link>
          </Button>
        </div>
        <div className="max-h-[420px] overflow-y-auto p-2">
          {alerts.length === 0 ? (
            <EmptyState compact icon={ShieldAlert} tone="teal" title="No active alerts" description={`Monitoring offset wells within ${radiusKm} km ahead of the bit.`} />
          ) : (
            <ul className="space-y-1">
              {alerts.map((a) => (
                <li key={a.id} className="rounded-md border border-border bg-surface px-3 py-2">
                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={a.severity} />
                    <span className="hud-label text-text">{a.title}</span>
                    {a.is_demo && <span className="hud-label text-amber">DEMO</span>}
                    <span className="num ml-auto text-[11px] text-muted">{fmtDepth(a.distance_ahead_m, 0)} ahead</span>
                  </div>
                  <p className="mt-1 text-[12px] leading-4 text-muted">{a.message}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
