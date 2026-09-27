import { formationColor, formations, type FormationName } from "@/lib/tokens";
import { cn } from "@/lib/utils";

export function formationMeta(name: string) {
  return formations.find((f) => f.name === name);
}

export function FormationChip({ name, abbrev, className, size = "sm" }: { name: string; abbrev?: boolean; className?: string; size?: "sm" | "md" }) {
  const color = formationColor[name as FormationName] ?? "#8B98A9";
  const meta = formationMeta(name);
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface-2 uppercase tracking-[0.08em] text-text", size === "sm" ? "h-5 px-1.5 text-[10px]" : "h-6 px-2 text-label", className)} title={meta?.lithology}>
      <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: color }} />
      {abbrev ? (meta?.abbrev ?? name.slice(0, 3).toUpperCase()) : name}
    </span>
  );
}
