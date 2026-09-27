import { severityColor, type Severity } from "@/lib/tokens";
import { cn } from "@/lib/utils";

const SOFT: Record<Severity, string> = {
  Low: "border-sev-low/30 bg-sev-low/10 text-sev-low",
  Medium: "border-sev-medium/30 bg-sev-medium/10 text-sev-medium",
  High: "border-sev-high/30 bg-sev-high/10 text-sev-high",
  Critical: "border-sev-critical/40 bg-sev-critical/15 text-sev-critical",
};
const SOLID: Record<Severity, string> = {
  Low: "bg-sev-low text-[#06130A]",
  Medium: "bg-sev-medium text-[#1A1400]",
  High: "bg-sev-high text-[#1A0A00]",
  Critical: "bg-sev-critical text-white",
};

interface Props {
  severity: Severity | string | null | undefined;
  variant?: "soft" | "solid" | "dot" | "text";
  size?: "sm" | "md";
  className?: string;
  label?: string;
}

export function SeverityBadge({ severity, variant = "soft", size = "sm", className, label }: Props) {
  const sev = (["Low", "Medium", "High", "Critical"].includes(String(severity)) ? severity : "Low") as Severity;
  const color = severityColor[sev];
  if (variant === "dot") {
    return <span className={cn("inline-block shrink-0 rounded-full", size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5", className)} style={{ background: color, boxShadow: `0 0 6px ${color}99` }} title={sev} />;
  }
  if (variant === "text") {
    return (
      <span className={cn("num inline-flex items-center gap-1.5 text-label uppercase tracking-[0.08em]", className)} style={{ color }}>
        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} />
        {label ?? sev}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "num inline-flex items-center rounded-sm border uppercase tracking-[0.08em]",
        size === "sm" ? "h-5 px-1.5 text-[10px]" : "h-6 px-2 text-label",
        variant === "soft" ? SOFT[sev] : cn("border-transparent", SOLID[sev]),
        className,
      )}
    >
      {label ?? sev}
    </span>
  );
}

export function severityTone(severity: string | null | undefined): string {
  return severityColor[(severity as Severity) ?? "Low"] ?? severityColor.Low;
}
