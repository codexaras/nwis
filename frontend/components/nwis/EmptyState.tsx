import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface Props {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** compact = single row (for small panels) */
  compact?: boolean;
  tone?: "muted" | "teal" | "amber";
  className?: string;
}

const TONE = { muted: "text-muted border-border", teal: "text-teal border-teal/30", amber: "text-amber border-amber/30" };

export function EmptyState({ icon: Icon, title, description, action, compact, tone = "muted", className }: Props) {
  if (compact) {
    return (
      <div className={cn("flex items-center gap-3 rounded-md border border-dashed px-3 py-2.5", TONE[tone], className)}>
        {Icon && <Icon className="h-4 w-4 shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-body text-text">{title}</div>
          {description && <div className="truncate text-[12px] text-muted">{description}</div>}
        </div>
        {action}
      </div>
    );
  }
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 rounded-md border border-dashed px-6 py-10 text-center", TONE[tone], className)}>
      {Icon && (
        <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full border border-border-strong bg-surface-2">
          <Icon className="h-5 w-5" />
        </div>
      )}
      <div className="text-title font-medium text-text">{title}</div>
      {description && <div className="max-w-md text-body text-muted">{description}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
