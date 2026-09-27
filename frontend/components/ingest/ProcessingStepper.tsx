"use client";
import { Check, ClipboardCheck, FileText, Minus, ScanLine, Sparkles, TriangleAlert, Upload } from "lucide-react";

import type { IngestStep } from "@/lib/types";
import { cn } from "@/lib/utils";

export type StepUi = { key: string; label: string; state: "pending" | "active" | "done" | "skipped" | "unavailable" | "failed"; detail?: string; ms?: number };

const ICONS: Record<string, typeof Upload> = { upload: Upload, text: FileText, ocr: ScanLine, structure: Sparkles, review: ClipboardCheck };
export const STEP_ORDER: { key: string; label: string }[] = [
  { key: "upload", label: "Uploading" },
  { key: "text", label: "Extracting text" },
  { key: "ocr", label: "OCR" },
  { key: "structure", label: "AI structuring" },
  { key: "review", label: "Review" },
];

export function stepsFromResult(steps: IngestStep[]): StepUi[] {
  return STEP_ORDER.map((s) => {
    const r = steps.find((x) => x.key === s.key);
    const state: StepUi["state"] = !r ? "pending" : r.status === "done" || r.status === "ready" ? "done" : r.status === "skipped" ? "skipped" : r.status === "unavailable" ? "unavailable" : r.status === "failed" ? "failed" : r.status === "empty" ? "done" : "done";
    return { key: s.key, label: s.label, state, detail: r?.detail, ms: r?.ms };
  });
}

/** Animated Uploading → Extracting text → OCR → AI structuring → Review stepper. */
export function ProcessingStepper({ steps, className }: { steps: StepUi[]; className?: string }) {
  return (
    <ol className={cn("grid grid-cols-5 gap-2", className)}>
      {steps.map((s, i) => {
        const Icon = ICONS[s.key] ?? FileText;
        const tone =
          s.state === "done" ? "border-teal/50 text-teal" : s.state === "active" ? "border-amber text-amber" : s.state === "unavailable" ? "border-sev-medium/60 text-sev-medium" : s.state === "failed" ? "border-sev-critical/60 text-sev-critical" : s.state === "skipped" ? "border-border text-dim" : "border-border text-dim";
        return (
          <li key={s.key} className="relative">
            {i < steps.length - 1 && <span className={cn("absolute left-[calc(50%+16px)] right-[calc(-50%+16px)] top-4 h-px", steps[i + 1].state !== "pending" ? "bg-teal/50" : "bg-border")} />}
            <div className="flex flex-col items-center text-center">
              <span className={cn("flex h-8 w-8 items-center justify-center rounded-full border bg-surface transition-colors", tone, s.state === "active" && "shadow-[0_0_0_4px_rgba(245,158,11,0.15)]")}>
                {s.state === "done" ? <Check className="h-3.5 w-3.5" /> : s.state === "skipped" ? <Minus className="h-3.5 w-3.5" /> : s.state === "unavailable" || s.state === "failed" ? <TriangleAlert className="h-3.5 w-3.5" /> : <Icon className={cn("h-3.5 w-3.5", s.state === "active" && "animate-status-blink")} />}
              </span>
              <span className={cn("mt-1.5 text-[11px] font-medium", s.state === "pending" ? "text-dim" : "text-text")}>{s.label}</span>
              <span className="mt-0.5 line-clamp-2 min-h-[28px] text-[10px] leading-[14px] text-muted">
                {s.state === "active" ? "Working…" : s.detail ?? (s.state === "pending" ? "Waiting" : "")}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
