import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Page-level control row: HUD question on the left, page controls on the right. */
export function PageHeader({ question, children, className }: { question?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-8 flex-wrap items-center justify-between gap-3", className)}>
      {question ? <div className="hud-label text-muted">{question}</div> : <div />}
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
