"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Drill } from "lucide-react";
import { useEffect, useState } from "react";

const STEPS = ["NWIS-RT · INITIALIZING", "OFFSET INDEX LOADED", "RISK ENGINE READY"];
const STEP_MS = [0, 500, 1000];
const TOTAL_MS = 1500;
const KEY = "nwis-booted";

/** 1.5 s skippable boot overlay, shown once per browser session (first impression). */
export function BootSequence() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    let booted = false;
    try {
      booted = sessionStorage.getItem(KEY) === "1";
    } catch {
      booted = false;
    }
    if (booted) return;
    setVisible(true);
    const timers = STEP_MS.map((ms, i) => setTimeout(() => setStep(i + 1), ms + 60));
    const done = setTimeout(finish, TOTAL_MS);
    const skip = () => finish();
    window.addEventListener("keydown", skip);
    window.addEventListener("pointerdown", skip);
    function finish() {
      try {
        sessionStorage.setItem(KEY, "1");
      } catch {
        /* ignore */
      }
      setVisible(false);
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
    }
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(done);
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
    };
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="boot"
          className="hero-illumination fixed inset-0 z-[100] flex select-none items-center justify-center bg-bg"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.35, ease: "easeOut" } }}
          role="status"
          aria-live="polite"
        >
          <div className="plot-grid pointer-events-none absolute inset-0 opacity-60" />
          <div className="relative w-[520px] max-w-[92vw]">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-amber-soft text-amber ring-1 ring-amber/40">
                <Drill className="h-5 w-5" />
              </span>
              <div>
                <div className="text-[18px] font-semibold tracking-wide text-text">eRTMAC · NWIS</div>
                <div className="hud-label">Nearby Wells Intelligence System</div>
              </div>
            </div>
            <ul className="mt-8 space-y-2.5">
              {STEPS.map((s, i) => {
                // `step` = number of steps started; a step is done once the next one has started
                const done = step > i + 1;
                const active = step === i + 1;
                return (
                  <li key={s} className={`num flex items-center gap-3 text-[12px] uppercase tracking-[0.1em] transition-colors ${done ? "text-text" : active ? "text-amber" : "text-dim"}`}>
                    <span className={`flex h-4 w-4 items-center justify-center rounded-sm border ${done ? "border-teal/50 bg-teal-soft text-teal" : active ? "border-amber/60" : "border-border"}`}>
                      {done ? <Check className="h-3 w-3" /> : active ? <span className="h-1.5 w-1.5 rounded-full bg-amber animate-status-blink" /> : null}
                    </span>
                    {s}
                  </li>
                );
              })}
            </ul>
            <div className="mt-6 h-[3px] w-full overflow-hidden rounded-full bg-surface-3">
              <motion.div className="h-full bg-amber shadow-[0_0_10px_rgba(245,158,11,0.7)]" initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ duration: TOTAL_MS / 1000, ease: "linear" }} />
            </div>
            <div className="mt-3 flex items-center justify-between gap-6 whitespace-nowrap">
              <span className="hud-label">Synthetic demonstration data · live feed simulated</span>
              <span className="hud-label text-dim">press any key to skip</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
