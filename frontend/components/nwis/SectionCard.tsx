import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  /** small uppercase HUD line under the title */
  subtitle?: ReactNode;
  /** right-aligned header slot (chips, buttons) */
  actions?: ReactNode;
  footer?: ReactNode;
  /** hero = plotting grid + radial illumination; flat = no border/shadow */
  variant?: "default" | "hero" | "flat" | "inset";
  /** remove body padding (for tracks / maps / tables) */
  flush?: boolean;
  bodyClassName?: string;
  headerClassName?: string;
  children?: ReactNode;
}

/** The standard NWIS panel: thin header with title + HUD subtitle, disciplined 8px-grid body. */
export function SectionCard({ title, subtitle, actions, footer, variant = "default", flush, className, bodyClassName, headerClassName, children, ...props }: Props) {
  return (
    <section
      className={cn(
        "relative flex min-w-0 flex-col overflow-hidden rounded-card",
        variant === "flat" ? "bg-transparent" : variant === "inset" ? "border border-border bg-bg/60" : "border border-border bg-surface shadow-card",
        variant === "hero" && "hero-illumination",
        className,
      )}
      {...props}
    >
      {variant === "hero" && <div className="plot-grid pointer-events-none absolute inset-0 opacity-70" aria-hidden />}
      {(title || actions) && (
        <header className={cn("relative z-[1] flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-2.5", headerClassName)}>
          <div className="min-w-0">
            {title && <h2 className="truncate text-title font-semibold leading-5 text-text">{title}</h2>}
            {subtitle && <div className="hud-label mt-0.5 truncate">{subtitle}</div>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn("relative z-[1] min-h-0 flex-1", !flush && "p-4", bodyClassName)}>{children}</div>
      {footer && <footer className="relative z-[1] shrink-0 border-t border-border px-4 py-2 text-[12px] text-muted">{footer}</footer>}
    </section>
  );
}
