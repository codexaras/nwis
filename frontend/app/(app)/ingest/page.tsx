"use client";
import { ArrowUpRight, FileScan, FileText, ScanLine, UploadCloud } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ExtractedEventsTable } from "@/components/ingest/ExtractedEventsTable";
import { ProcessingStepper, STEP_ORDER, stepsFromResult, type StepUi } from "@/components/ingest/ProcessingStepper";
import { DataChip, EmptyState, HudLabel, PageHeader, SectionCard, SkeletonList } from "@/components/nwis";
import { EventCard } from "@/components/nwis/EventCard";
import { Button } from "@/components/ui/button";
import { confirmEvents, getDocuments, getSamples, getWells, processSample, uploadDocument } from "@/lib/api";
import { fmtIsoTimeIST, fmtNum } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import type { DrillingEvent, ExtractedEvent, IngestResult } from "@/lib/types";
import { cn } from "@/lib/utils";

type Phase = "idle" | "processing" | "review" | "saving" | "saved";
const SAMPLE_DDR = "DDR_DLJ-12_2019-03-14.pdf";
const SAMPLE_SCANNED = "DDR_DLJ-18_2020-01-27_SCANNED.pdf";
const STEP_DELAY_MS = 520;

export default function IngestPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [steps, setSteps] = useState<StepUi[]>(STEP_ORDER.map((s) => ({ key: s.key, label: s.label, state: "pending" })));
  const [result, setResult] = useState<IngestResult | null>(null);
  const [rows, setRows] = useState<ExtractedEvent[]>([]);
  const [saved, setSaved] = useState<DrillingEvent[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const timers = useRef<number[]>([]);

  const samples = useAsync(() => getSamples(), []);
  const wells = useAsync(() => getWells(), []);
  const docs = useAsync(() => getDocuments(), [phase === "saved"]);
  const wellOptions = useMemo(() => (wells.data?.wells ?? []).map((w) => ({ id: w.id, label: `${w.field}${w.is_active ? " · drilling" : ""}` })), [wells.data]);

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  useEffect(() => () => clearTimers(), []);

  /** Run the request while the stepper advances; reveal the returned step states one by one so the flow is visible. */
  const run = useCallback(async (job: () => Promise<IngestResult>) => {
    clearTimers();
    setPhase("processing");
    setResult(null);
    setSaved([]);
    setShowPreview(false);
    setSteps(STEP_ORDER.map((s, i) => ({ key: s.key, label: s.label, state: i === 0 ? "active" : "pending" })));
    // keep the stepper moving while the request is in flight
    const advance = STEP_ORDER.slice(1, 4).map((s, i) => window.setTimeout(() => setSteps((cur) => cur.map((x, j) => (j < i + 1 ? { ...x, state: x.state === "active" ? "done" : x.state } : j === i + 1 ? { ...x, state: "active" } : x))), (i + 1) * STEP_DELAY_MS));
    timers.current.push(...advance);
    let res: IngestResult;
    try {
      res = await job();
    } catch (e) {
      clearTimers();
      setSteps((cur) => cur.map((x) => (x.state === "active" ? { ...x, state: "failed", detail: e instanceof Error ? e.message : "Processing failed" } : x)));
      setPhase("idle");
      toast.error("Document processing failed", { description: e instanceof Error ? e.message : String(e) });
      return;
    }
    clearTimers();
    const final = stepsFromResult(res.steps);
    // reveal remaining states sequentially (never faster than the eye can follow)
    final.forEach((s, i) => {
      timers.current.push(
        window.setTimeout(() => {
          setSteps((cur) => cur.map((x, j) => (j < i ? final[j] : j === i ? s : x)));
          if (i === final.length - 1) {
            setResult(res);
            setRows(res.events.map((e) => ({ ...e, well_id: e.well_id ?? res.detected.well_id ?? null })));
            setPhase("review");
          }
        }, i * STEP_DELAY_MS * 0.7),
      );
    });
  }, []);

  const onFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Only PDF documents are supported");
      return;
    }
    void run(() => uploadDocument(f));
  };

  const confirm = async () => {
    if (!result) return;
    const bad = rows.find((r) => !r.well_id || !r.description.trim() || !r.depth_m);
    if (bad) {
      toast.error("Each event needs a well, a depth and a description");
      return;
    }
    setPhase("saving");
    try {
      const res = await confirmEvents(result.document_id, rows);
      setSaved(res.saved);
      setPhase("saved");
      toast.success(res.message, {
        description: "Now searchable in the Knowledge Base and citable by Ask NWIS.",
        action: { label: "Open Knowledge Base", onClick: () => window.location.assign(`/knowledge?q=${encodeURIComponent(result.filename)}`) },
        duration: 8000,
      });
    } catch (e) {
      setPhase("review");
      toast.error("Could not save events", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const reset = () => {
    clearTimers();
    setPhase("idle");
    setResult(null);
    setRows([]);
    setSaved([]);
    setSteps(STEP_ORDER.map((s) => ({ key: s.key, label: s.label, state: "pending" })));
  };

  return (
    <div className="space-y-4 p-4">
      <PageHeader question="How do old reports become institutional knowledge?">
        <div className="flex items-center gap-2">
          <Button data-testid="try-sample-ddr" variant="default" onClick={() => run(() => processSample(SAMPLE_DDR))} disabled={phase === "processing" || phase === "saving"}>
            <FileText className="h-3.5 w-3.5" /> Try sample DDR
          </Button>
          <Button data-testid="try-scanned" variant="secondary" onClick={() => run(() => processSample(SAMPLE_SCANNED))} disabled={phase === "processing" || phase === "saving"}>
            <ScanLine className="h-3.5 w-3.5" /> Try scanned report
          </Button>
        </div>
      </PageHeader>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 flex flex-col gap-4 xl:col-span-8">
          {/* dropzone + stepper */}
          <SectionCard variant="hero" title="Document intelligence" subtitle="PDF → TEXT LAYER → OCR FALLBACK → AI STRUCTURING (JSON) → ENGINEER REVIEW → KNOWLEDGE BASE" actions={<DataChip variant="synthetic">Synthetic data</DataChip>} bodyClassName="space-y-5">
            <div
              className={cn(
                "flex flex-col items-center justify-center gap-2 rounded-md border border-dashed px-6 py-8 text-center transition-colors",
                dragOver ? "border-amber bg-amber-soft" : "border-border-strong bg-bg/40 hover:border-amber/60",
                (phase === "processing" || phase === "saving") && "pointer-events-none opacity-60",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                onFiles(e.dataTransfer.files);
              }}
              role="button"
              tabIndex={0}
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}
            >
              <UploadCloud className={cn("h-7 w-7", dragOver ? "text-amber" : "text-muted")} />
              <div className="text-body font-medium text-text">Drop a Daily Drilling Report or Well Completion Report (PDF)</div>
              <div className="text-[12px] text-muted">Text PDFs are read directly; image-only scans go through OCR. Nothing is saved until you confirm.</div>
              <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => onFiles(e.target.files)} id="ingest-file" />
            </div>

            <ProcessingStepper steps={steps} />

            {result && (
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                <HudLabel value={result.filename} valueClassName="normal-case">
                  Document
                </HudLabel>
                <span className="h-3 w-px bg-border" />
                <HudLabel value={`${result.pages} · ${fmtNum(result.text_chars)} CHARS`}>Pages</HudLabel>
                <span className="h-3 w-px bg-border" />
                <HudLabel value={result.text_source.replace("_", " ").toUpperCase()}>Text source</HudLabel>
                <span className="h-3 w-px bg-border" />
                <HudLabel value={result.extraction_method === "llm" ? "LLM" : "RULE-BASED · OFFLINE"}>Structuring</HudLabel>
                {result.detected.well_id && (
                  <>
                    <span className="h-3 w-px bg-border" />
                    <HudLabel value={result.detected.well_id} valueClassName="text-amber">
                      Detected well
                    </HudLabel>
                  </>
                )}
                {result.ocr_status === "not_installed" && (
                  <DataChip variant="offline" title={result.ocr_detail}>
                    OCR engine not installed
                  </DataChip>
                )}
                <button onClick={() => setShowPreview((v) => !v)} className="ml-auto text-[11px] text-muted hover:text-text">
                  {showPreview ? "Hide extracted text" : "Show extracted text"}
                </button>
              </div>
            )}
            {result && showPreview && <pre className="max-h-56 overflow-auto rounded-md border border-border bg-bg/60 p-3 text-[11px] leading-4 text-muted">{result.preview_text || "(no text extracted)"}</pre>}
          </SectionCard>

          {/* review */}
          {(phase === "review" || phase === "saving" || phase === "saved") && result && (
            <SectionCard
              title={phase === "saved" ? "Saved to the knowledge base" : "Review extracted events"}
              subtitle={phase === "saved" ? `${saved.length} EVENT${saved.length === 1 ? "" : "S"} · ${result.filename}` : `${rows.length} EVENT${rows.length === 1 ? "" : "S"} EXTRACTED · EDIT BEFORE CONFIRMING`}
              actions={
                phase === "saved" ? (
                  <>
                    <Button asChild variant="default">
                      <Link href={`/knowledge?q=${encodeURIComponent(result.filename)}`}>
                        Search in Knowledge Base <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                    <Button variant="secondary" onClick={reset}>
                      Process another
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" onClick={reset} disabled={phase === "saving"}>
                      Discard
                    </Button>
                    <Button data-testid="confirm-save" variant="default" onClick={confirm} disabled={phase === "saving" || rows.length === 0}>
                      {phase === "saving" ? "Saving…" : "Confirm & Save"}
                    </Button>
                  </>
                )
              }
            >
              {phase === "saved" ? (
                <div className="space-y-2">
                  {saved.map((e) => (
                    <EventCard key={e.id} event={e} showWell />
                  ))}
                </div>
              ) : rows.length === 0 ? (
                <EmptyState compact icon={FileScan} title="No events were extracted" description="Add an event manually or try another document." action={<Button size="sm" onClick={() => setRows([{ well_id: result.detected.well_id, event_type: "Mud Loss", depth_m: 0, formation: null, severity: "Medium", npt_hours: 0, mud_weight_ppg: 0, description: "", mitigation: "", lesson_learned: "", confidence: 0.5, method: "manual" }])}>Add event</Button>} />
              ) : (
                <ExtractedEventsTable rows={rows} wellOptions={wellOptions} onChange={setRows} disabled={phase === "saving"} />
              )}
            </SectionCard>
          )}
        </div>

        {/* right column */}
        <div className="col-span-12 flex flex-col gap-4 xl:col-span-4">
          <SectionCard title="Sample documents" subtitle="GENERATED FROM THE SEEDED WELL RECORDS" flush>
            {samples.data ? (
              <ul className="divide-y divide-border">
                {samples.data.samples.map((s) => (
                  <li key={s.name} className="flex items-center gap-3 px-4 py-2.5">
                    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md border", s.kind === "scanned" ? "border-sev-medium/40 bg-sev-medium/10 text-sev-medium" : "border-border bg-surface-2 text-muted")}>
                      {s.kind === "scanned" ? <ScanLine className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-medium text-text">{s.label}</div>
                      <div className="num flex items-center gap-1.5 text-[10px] text-muted">
                        <span className={cn("rounded-sm px-1 uppercase tracking-[0.08em]", s.kind === "scanned" ? "bg-sev-medium/10 text-sev-medium" : "bg-surface-2 text-muted")}>{s.kind === "scanned" ? "scan" : "text"}</span>
                        <span className="truncate">{s.name}</span>
                        <span className="shrink-0">· {s.size_kb ?? "—"} KB</span>
                      </div>
                    </div>
                    <Button variant="chip" onClick={() => run(() => processSample(s.name))} disabled={phase === "processing" || phase === "saving"}>
                      Process
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <SkeletonList rows={6} className="p-4" />
            )}
          </SectionCard>

          <SectionCard title="Recently ingested" subtitle="DOCUMENTS · CONFIRMED EVENTS" flush className="flex-1">
            {docs.data && docs.data.documents.length > 0 ? (
              <ul className="divide-y divide-border">
                {docs.data.documents.slice(0, 8).map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-4 py-2">
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", d.status === "confirmed" ? "bg-teal" : "bg-dim")} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] text-text">{d.filename}</div>
                      <div className="num text-[10px] text-muted">
                        {d.status.toUpperCase()} · {d.event_count} events · {d.text_source.replace("_", " ")} · {fmtIsoTimeIST(d.uploaded_at)}
                      </div>
                    </div>
                    {d.well_id && <span className="num text-[11px] text-amber">{d.well_id}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState compact icon={FileScan} title="Nothing ingested yet" description="Confirmed events appear here with their source document." className="m-4" />
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
