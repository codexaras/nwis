"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

import { SeverityBadge } from "@/components/nwis/SeverityBadge";
import type { ChatResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Structured NWIS answer with a restrained typing reveal: title → summary → sections → evidence. */
export function AnswerBlock({ answer, animate = true, onDone }: { answer: ChatResponse; animate?: boolean; onDone?: () => void }) {
  const total = 2 + answer.sections.length + 1;
  const [revealed, setRevealed] = useState(animate ? 0 : total);
  const [typed, setTyped] = useState(animate ? 0 : answer.summary.length);

  useEffect(() => {
    if (!animate) return;
    let step = 0;
    const timers: number[] = [];
    timers.push(window.setTimeout(() => setRevealed(1), 80));
    // type the summary
    const chars = answer.summary.length;
    const perChar = Math.max(6, Math.min(18, 900 / Math.max(1, chars)));
    for (let i = 1; i <= chars; i++) timers.push(window.setTimeout(() => setTyped(i), 220 + i * perChar));
    const afterSummary = 220 + chars * perChar + 150;
    for (step = 2; step <= total; step++) {
      const s = step;
      timers.push(window.setTimeout(() => setRevealed(s), afterSummary + (s - 2) * 260));
    }
    timers.push(window.setTimeout(() => onDone?.(), afterSummary + (total - 1) * 260 + 50));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [answer, animate, total, onDone]);

  const done = revealed >= total;
  return (
    <div data-testid="answer" className="space-y-3" onClick={() => !done && (setRevealed(total), setTyped(answer.summary.length))}>
      <div className={cn("transition-opacity", revealed >= 1 ? "opacity-100" : "opacity-0")}>
        <div className="num text-[13px] font-semibold uppercase tracking-[0.06em] text-amber">{answer.title}</div>
        <p className="mt-0.5 text-body text-text">
          {answer.summary.slice(0, typed)}
          {typed < answer.summary.length && <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-status-blink bg-amber align-middle" />}
        </p>
      </div>
      {answer.sections.map((s, i) => (
        <div key={i} className={cn("transition-all duration-200", revealed >= i + 2 ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0")}>
          {s.heading && <div className="hud-label mb-1">{s.heading}</div>}
          {s.text && <p className="whitespace-pre-line text-[12px] leading-4 text-text">{s.text}</p>}
          {s.items && s.items.length > 0 && (
            <ul className="space-y-1">
              {s.items.map((it) => (
                <li key={it} className="flex items-start gap-2 text-[12px] leading-4 text-text">
                  <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-teal" />
                  <span>{it}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      {answer.citations.length > 0 && (
        <div className={cn("transition-all duration-200", revealed >= total ? "opacity-100" : "opacity-0")}>
          <div className="hud-label mb-1">Evidence</div>
          <div className="flex flex-wrap gap-1.5">
            {answer.citations.map((c) => (
              <Link key={`${c.well_id}-${c.depth_m}`} href={`/wells/${c.well_id}?event=${c.event_id}`} className="num inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface-2 px-2 py-0.5 text-[11px] text-text transition-colors hover:border-amber/50 hover:text-amber" title={`${c.event_type} · ${c.formation} · ${c.severity}`}>
                <SeverityBadge severity={c.severity} variant="dot" />[{c.label}]
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
