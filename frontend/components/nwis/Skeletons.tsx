import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={cn("animate-pulse rounded-sm bg-surface-3/80", className)} style={style} aria-hidden />;
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn("h-3", i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

export function SkeletonKpi({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      <Skeleton className="h-2.5 w-24" />
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-2.5 w-16" />
    </div>
  );
}

export function SkeletonCard({ className, rows = 4 }: { className?: string; rows?: number }) {
  return (
    <div className={cn("rounded-card border border-border bg-surface p-4", className)}>
      <Skeleton className="mb-4 h-3.5 w-40" />
      <SkeletonText lines={rows} />
    </div>
  );
}

/** Vertical depth-track placeholder: a depth ruler plus stacked formation bands of varying thickness. */
export function SkeletonTrack({ className, height = 420, tracks = 3 }: { className?: string; height?: number; tracks?: number }) {
  const bands = [8, 14, 18, 22, 16, 12, 10];
  return (
    <div className={cn("flex gap-3", className)} style={{ height }} aria-hidden>
      <div className="flex w-10 flex-col justify-between py-1">
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="h-2 w-8" />
        ))}
      </div>
      {Array.from({ length: tracks }).map((_, t) => (
        <div key={t} className="flex flex-1 flex-col gap-1">
          {bands.map((h, i) => (
            <Skeleton key={i} className="w-full" style={{ flex: h, opacity: 0.5 + ((i + t) % 3) * 0.15 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonList({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-5 w-14" />
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}
