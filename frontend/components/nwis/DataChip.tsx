import { cn } from "@/lib/utils";

import { StatusDot, type DotTone } from "./HudLabel";

type Variant = "synthetic" | "simulated" | "offline" | "demo" | "live" | "neutral" | "amber";

const STYLE: Record<Variant, { cls: string; dot?: DotTone; pulse?: boolean }> = {
  synthetic: { cls: "border-border bg-surface-2 text-muted" },
  simulated: { cls: "border-teal/30 bg-teal-soft text-teal", dot: "teal", pulse: true },
  live: { cls: "border-teal/30 bg-teal-soft text-teal", dot: "teal", pulse: true },
  offline: { cls: "border-sev-medium/40 bg-sev-medium/10 text-sev-medium", dot: "amber", pulse: true },
  demo: { cls: "border-amber/40 bg-amber-soft text-amber" },
  amber: { cls: "border-amber/40 bg-amber-soft text-amber" },
  neutral: { cls: "border-border bg-surface-2 text-text" },
};

export function DataChip({ variant = "neutral", children, className, title }: { variant?: Variant; children: React.ReactNode; className?: string; title?: string }) {
  const s = STYLE[variant];
  return (
    <span title={title} className={cn("inline-flex h-6 select-none items-center gap-1.5 whitespace-nowrap rounded-sm border px-2 text-label uppercase tracking-[0.08em]", s.cls, className)}>
      {s.dot && <StatusDot tone={s.dot} pulse={s.pulse} />}
      {children}
    </span>
  );
}
