"use client";
import { useEffect, useState, type ReactNode } from "react";

import { useLive } from "@/lib/live-context";

import { DemoPanel } from "./DemoPanel";
import { PageTransition } from "./PageTransition";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

const KEY = "nwis-sidebar-collapsed";

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const { fieldMode } = useLive();
  useEffect(() => {
    if (fieldMode) setCollapsed(true); // rig-floor tablets: maximise the simplified view
  }, [fieldMode]);

  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY);
      if (v === "1") setCollapsed(true);
      else if (v === null && window.innerWidth < 1100) setCollapsed(true);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(KEY, c ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !c;
    });
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-bg text-text">
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="relative min-h-0 flex-1 overflow-y-auto">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
      <DemoPanel />
    </div>
  );
}
