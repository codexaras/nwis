/** Offline Ask NWIS: canned structured answers for the suggested prompts, else a simple local retrieval summary. */
import type { ChatResponse, DrillingEvent, EventsResponse } from "./types";

const FORMATIONS = ["Alluvium", "Namsang", "Dhekiajuli", "Girujan", "Tipam", "Barail", "Kopili", "Sylhet", "Langpar", "Basement"];
const TYPES = ["Mud Loss", "Kick", "Stuck Pipe", "Torque Spike", "Tight Hole", "Cementing Issue", "Fishing", "Wellbore Instability"];
const SEV_RANK: Record<string, number> = { Low: 0, Medium: 1, High: 2, Critical: 3 };

export async function offlineChat(message: string): Promise<ChatResponse> {
  const samples = await fetch("/demo-data/assistant-samples.json").then((r) => r.json() as Promise<{ prompts: string[]; answers: Record<string, ChatResponse> }>);
  const key = Object.keys(samples.answers).find((p) => p.trim().toLowerCase() === message.trim().toLowerCase());
  if (key) return samples.answers[key];

  const all = await fetch("/demo-data/events.json").then((r) => r.json() as Promise<EventsResponse>);
  const low = message.toLowerCase();
  const form = FORMATIONS.find((f) => low.includes(f.toLowerCase()));
  const type = TYPES.find((t) => low.includes(t.toLowerCase()));
  const well = (message.match(/\b[A-Z]{3}-(?:ACT-)?\d{2,3}\b/i) ?? [])[0]?.toUpperCase();
  let hits: DrillingEvent[] = all.items.filter((e) => (!form || e.formation === form) && (!type || e.event_type === type) && (!well || e.well_id === well));
  if (!hits.length) hits = all.items;
  hits = hits.sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity] || (a.distance_km ?? 99) - (b.distance_km ?? 99)).slice(0, 8);
  const counts = hits.reduce<Record<string, number>>((acc, e) => ((acc[e.event_type] = (acc[e.event_type] ?? 0) + 1), acc), {});
  const primary = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  const mits = Array.from(new Set(hits.map((e) => e.mitigation).filter(Boolean))).slice(0, 3);
  const title = `${(form ?? well ?? type ?? "OFFSET").toUpperCase()} OFFSET EXPERIENCE`;
  const summary = `${hits.length} relevant incidents identified across ${new Set(hits.map((e) => e.well_id)).size} wells (offline demo data).`;
  const sections = [
    { heading: "PRIMARY RISK", text: `${primary} — ${counts[primary] ?? 0} of ${hits.length} incidents` },
    { heading: "HISTORICAL MITIGATION", items: mits },
    { heading: "RECOMMENDED ACTION", text: "Review the cited offset incidents and apply their mitigations before entering the interval." },
  ];
  const citations = hits.map((e) => ({ label: e.citation, well_id: e.well_id, depth_m: e.depth_m, event_id: e.id, event_type: e.event_type, severity: e.severity, formation: e.formation }));
  const answer_text = [title, summary, "", ...sections.flatMap((s) => [s.heading, ...(s.text ? [s.text] : []), ...(s.items ?? []).map((i) => `• ${i}`), ""]), "EVIDENCE", citations.map((c) => `[${c.label}]`).join(" ")].join("\n");
  return { mode: "offline_structured", provider: { enabled: false, provider: null, model: null }, title, summary, sections, citations, answer_text, intent: "experience", retrieved: hits.length };
}
