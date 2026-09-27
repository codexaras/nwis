"use client";
import { ChevronDown, FileText } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { fmtDepth, fmtNum } from "@/lib/format";
import type { DrillingEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

import { FormationChip } from "./FormationChip";
import { SeverityBadge, severityTone } from "./SeverityBadge";

interface Props {
  event: DrillingEvent;
  /** show the well id (lists that mix wells) */
  showWell?: boolean;
  active?: boolean;
  compact?: boolean;
  onHover?: (id: number | null) => void;
  onSelect?: (id: number) => void;
  className?: string;
}

/** Knowledge-repository event card: severity stripe, type, depth · formation, description, mitigation, lesson, source. */
export function EventCard({ event: e, showWell, active, compact, onHover, onSelect, className }: Props) {
  const [open, setOpen] = useState(false);
  const tone = severityTone(e.severity);
  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-md border bg-surface pl-4 pr-3 py-2.5 transition-colors",
        active ? "border-border-strong bg-surface-2" : "border-border hover:border-border-strong",
        onSelect && "cursor-pointer",
        className,
      )}
      onMouseEnter={() => onHover?.(e.id)}
      onMouseLeave={() => onHover?.(null)}
      onClick={() => onSelect?.(e.id)}
    >
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: tone, boxShadow: active ? `0 0 10px ${tone}` : undefined }} />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <SeverityBadge severity={e.severity} />
        <span className="text-body font-medium text-text">{e.event_type}</span>
        {showWell && (
          <Link href={`/wells/${e.well_id}?event=${e.id}`} className="num text-[12px] text-amber hover:underline" onClick={(ev) => ev.stopPropagation()}>
            {e.well_id}
          </Link>
        )}
        <span className="num text-[12px] text-muted">{fmtDepth(e.depth_m, 0)}</span>
        <FormationChip name={e.formation} abbrev />
        <span className="num ml-auto text-[11px] text-muted">
          NPT {fmtNum(e.npt_hours, 1)} h{e.mud_weight_ppg ? ` · ${e.mud_weight_ppg.toFixed(1)} ppg` : ""}
        </span>
      </div>
      <p className={cn("mt-1.5 text-[12px] leading-4 text-text", !open && !compact && "line-clamp-2", compact && "line-clamp-1")}>{e.description}</p>
      {!compact && (
        <>
          {open && (
            <div className="mt-2 space-y-1.5 border-t border-border pt-2">
              {e.mitigation && (
                <p className="text-[12px] leading-4 text-muted">
                  <span className="hud-label mr-1.5 text-teal">Mitigation</span>
                  {e.mitigation}
                </p>
              )}
              {e.lesson_learned && (
                <p className="text-[12px] leading-4 text-muted">
                  <span className="hud-label mr-1.5 text-amber">Lesson</span>
                  {e.lesson_learned}
                </p>
              )}
            </div>
          )}
          <div className="mt-1.5 flex items-center justify-between">
            <span className="num inline-flex items-center gap-1 text-[10px] text-dim">
              <FileText className="h-3 w-3" />
              {e.source_doc}
              {e.origin === "upload" && <span className="ml-1 rounded-sm bg-teal-soft px-1 text-teal">INGESTED</span>}
            </span>
            <button
              className="inline-flex items-center gap-0.5 text-[11px] text-muted hover:text-text"
              onClick={(ev) => {
                ev.stopPropagation();
                setOpen((o) => !o);
              }}
            >
              {open ? "Less" : "Mitigation & lesson"}
              <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
            </button>
          </div>
        </>
      )}
    </article>
  );
}
