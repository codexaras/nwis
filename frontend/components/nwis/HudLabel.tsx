import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

export type DotTone = "teal" | "amber" | "red" | "muted" | "green";

const DOT: Record<DotTone, string> = {
  teal: "bg-teal shadow-[0_0_6px_rgba(20,184,166,0.8)]",
  amber: "bg-amber shadow-[0_0_6px_rgba(245,158,11,0.8)]",
  red: "bg-sev-critical shadow-[0_0_6px_rgba(239,68,68,0.8)]",
  green: "bg-sev-low shadow-[0_0_6px_rgba(34,197,94,0.8)]",
  muted: "bg-dim",
};

export function StatusDot({ tone = "teal", pulse = false, className }: { tone?: DotTone; pulse?: boolean; className?: string }) {
  return <span className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", DOT[tone], pulse && "animate-status-blink", className)} aria-hidden />;
}

interface HudLabelProps extends HTMLAttributes<HTMLSpanElement> {
  /** small uppercase label */
  children: ReactNode;
  /** optional monospace value rendered after the label */
  value?: ReactNode;
  dot?: DotTone;
  pulse?: boolean;
  valueClassName?: string;
}

/** 11px uppercase tracked HUD label, e.g. `BIT DEPTH 2,784.4 M MD` or `SYSTEM NWIS-RT · CONNECTED`. */
export function HudLabel({ children, value, dot, pulse, className, valueClassName, ...props }: HudLabelProps) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", className)} {...props}>
      {dot && <StatusDot tone={dot} pulse={pulse} />}
      <span className="hud-label">{children}</span>
      {value !== undefined && <span className={cn("num text-[12px] leading-none text-text", valueClassName)}>{value}</span>}
    </span>
  );
}

/** Horizontal strip of HUD readouts separated by thin dividers. */
export function HudStrip({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5 [&>*+*]:relative [&>*+*]:pl-4 [&>*+*]:before:absolute [&>*+*]:before:left-0 [&>*+*]:before:top-1/2 [&>*+*]:before:h-3 [&>*+*]:before:w-px [&>*+*]:before:-translate-y-1/2 [&>*+*]:before:bg-border", className)}>{children}</div>;
}
