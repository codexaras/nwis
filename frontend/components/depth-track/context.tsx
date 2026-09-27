"use client";
/**
 * Shared depth/hover state for every depth-aligned visual: the Well Depth Track, the event lists
 * beside it and (later) the correlation and forward-risk views. Hovering any depth or event draws one
 * crosshair across all tracks with a mono depth readout. Zoom (px per metre) lives here too so controls can sit
 * in a card header while the track scrolls independently.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export const ZOOM_LEVELS = [0.16, 0.24, 0.34, 0.5, 0.72];

interface DepthHoverState {
  hoverDepth: number | null;
  setHoverDepth: (d: number | null) => void;
  hoverEventId: number | null;
  setHoverEventId: (id: number | null) => void;
  selectedEventId: number | null;
  setSelectedEventId: (id: number | null) => void;
  /** null = fit to viewport */
  pxPerM: number | null;
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
}

const Ctx = createContext<DepthHoverState | null>(null);

export function DepthHoverProvider({ children, initialSelected = null, initialZoom = null }: { children: ReactNode; initialSelected?: number | null; initialZoom?: number | null }) {
  const [hoverDepth, setHoverDepth] = useState<number | null>(null);
  const [hoverEventId, setHoverEventId] = useState<number | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(initialSelected);
  const [pxPerM, setPxPerM] = useState<number | null>(initialZoom);

  const step = useCallback((dir: 1 | -1) => {
    setPxPerM((cur) => {
      const base = cur ?? ZOOM_LEVELS[1];
      const idx = ZOOM_LEVELS.findIndex((z) => z >= base - 1e-6);
      const next = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, (idx < 0 ? ZOOM_LEVELS.length - 1 : idx) + dir));
      return ZOOM_LEVELS[next];
    });
  }, []);
  const value = useMemo(
    () => ({
      hoverDepth, setHoverDepth, hoverEventId, setHoverEventId, selectedEventId, setSelectedEventId,
      pxPerM, zoomIn: () => step(1), zoomOut: () => step(-1), fit: () => setPxPerM(null),
    }),
    [hoverDepth, hoverEventId, selectedEventId, pxPerM, step],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDepthHover(): DepthHoverState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDepthHover must be used inside <DepthHoverProvider>");
  return v;
}
