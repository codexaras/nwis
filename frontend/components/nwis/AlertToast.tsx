"use client";
import { X } from "lucide-react";
import Link from "next/link";

import { fmtDepth } from "@/lib/format";
import type { LiveAlert } from "@/lib/types";

import { SeverityBadge, severityTone } from "./SeverityBadge";

export function AlertToast({ alert, onDismiss }: { alert: LiveAlert; onDismiss: () => void }) {
  const tone = severityTone(alert.severity);
  return (
    <div className="relative w-[380px] overflow-hidden rounded-md border border-border-strong bg-surface-2 shadow-card animate-fade-up">
      <div className="absolute inset-y-0 left-0 w-1" style={{ background: tone, boxShadow: `0 0 12px ${tone}` }} />
      <div className="pl-4 pr-3 pt-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <SeverityBadge severity={alert.severity} />
            <span className="hud-label text-text">{alert.title}</span>
            {alert.is_demo && <span className="hud-label text-amber">DEMO</span>}
          </div>
          <button onClick={onDismiss} className="rounded-sm p-0.5 text-muted hover:text-text" aria-label="Dismiss">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="mt-1.5 text-[12px] leading-4 text-text">{alert.message}</p>
        <p className="mt-1 text-[12px] leading-4 text-muted">{alert.recommendation}</p>
        <div className="mb-2.5 mt-2 flex items-center justify-between">
          <span className="num text-[11px] text-muted">
            {alert.citation} · {fmtDepth(alert.distance_ahead_m, 0)} ahead
          </span>
          <Link href="/risk" onClick={onDismiss} className="text-[11px] font-medium uppercase tracking-[0.08em] text-amber hover:underline">
            View evidence
          </Link>
        </div>
      </div>
    </div>
  );
}
