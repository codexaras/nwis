"use client";
import { fmtDateIST, fmtTimeIST } from "@/lib/format";
import { useMounted, useNow } from "@/lib/hooks";

/** Live IST clock (JetBrains Mono, tabular). Renders a placeholder until mounted to avoid hydration drift. */
export function Clock() {
  const now = useNow(1000);
  const mounted = useMounted();
  return (
    <div className="hidden flex-col items-end leading-none md:flex" aria-live="off">
      <span className="num text-[13px] text-text">{mounted ? fmtTimeIST(now) : "--:--:--"}</span>
      <span className="num mt-0.5 text-[10px] uppercase tracking-[0.08em] text-muted">{mounted ? `${fmtDateIST(now)} · IST` : "IST"}</span>
    </div>
  );
}
