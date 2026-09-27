/** API response shapes (mirrors backend/app/routers). */
import type { Severity } from "./tokens";

export type { Severity };

export interface WellSummary {
  id: string;
  name: string;
  field: string;
  lat: number;
  lon: number;
  spud_date: string | null;
  completion_date: string | null;
  total_depth_m: number;
  status: string;
  well_type: string;
  rig: string;
  notes: string;
  is_active: boolean;
  operator: string;
  event_count: number;
  npt_hours: number;
  max_severity: Severity | null;
  high_critical_count: number;
  events_by_type: Record<string, number>;
  distance_km: number;
  bearing: string | null;
  deepest_formation?: string | null;
}

export interface WellsResponse {
  count: number;
  active_well_id: string | null;
  wells: WellSummary[];
}

export interface FormationTop {
  id: number;
  well_id: string;
  name: string;
  order_index: number;
  top_m: number;
  base_m: number;
  thickness_m: number;
  lithology: string;
  lithology_desc: string;
  color: string | null;
  risk_tendency: string | null;
}

export interface CasingString {
  id: number;
  well_id: string;
  string_type: string;
  size_in: string;
  hole_size_in: string;
  shoe_depth_m: number;
  cement_top_m: number;
  cementing_notes: string;
  order_index: number;
}

export interface DrillingEvent {
  id: number;
  well_id: string;
  depth_m: number;
  formation: string;
  event_type: string;
  severity: Severity;
  severity_rank: number;
  npt_hours: number;
  mud_weight_ppg: number;
  description: string;
  mitigation: string;
  lesson_learned: string;
  source_doc: string;
  event_date: string | null;
  origin: string;
  document_id: number | null;
  citation: string;
  well?: { id: string; name: string; field: string; lat: number; lon: number; is_active: boolean };
  field?: string | null;
  distance_km?: number | null;
  score?: number;
}

export interface DepthLog {
  depth_m: number;
  formation: string;
  rop: number;
  wob: number;
  rpm: number;
  torque: number;
  spp: number;
  mud_weight: number;
  ecd: number;
  gas_units: number;
}

export interface PressurePoint {
  depth_m: number;
  pore_pressure_ppg: number;
  fracture_gradient_ppg: number;
  window_ppg: number;
}

export interface WellDetail extends WellSummary {
  formations: FormationTop[];
  casing: CasingString[];
  events: DrillingEvent[];
  logs: DepthLog[];
  pressure_window: PressurePoint[];
  lessons: { event_id: number; depth_m: number; formation: string; event_type: string; severity: Severity; lesson_learned: string; citation: string }[];
  current_depth_m?: number;
  current_formation?: string;
}

export interface NearbyWell extends WellSummary {
  bearing_deg: number;
  key_events: DrillingEvent[];
  formation_tops: { name: string; top_m: number }[];
}

export interface NearbyResponse {
  center: WellSummary;
  radius_km: number;
  count: number;
  total_events: number;
  total_npt_hours: number;
  wells: NearbyWell[];
}

export interface LiveParams {
  rop: number;
  wob: number;
  rpm: number;
  torque: number;
  spp: number;
  mud_weight: number;
  ecd: number;
  gas_units: number;
  hookload: number;
  flow_rate: number;
}

export interface LiveAlert {
  id: string;
  event_id: number;
  well_id: string;
  depth_m: number;
  distance_ahead_m: number;
  event_type: string;
  severity: Severity;
  formation: string;
  distance_km: number;
  bearing: string;
  npt_hours: number;
  citation: string;
  title: string;
  message: string;
  recommendation: string;
  evidence: string;
  mitigation: string;
  first_seen: string;
  is_demo: boolean;
}

export interface UpcomingFormation {
  name: string;
  top_m: number;
  distance_m: number;
  risk_tendency: string;
  color: string;
  projected?: boolean;
}

export interface LiveSnapshot {
  feed: string;
  data_label: string;
  well_id: string;
  well_name: string;
  field: string;
  rig: string;
  lat: number;
  lon: number;
  timestamp: string;
  clock_ist: string;
  status: "DRILLING" | "TD REACHED";
  speed: number;
  radius_km: number;
  offset_wells_in_radius: number;
  depth_m: number;
  start_depth_m: number;
  planned_td_m: number;
  progress_pct: number;
  formation: string;
  formation_color: string;
  formation_top_m: number;
  formation_base_m: number;
  formation_rel_pos: number;
  next_formation: string | null;
  next_formation_top_m: number | null;
  distance_to_next_m: number | null;
  params: LiveParams;
  history: (LiveParams & { depth_m: number })[];
  alerts: LiveAlert[];
  active_alert_count: number;
  top_alert: LiveAlert | null;
  upcoming_formations: UpcomingFormation[];
  system: { nwis_rt: string; risk_engine: string; feed: string };
  controls: { speeds: number[]; presets: { label: string; depth_m: number }[] };
  applied?: Record<string, unknown>;
}

export interface LiveControls {
  speed?: number;
  jump_to_depth?: number;
  reset?: boolean;
  trigger_alert?: boolean;
  radius_km?: number;
}

export interface Stats {
  generated_at: string;
  center_well_id: string | null;
  radius_km: number;
  wells_total: number;
  wells_historical: number;
  fields: string[];
  offset_wells_in_radius: number;
  offset_events: number;
  offset_npt_hours: number;
  offset_high_critical: number;
  events_total: number;
  events_by_type: Record<string, number>;
  events_by_severity: Record<Severity, number>;
  events_by_formation: Record<string, number>;
  npt_hours_total: number;
  indexed_reports: number;
  documents_ingested: number;
  documents_confirmed: number;
  uploaded_events: number;
  active_alerts: number;
  active_well: { id: string | null; depth_m: number | null; formation: string | null };
  deepest_well_m: number;
  llm: { enabled: boolean; provider: string | null; model: string | null };
}

export interface EventsResponse {
  query: string;
  filters: Record<string, string | number | null>;
  total: number;
  limit: number;
  offset: number;
  facets: { event_types: Record<string, number>; formations: Record<string, number>; severities: Record<string, number> };
  items: DrillingEvent[];
  ranking: string;
}

export interface CorrelationWell extends WellSummary {
  formations: FormationTop[];
  casing: CasingString[];
  events: DrillingEvent[];
}

export interface CorrelationResponse {
  well_ids: string[];
  wells: CorrelationWell[];
  formation_order: string[];
  links: { formation: string; color: string; points: { well_id: string; top_m: number; base_m: number }[] }[];
  depth_max_m: number;
  event_count: number;
}

export interface RiskBin {
  depth_m: number;
  formation: string;
  rel_pos: number;
  scores: Record<string, number>;
  top_type: string;
  top_score: number;
  level: string;
}

export interface RiskZone {
  event_type: string;
  formation: string;
  depth_from_m: number;
  depth_to_m: number;
  depth_m: number;
  score: number;
  level: string;
  label: string;
  evidence_count: number;
  high_severity_count: number;
  nearest_offset_km: number | null;
  contributing_wells: { well_id: string; distance_km: number; bearing: string; events: { event_id: number; depth_m: number; severity: Severity; npt_hours: number; citation: string }[] }[];
  indicators: string[];
  why: string[];
  recommended_action: string;
  recommended_mud_weight_ppg: number | null;
  ahead: boolean;
  distance_ahead_m?: number;
  bins: { depth_m: number; score: number }[];
}

export interface RiskProfile {
  well_id: string;
  well_name: string;
  is_active: boolean;
  current_depth_m: number | null;
  planned_td_m: number;
  radius_km: number;
  bin_m: number;
  generated_at: string;
  offset_wells: { well_id: string; distance_km: number; events: number }[];
  formations: { name: string; top_m: number; base_m: number; color: string }[];
  bins: RiskBin[];
  top_risks: RiskZone[];
  risks_ahead?: RiskZone[];
  safe_intervals: { depth_from_m: number; depth_to_m: number; formation: string }[];
  heatmap: { depths: number[]; event_types: string[]; values: number[][] };
  model: Record<string, unknown>;
}

export interface ChatCitation {
  label: string;
  well_id: string;
  depth_m: number;
  event_id: number;
  event_type: string;
  severity: Severity;
  formation: string;
}

export interface ChatResponse {
  mode: "llm" | "offline_structured";
  provider: { enabled: boolean; provider: string | null; model: string | null };
  title: string;
  summary: string;
  sections: { heading: string; text?: string; items?: string[] }[];
  citations: ChatCitation[];
  answer_text: string;
  intent: string;
  retrieved: number;
}

export interface ExtractedEvent {
  well_id: string | null;
  event_type: string;
  depth_m: number;
  formation: string | null;
  severity: Severity;
  npt_hours: number;
  mud_weight_ppg: number;
  description: string;
  mitigation: string;
  lesson_learned: string;
  confidence: number;
  method: string;
}

export interface IngestStep {
  key: string;
  label: string;
  status: string;
  detail: string;
  ms: number;
}

export interface IngestResult {
  document_id: number;
  document?: DocumentRecord;
  filename: string;
  pages: number;
  text_chars: number;
  text_source: string;
  ocr_status: string;
  ocr_detail: string;
  ocr_message: string | null;
  extraction_method: string;
  detected: { well_id: string | null; report_date: string | null; formations_mentioned: string[]; well_known?: boolean };
  events: ExtractedEvent[];
  steps: IngestStep[];
  preview_text: string;
  processed_at: string;
}

export interface SampleDoc {
  name: string;
  label: string;
  kind: "text" | "scanned";
  well_id: string;
  available: boolean;
  size_kb: number | null;
  url: string;
}

export interface DocumentRecord {
  id: number;
  filename: string;
  uploaded_at: string;
  page_count: number;
  text_chars: number;
  text_source: string;
  ocr_status: string;
  extraction_method: string;
  well_id: string | null;
  status: string;
  event_count: number;
  is_sample: boolean;
}

export interface ConfirmResponse {
  document: Record<string, unknown>;
  saved: DrillingEvent[];
  count: number;
  message: string;
}
