"use client";
import { Drill, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { HudLabel } from "@/components/nwis/HudLabel";
import { Tip } from "@/components/ui/tooltip";
import { fmtIsoTimeIST } from "@/lib/format";
import { useLive } from "@/lib/live-context";
import { NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const { focusWellId, snap, offline, radiusKm } = useLive();

  return (
    <aside className={cn("relative z-20 flex h-full shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200", collapsed ? "w-16" : "w-[232px]")}>
      {/* brand */}
      <Link href="/dashboard" className={cn("flex h-14 items-center gap-3 border-b border-border px-3", collapsed && "justify-center px-0")}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-soft text-amber ring-1 ring-amber/30">
          <Drill className="h-4 w-4" />
        </span>
        {!collapsed && (
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[13px] font-semibold tracking-wide text-text">eRTMAC · NWIS</span>
            <span className="block truncate text-[10px] uppercase tracking-[0.1em] text-muted">Nearby Wells Intelligence</span>
          </span>
        )}
      </Link>

      {/* nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {!collapsed && <div className="hud-label px-2 pb-2">Modules</div>}
        <ul className="space-y-0.5">
          {NAV.map((item) => {
            const href = item.key === "wells" ? `/wells/${focusWellId}` : item.href;
            const active = pathname === item.match || pathname.startsWith(item.match + "/");
            const Icon = item.icon;
            const link = (
              <Link
                href={href}
                className={cn(
                  "group relative flex h-9 items-center gap-3 rounded-md px-2.5 text-body transition-colors",
                  active ? "bg-surface-2 text-text" : "text-muted hover:bg-surface-2/70 hover:text-text",
                  collapsed && "justify-center px-0",
                )}
              >
                {active && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-amber shadow-[0_0_8px_rgba(245,158,11,0.6)]" />}
                <Icon className={cn("h-4 w-4 shrink-0", active ? "text-amber" : "text-muted group-hover:text-text")} />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
            return (
              <li key={item.key}>
                {collapsed ? (
                  <Tip label={item.label} side="right">
                    {link}
                  </Tip>
                ) : (
                  link
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* system status */}
      <div className={cn("border-t border-border", collapsed ? "px-0 py-3" : "px-3 py-3")}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-3">
            <Tip label={offline ? "Offline demo data" : "NWIS-RT connected"} side="right">
              <span className={cn("h-2 w-2 rounded-full", offline ? "bg-sev-medium animate-status-blink" : "bg-teal animate-status-blink")} />
            </Tip>
          </div>
        ) : (
          <div className="space-y-1.5">
            <HudLabel dot={offline ? "amber" : "teal"} pulse>
              {offline ? "NWIS-RT · OFFLINE DEMO" : "SYSTEM NWIS-RT · CONNECTED"}
            </HudLabel>
            <HudLabel dot={offline ? "muted" : "teal"}>{offline ? "RISK ENGINE · SNAPSHOT" : "MODEL RISK ENGINE · READY"}</HudLabel>
            <HudLabel value={`${radiusKm} KM`}>OFFSET WINDOW</HudLabel>
            <HudLabel value={snap ? `${fmtIsoTimeIST(snap.timestamp)} IST` : "——:——:——"}>LAST UPDATE</HudLabel>
          </div>
        )}
        <button
          onClick={onToggle}
          className={cn("mt-3 flex h-7 w-full items-center justify-center gap-2 rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-text", !collapsed && "justify-start px-2")}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          {!collapsed && <span className="text-[12px]">Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
