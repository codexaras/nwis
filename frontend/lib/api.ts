/**
 * API client with automatic offline fallback.
 *
 * Every call tries the FastAPI backend first (NEXT_PUBLIC_API_URL, default http://localhost:8000). If the backend
 * is unreachable, the call is served from the bundled JSON snapshots in /public/demo-data and the app switches to
 * OFFLINE DEMO DATA mode (a probe re-checks the backend periodically). Nothing ever renders blank.
 */
import { useSyncExternalStore } from "react";

import { offlineChat } from "./offline-chat";
import { offlineLive } from "./offline-live";
import type {
  ChatResponse,
  ConfirmResponse,
  CorrelationResponse,
  DocumentRecord,
  DrillingEvent,
  EventsResponse,
  ExtractedEvent,
  IngestResult,
  LiveControls,
  LiveSnapshot,
  NearbyResponse,
  RiskProfile,
  SampleDoc,
  Stats,
  WellDetail,
  WellsResponse,
} from "./types";

export const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
export const DEFAULT_RADIUS_KM = 15;
export const ACTIVE_WELL_ID = "DLJ-ACT-01";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// ---------------------------------------------------------------------------------------------
// offline store (tiny external store → useOffline())
// ---------------------------------------------------------------------------------------------
let offline = false;
let offlineUntil = 0;
const listeners = new Set<() => void>();

function setOffline(v: boolean) {
  if (v) offlineUntil = Date.now() + 12_000;
  if (offline !== v) {
    offline = v;
    listeners.forEach((l) => l());
  }
}

export function useOffline(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => offline,
    () => false,
  );
}

let lastProbe = 0;
async function probeBackend() {
  // at most one reconnect attempt per offline window → one refused request every 12 s, not one per call
  if (Date.now() - lastProbe < 12_000) return;
  lastProbe = Date.now();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch(`${API_BASE}/api/health`, { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(t);
    if (r.ok) setOffline(false);
  } catch {
    offlineUntil = Date.now() + 12_000;
  }
}

async function backend<T>(path: string, init?: RequestInit, timeoutMs = 5000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${API_BASE}${path}`, { ...init, signal: ctrl.signal, cache: "no-store" });
    if (!r.ok) {
      let detail = r.statusText;
      try {
        const j = await r.json();
        detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail ?? j);
      } catch {
        /* ignore */
      }
      throw new ApiError(r.status, detail);
    }
    setOffline(false);
    return (await r.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

export async function demo<T>(name: string): Promise<T> {
  const r = await fetch(`/demo-data/${name}.json`, { cache: "force-cache" });
  if (!r.ok) throw new Error(`demo snapshot ${name} missing`);
  return (await r.json()) as T;
}

/** Try the backend; on network failure / 5xx use the fallback. 4xx errors are real and propagate. */
async function withFallback<T>(path: string, fallback: () => Promise<T>, init?: RequestInit): Promise<T> {
  if (offline && Date.now() < offlineUntil) {
    void probeBackend();
    return fallback();
  }
  try {
    return await backend<T>(path, init);
  } catch (e) {
    if (e instanceof ApiError && e.status < 500) throw e;
    setOffline(true);
    return fallback();
  }
}

function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// ---------------------------------------------------------------------------------------------
// endpoints
// ---------------------------------------------------------------------------------------------
export function getStats(radiusKm = DEFAULT_RADIUS_KM, wellId = ACTIVE_WELL_ID): Promise<Stats> {
  return withFallback(`/api/stats${qs({ radius_km: radiusKm, well_id: wellId })}`, () => demo<Stats>("stats"));
}

export function getWells(): Promise<WellsResponse> {
  return withFallback("/api/wells", () => demo<WellsResponse>("wells"));
}

export function getWell(id: string): Promise<WellDetail> {
  return withFallback(`/api/wells/${encodeURIComponent(id)}`, () => demo<WellDetail>(`wells/${id}`));
}

const SNAPSHOT_RADII = [5, 10, 15, 25];

export function getNearby(radiusKm = DEFAULT_RADIUS_KM, wellId = ACTIVE_WELL_ID, filters: { type?: string; formation?: string } = {}): Promise<NearbyResponse> {
  return withFallback(`/api/wells/nearby${qs({ well_id: wellId, radius_km: radiusKm, ...filters })}`, async () => {
    const snap = SNAPSHOT_RADII.find((r) => r >= radiusKm) ?? 25;
    const d = await demo<NearbyResponse>(`nearby-${snap}`);
    const wells = d.wells.filter((w) => w.distance_km <= radiusKm);
    return { ...d, radius_km: radiusKm, count: wells.length, wells, total_events: wells.reduce((a, w) => a + w.event_count, 0), total_npt_hours: wells.reduce((a, w) => a + w.npt_hours, 0) };
  });
}

export interface EventQuery {
  search?: string;
  type?: string;
  formation?: string;
  severity?: string;
  well_id?: string;
  field?: string;
  origin?: string;
  radius_km?: number;
  limit?: number;
  offset?: number;
}

export function getEvents(q: EventQuery = {}): Promise<EventsResponse> {
  return withFallback(`/api/events${qs({ limit: 50, ...q })}`, async () => {
    const all = await demo<EventsResponse>("events");
    const needle = (q.search ?? "").toLowerCase().trim();
    let items = all.items.filter(
      (e) =>
        (!q.type || e.event_type === q.type) &&
        (!q.formation || e.formation === q.formation) &&
        (!q.severity || e.severity === q.severity) &&
        (!q.well_id || e.well_id === q.well_id) &&
        (!q.field || e.field === q.field) &&
        (!q.origin || e.origin === q.origin) &&
        (q.radius_km === undefined || (e.distance_km ?? 0) <= q.radius_km) &&
        (!needle || `${e.event_type} ${e.formation} ${e.well_id} ${e.description} ${e.mitigation} ${e.lesson_learned}`.toLowerCase().includes(needle)),
    );
    items = [...offlineAddedEvents.filter((e) => !needle || e.description.toLowerCase().includes(needle)), ...items];
    const facet = (key: keyof DrillingEvent) => items.reduce<Record<string, number>>((acc, e) => ((acc[String(e[key])] = (acc[String(e[key])] ?? 0) + 1), acc), {});
    const offset = q.offset ?? 0;
    const limit = q.limit ?? 50;
    return { ...all, query: q.search ?? "", total: items.length, offset, limit, items: items.slice(offset, offset + limit), facets: { event_types: facet("event_type"), formations: facet("formation"), severities: facet("severity") } };
  });
}

export function getCorrelation(wellIds: string[]): Promise<CorrelationResponse> {
  const ids = wellIds.map((s) => s.trim().toUpperCase()).filter(Boolean);
  return withFallback(`/api/correlation${qs({ well_ids: ids.join(",") })}`, async () => {
    const wells = await Promise.all(ids.map((id) => demo<WellDetail>(`wells/${id}`)));
    const order = (await demo<{ formations: { name: string; color: string }[] }>("formations")).formations;
    const links = order
      .map((f) => ({ formation: f.name, color: f.color, points: wells.flatMap((w) => w.formations.filter((t) => t.name === f.name).map((t) => ({ well_id: w.id, top_m: t.top_m, base_m: t.base_m }))) }))
      .filter((l) => l.points.length >= 2);
    return { well_ids: ids, wells, formation_order: order.map((f) => f.name), links, depth_max_m: Math.max(...wells.map((w) => w.total_depth_m)), event_count: wells.reduce((a, w) => a + w.events.length, 0) };
  });
}

export function getRisk(wellId = ACTIVE_WELL_ID, radiusKm = DEFAULT_RADIUS_KM): Promise<RiskProfile> {
  return withFallback(`/api/risk/profile${qs({ well_id: wellId, radius_km: radiusKm })}`, async () => {
    const d = await demo<RiskProfile>(radiusKm > 15 ? "risk-profile-25" : "risk-profile-15");
    return { ...d, radius_km: radiusKm };
  });
}

export function getLive(controls: LiveControls = {}): Promise<LiveSnapshot> {
  return withFallback(`/api/live${qs(controls as Record<string, string | number | boolean | undefined>)}`, () => offlineLive(controls));
}

export function liveControl(body: LiveControls): Promise<LiveSnapshot> {
  return withFallback("/api/live/control", () => offlineLive(body), json(body));
}

export function chat(message: string, wellId?: string, radiusKm?: number): Promise<ChatResponse> {
  return withFallback("/api/assistant/chat", () => offlineChat(message), json({ message, well_id: wellId, radius_km: radiusKm }));
}

export function getSamples(): Promise<{ samples: SampleDoc[] }> {
  return withFallback("/api/documents/samples", () => demo("documents-samples"));
}

export function processSample(name: string): Promise<IngestResult> {
  return withFallback(`/api/documents/sample${qs({ name })}`, () => demo<IngestResult>(name.includes("SCANNED") ? "ingest-sample-scanned" : "ingest-sample-ddr"), { method: "POST" });
}

export async function uploadDocument(file: File): Promise<IngestResult> {
  const fd = new FormData();
  fd.append("file", file);
  return withFallback("/api/documents/upload", async () => {
    const d = await demo<IngestResult>("ingest-sample-ddr");
    return { ...d, filename: file.name, steps: d.steps.map((s) => (s.key === "upload" ? { ...s, detail: `${file.name} · offline demo (bundled extraction shown)` } : s)) };
  }, { method: "POST", body: fd });
}

/** Events / documents confirmed while offline live only in this tab (still searchable in the Knowledge Base). */
const offlineAddedEvents: DrillingEvent[] = [];
const offlineDocuments: DocumentRecord[] = [];

export function getEvent(id: number): Promise<DrillingEvent> {
  return withFallback(`/api/events/${id}`, async () => {
    const local = offlineAddedEvents.find((e) => e.id === id);
    if (local) return local;
    const all = await demo<EventsResponse>("events");
    const hit = all.items.find((e) => e.id === id);
    if (!hit) throw new ApiError(404, `event ${id} not found`);
    return hit;
  });
}

export function getDocuments(): Promise<{ count: number; documents: DocumentRecord[] }> {
  return withFallback("/api/documents", async () => ({ count: offlineDocuments.length, documents: [...offlineDocuments] }));
}

export function getSuggestions(): Promise<{ prompts: string[]; llm: { enabled: boolean; provider: string | null; model: string | null } }> {
  return withFallback("/api/assistant/suggestions", async () => {
    const d = await demo<{ prompts: string[] }>("assistant-samples");
    return { prompts: d.prompts, llm: { enabled: false, provider: null, model: null } };
  });
}

export function confirmEvents(documentId: number, events: ExtractedEvent[]): Promise<ConfirmResponse> {
  return withFallback("/api/documents/confirm", async () => {
    const saved: DrillingEvent[] = events.map((e, i) => ({
      id: 100000 + offlineAddedEvents.length + i,
      well_id: e.well_id ?? ACTIVE_WELL_ID,
      depth_m: e.depth_m,
      formation: e.formation ?? "Unknown",
      event_type: e.event_type,
      severity: e.severity,
      severity_rank: ["Low", "Medium", "High", "Critical"].indexOf(e.severity),
      npt_hours: e.npt_hours,
      mud_weight_ppg: e.mud_weight_ppg,
      description: e.description,
      mitigation: e.mitigation,
      lesson_learned: e.lesson_learned,
      source_doc: "uploaded document (offline)",
      event_date: null,
      origin: "upload",
      document_id: documentId,
      citation: `${e.well_id ?? ACTIVE_WELL_ID} · ${Math.round(e.depth_m).toLocaleString("en-US")} m`,
    }));
    offlineAddedEvents.unshift(...saved);
    const doc: DocumentRecord = { id: documentId, filename: saved[0]?.source_doc ?? "document", uploaded_at: new Date().toISOString(), page_count: 1, text_chars: 0, text_source: "offline", ocr_status: "not_needed", extraction_method: "rules", well_id: saved[0]?.well_id ?? null, status: "confirmed", event_count: saved.length, is_sample: true };
    offlineDocuments.unshift(doc);
    return { document: doc as unknown as Record<string, unknown>, saved, count: saved.length, message: `${saved.length} event(s) added to the knowledge base (offline session)` };
  }, json({ document_id: documentId, events }));
}
