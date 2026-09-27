"use client";
/**
 * Global live-feed context: polls /api/live every 3 s, diffs alerts → toasts, holds UI-wide state
 * (radius, focus well, field mode, demo panel).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { ACTIVE_WELL_ID, DEFAULT_RADIUS_KM, getLive, liveControl, useOffline } from "./api";
import type { LiveAlert, LiveControls, LiveSnapshot } from "./types";
import { AlertToast } from "@/components/nwis/AlertToast";

const POLL_MS = 3000;

interface LiveContextValue {
  snap: LiveSnapshot | null;
  loading: boolean;
  error: string | null;
  offline: boolean;
  radiusKm: number;
  setRadiusKm: (km: number) => void;
  focusWellId: string;
  setFocusWellId: (id: string) => void;
  fieldMode: boolean;
  setFieldMode: (v: boolean) => void;
  demoOpen: boolean;
  setDemoOpen: (v: boolean) => void;
  control: (body: LiveControls) => Promise<void>;
  alerts: LiveAlert[];
  lastUpdate: Date | null;
}

const LiveContext = createContext<LiveContextValue | null>(null);

export function LiveProvider({ children }: { children: ReactNode }) {
  const [snap, setSnap] = useState<LiveSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [radiusKm, setRadiusKmState] = useState(DEFAULT_RADIUS_KM);
  const [focusWellId, setFocusWellId] = useState(ACTIVE_WELL_ID);
  const [fieldMode, setFieldModeState] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const offline = useOffline();
  const prevAlertIds = useRef<Set<string> | null>(null);
  const inflight = useRef(false);

  const ingest = useCallback((s: LiveSnapshot) => {
    setSnap(s);
    setLastUpdate(new Date());
    setError(null);
    const ids = new Set(s.alerts.map((a) => a.id));
    if (prevAlertIds.current) {
      for (const a of s.alerts) {
        if (!prevAlertIds.current.has(a.id)) {
          toast.custom((t) => <AlertToast alert={a} onDismiss={() => toast.dismiss(t)} />, { duration: 9000, id: a.id });
        }
      }
    }
    prevAlertIds.current = ids;
  }, []);

  const poll = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      ingest(await getLive());
    } catch (e) {
      setError(e instanceof Error ? e.message : "live feed unavailable");
    } finally {
      inflight.current = false;
      setLoading(false);
    }
  }, [ingest]);

  useEffect(() => {
    void poll();
    const id = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(id);
  }, [poll]);

  const control = useCallback(
    async (body: LiveControls) => {
      try {
        ingest(await liveControl(body));
      } catch (e) {
        setError(e instanceof Error ? e.message : "control failed");
      }
    },
    [ingest],
  );

  const setRadiusKm = useCallback(
    (km: number) => {
      setRadiusKmState(km);
      void control({ radius_km: km });
    },
    [control],
  );

  // field mode: persist + expose as a root attribute for CSS
  useEffect(() => {
    try {
      const v = localStorage.getItem("nwis-field-mode");
      if (v === "1") setFieldModeState(true);
    } catch {
      /* ignore */
    }
  }, []);
  const setFieldMode = useCallback((v: boolean) => {
    setFieldModeState(v);
    try {
      localStorage.setItem("nwis-field-mode", v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    document.documentElement.setAttribute("data-field-mode", fieldMode ? "true" : "false");
  }, [fieldMode]);

  // Ctrl+Shift+D → demo panel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "D" || e.key === "d")) {
        e.preventDefault();
        setDemoOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo<LiveContextValue>(
    () => ({ snap, loading, error, offline, radiusKm, setRadiusKm, focusWellId, setFocusWellId, fieldMode, setFieldMode, demoOpen, setDemoOpen, control, alerts: snap?.alerts ?? [], lastUpdate }),
    [snap, loading, error, offline, radiusKm, setRadiusKm, focusWellId, fieldMode, setFieldMode, demoOpen, control, lastUpdate],
  );
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLive(): LiveContextValue {
  const ctx = useContext(LiveContext);
  if (!ctx) throw new Error("useLive must be used inside <LiveProvider>");
  return ctx;
}
