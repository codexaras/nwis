"use client";
import { MessageSquareText, Send, Sparkles } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { AnswerBlock } from "@/components/assistant/AnswerBlock";
import { DataChip, EmptyState, HudLabel, PageHeader, SectionCard, SeverityBadge } from "@/components/nwis";
import { Button } from "@/components/ui/button";
import { ACTIVE_WELL_ID, chat, getSuggestions } from "@/lib/api";
import { fmtDepth } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { useLive } from "@/lib/live-context";
import type { ChatResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Msg {
  id: number;
  role: "user" | "nwis";
  text?: string;
  answer?: ChatResponse;
  pending?: boolean;
  error?: string;
}

const FALLBACK_PROMPTS = [
  "What problems did offset wells face in the Barail formation?",
  "Recommended mud weight for Kopili in Baghjan area?",
  "Which offset wells had stuck pipe and how was it freed?",
  "Show lessons learned for mud losses in Tipam sands.",
];

export default function AssistantPage() {
  const { radiusKm, snap } = useLive();
  const suggestions = useAsync(() => getSuggestions(), []);
  const prompts = suggestions.data?.prompts ?? FALLBACK_PROMPTS;
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  const last = [...messages].reverse().find((m) => m.role === "nwis" && m.answer)?.answer ?? null;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const ask = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || busy) return;
      setInput("");
      setBusy(true);
      const uid = nextId.current++;
      const aid = nextId.current++;
      setMessages((cur) => [...cur, { id: uid, role: "user", text: q }, { id: aid, role: "nwis", pending: true }]);
      try {
        const answer = await chat(q, ACTIVE_WELL_ID, radiusKm);
        setMessages((cur) => cur.map((m) => (m.id === aid ? { id: aid, role: "nwis", answer } : m)));
      } catch (e) {
        setMessages((cur) => cur.map((m) => (m.id === aid ? { id: aid, role: "nwis", error: e instanceof Error ? e.message : "NWIS could not answer" } : m)));
      } finally {
        setBusy(false);
      }
    },
    [busy, radiusKm],
  );

  return (
    <div className="space-y-4 p-4">
      <PageHeader question="How can an engineer retrieve that knowledge instantly?">
        <div className="flex items-center gap-3">
          <HudLabel value={`${ACTIVE_WELL_ID} · ${radiusKm} KM`} valueClassName="text-amber">
            Scope
          </HudLabel>
          <HudLabel dot={suggestions.data?.llm.enabled ? "teal" : "amber"}>{suggestions.data?.llm.enabled ? `LLM · ${suggestions.data.llm.provider}` : "Offline structured mode"}</HudLabel>
        </div>
      </PageHeader>

      <div className="grid grid-cols-12 gap-4">
        <SectionCard className="col-span-12 xl:col-span-8" variant="hero" flush title="Ask NWIS" subtitle="RETRIEVAL OVER EVENTS · MITIGATIONS · LESSONS — CITATIONS LINK TO THE OFFSET WELL" actions={<DataChip variant="synthetic">Synthetic data</DataChip>} bodyClassName="flex flex-col">
          <div ref={listRef} className="min-h-[420px] max-h-[calc(100vh-380px)] flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-5 py-10">
                <EmptyState icon={MessageSquareText} tone="teal" title="Ask about offset experience" description="Questions are answered from the indexed events, mitigations and lessons of nearby wells, with citations you can open." className="border-0" />
                <div className="flex max-w-2xl flex-wrap justify-center gap-2">
                  {prompts.map((p, i) => (
                    <button key={p} data-testid={i === 0 ? "suggested-prompt" : undefined} onClick={() => ask(p)} className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-left text-[12px] text-text transition-colors hover:border-amber/50 hover:text-amber">
                      <Sparkles className="mr-1.5 inline h-3 w-3 text-amber" />
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[80%] rounded-md rounded-br-sm border border-amber/30 bg-amber-soft px-3 py-2 text-body text-text">{m.text}</div>
                  </div>
                ) : (
                  <div key={m.id} className="flex gap-3">
                    <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2 text-[10px] font-semibold tracking-[0.08em] text-teal">N</span>
                    <div className="max-w-[86%] flex-1 rounded-md rounded-bl-sm border border-border bg-surface px-4 py-3">
                      {m.pending ? (
                        <div className="flex items-center gap-2 text-[12px] text-muted">
                          <span className="inline-flex gap-1">
                            <span className="h-1.5 w-1.5 animate-status-blink rounded-full bg-teal" />
                            <span className="h-1.5 w-1.5 animate-status-blink rounded-full bg-teal [animation-delay:200ms]" />
                            <span className="h-1.5 w-1.5 animate-status-blink rounded-full bg-teal [animation-delay:400ms]" />
                          </span>
                          Retrieving offset events…
                        </div>
                      ) : m.error ? (
                        <p className="text-[12px] text-sev-high">{m.error}</p>
                      ) : m.answer ? (
                        <AnswerBlock answer={m.answer} />
                      ) : null}
                    </div>
                  </div>
                ),
              )
            )}
          </div>
          <div className="border-t border-border p-3">
            {messages.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {prompts.slice(0, 4).map((p) => (
                  <button key={p} onClick={() => ask(p)} disabled={busy} className="truncate rounded-sm border border-border bg-surface-2 px-2 py-0.5 text-[11px] text-muted transition-colors hover:border-border-strong hover:text-text disabled:opacity-50">
                    {p}
                  </button>
                ))}
              </div>
            )}
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void ask(input);
              }}
            >
              <textarea
                id="assistant-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void ask(input);
                  }
                }}
                rows={2}
                placeholder="Ask NWIS — e.g. What torque behaviour preceded stuck pipe in Barail?"
                className="min-h-[44px] flex-1 resize-none rounded-md border border-border bg-surface-2 px-3 py-2 text-body text-text placeholder:text-dim focus:outline-none focus-visible:border-amber focus-visible:ring-1 focus-visible:ring-amber/40"
                aria-label="Question"
              />
              <Button type="submit" variant="default" size="lg" disabled={busy || !input.trim()} aria-label="Send">
                <Send className="h-4 w-4" /> Ask
              </Button>
            </form>
          </div>
        </SectionCard>

        <div className="col-span-12 flex flex-col gap-4 xl:col-span-4">
          <SectionCard title="Evidence" subtitle={last ? `${last.citations.length} CITATIONS · ${last.retrieved} EVENTS RETRIEVED` : "CITATIONS FROM THE LATEST ANSWER"} className="flex-1">
            {last && last.citations.length > 0 ? (
              <ul className="divide-y divide-border">
                {last.citations.map((c) => (
                  <li key={`${c.well_id}-${c.depth_m}`} className="py-2 first:pt-0 last:pb-0">
                    <Link href={`/wells/${c.well_id}?event=${c.event_id}`} className="group flex items-center gap-2">
                      <SeverityBadge severity={c.severity} />
                      <span className="text-[12px] text-text group-hover:text-amber">{c.event_type}</span>
                      <span className="num ml-auto text-[11px] text-muted">
                        {c.well_id} · {fmtDepth(c.depth_m, 0)}
                      </span>
                    </Link>
                    <div className="mt-0.5 text-[11px] text-muted">{c.formation}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState compact icon={MessageSquareText} title="No citations yet" description="Ask a question to see the offset events behind the answer." />
            )}
          </SectionCard>

          <SectionCard title="Context" subtitle="WHAT NWIS KNOWS RIGHT NOW">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <HudLabel className="flex" value={snap ? fmtDepth(snap.depth_m).toUpperCase() : "—"}>Bit depth</HudLabel>
              <HudLabel className="flex" value={snap?.formation.toUpperCase() ?? "—"}>Formation</HudLabel>
              <HudLabel className="flex" value={snap?.next_formation ? `${snap.next_formation.toUpperCase()} · ${fmtDepth(snap.distance_to_next_m ?? 0, 0).toUpperCase()}` : "—"}>Next</HudLabel>
              <HudLabel className="flex" value={`${radiusKm} KM`}>Offset window</HudLabel>
              <HudLabel className="col-span-2 flex" value={last ? last.mode.replace("_", " ").toUpperCase() : "—"}>Answer mode</HudLabel>
            </div>
            <p className={cn("pt-3 text-[11px] leading-4 text-muted")}>Without an API key, answers are assembled from retrieved evidence into a fixed structure. Set LLM_PROVIDER and LLM_API_KEY on the backend to enable generative answers with the same citations.</p>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
