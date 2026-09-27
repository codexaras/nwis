/**
 * Design tokens as JS values — for SVG/d3 visuals, Leaflet divIcons and Recharts, which cannot read
 * CSS variables at render time. Keep in sync with app/globals.css.
 */
export const colors = {
  bg: "#0B0F14",
  surface: "#121821",
  surface2: "#18202B",
  surface3: "#1E2836",
  border: "#243041",
  borderStrong: "#2F3D52",
  text: "#E6EDF3",
  muted: "#8B98A9",
  dim: "#5C6878",
  amber: "#F59E0B",
  teal: "#14B8A6",
} as const;

export type Severity = "Low" | "Medium" | "High" | "Critical";

export const severityColor: Record<Severity, string> = {
  Low: "#22C55E",
  Medium: "#EAB308",
  High: "#F97316",
  Critical: "#EF4444",
};

export const severityRank: Record<Severity, number> = { Low: 0, Medium: 1, High: 2, Critical: 3 };

/** Upper Assam stratigraphy, top → bottom. Colours are the fixed muted geological palette. */
export const formations = [
  { name: "Alluvium", abbrev: "ALV", color: "#7C8A6B", lithology: "sand" },
  { name: "Namsang", abbrev: "NMS", color: "#9A8B5A", lithology: "sand" },
  { name: "Dhekiajuli", abbrev: "DHK", color: "#B59A5B", lithology: "sand" },
  { name: "Girujan", abbrev: "GRJ", color: "#8E6E4E", lithology: "clay" },
  { name: "Tipam", abbrev: "TPM", color: "#C9A45C", lithology: "sand" },
  { name: "Barail", abbrev: "BRL", color: "#4F5B63", lithology: "coal" },
  { name: "Kopili", abbrev: "KPL", color: "#6B5B7A", lithology: "shale" },
  { name: "Sylhet", abbrev: "SYL", color: "#5F8A8B", lithology: "limestone" },
  { name: "Langpar", abbrev: "LNP", color: "#7A7F86", lithology: "shale" },
  { name: "Basement", abbrev: "BSM", color: "#3A3F47", lithology: "basement" },
] as const;

export type FormationName = (typeof formations)[number]["name"];

export const formationColor = Object.fromEntries(formations.map((f) => [f.name, f.color])) as Record<FormationName, string>;

export const eventTypes = [
  "Mud Loss",
  "Kick",
  "Stuck Pipe",
  "Torque Spike",
  "Tight Hole",
  "Cementing Issue",
  "Fishing",
  "Wellbore Instability",
] as const;

export type EventType = (typeof eventTypes)[number];

/** Depth formatting convention: "2,784.4 m" */
export function formatDepth(m: number, decimals = 1): string {
  return `${m.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} m`;
}

export function formatNumber(n: number, decimals = 0): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatCoord(v: number): string {
  return v.toFixed(4);
}
