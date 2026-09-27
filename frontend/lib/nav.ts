import { BookOpenText, FileScan, GitCompareArrows, LayoutDashboard, Layers, MapPinned, MessageSquareText, Radar, type LucideIcon } from "lucide-react";

export interface NavItem {
  key: string;
  href: string;
  label: string;
  title: string;
  question: string;
  icon: LucideIcon;
  /** matches any pathname starting with this prefix */
  match: string;
}

export const NAV: NavItem[] = [
  { key: "dashboard", href: "/dashboard", match: "/dashboard", label: "Dashboard", title: "Operations Overview", question: "What is happening right now?", icon: LayoutDashboard },
  { key: "map", href: "/map", match: "/map", label: "Nearby Wells", title: "Nearby Wells Map", question: "What nearby wells can teach us?", icon: MapPinned },
  { key: "wells", href: "/wells", match: "/wells", label: "Well Profile", title: "Well Profile", question: "What happened while this well was drilled?", icon: Layers },
  { key: "correlation", href: "/correlation", match: "/correlation", label: "Correlation", title: "Offset Correlation", question: "Where do formations and incidents align?", icon: GitCompareArrows },
  { key: "risk", href: "/risk", match: "/risk", label: "Risk Forecast", title: "Risk Forecast", question: "What problems may occur ahead?", icon: Radar },
  { key: "knowledge", href: "/knowledge", match: "/knowledge", label: "Knowledge Base", title: "Knowledge Base", question: "What has historical experience taught us?", icon: BookOpenText },
  { key: "ingest", href: "/ingest", match: "/ingest", label: "Document Intelligence", title: "Document Intelligence", question: "How do old reports become institutional knowledge?", icon: FileScan },
  { key: "assistant", href: "/assistant", match: "/assistant", label: "Ask NWIS", title: "Ask NWIS", question: "How can an engineer retrieve that knowledge instantly?", icon: MessageSquareText },
];

export function navForPath(pathname: string): NavItem {
  return NAV.find((n) => pathname === n.match || pathname.startsWith(n.match + "/")) ?? NAV[0];
}
