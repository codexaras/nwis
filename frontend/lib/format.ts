/** Formatting conventions: depth "2,784.4 m", pressures in ppg, times in IST, coordinates to 4 dp. */

export function fmtNum(n: number | null | undefined, decimals = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtDepth(m: number | null | undefined, decimals = 1): string {
  if (m === null || m === undefined) return "—";
  return `${fmtNum(m, decimals)} m`;
}

export function fmtPpg(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${v.toFixed(1)} ppg`;
}

export function fmtKm(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${v.toFixed(1)} km`;
}

export function fmtCoord(v: number): string {
  return v.toFixed(4);
}

export function fmtHours(h: number | null | undefined): string {
  if (h === null || h === undefined) return "—";
  return `${fmtNum(h, h < 10 ? 1 : 0)} h`;
}

const istTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
const istDate = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });

export function fmtTimeIST(d: Date = new Date()): string {
  return istTime.format(d);
}

export function fmtDateIST(d: Date = new Date()): string {
  return istDate.format(d).toUpperCase();
}

export function fmtIsoTimeIST(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : istTime.format(d);
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : istDate.format(d);
}

export function fmtPct(v: number | null | undefined, decimals = 0): string {
  if (v === null || v === undefined) return "—";
  return `${v.toFixed(decimals)}%`;
}
