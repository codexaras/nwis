"use client";
import type { ReactNode } from "react";
import { Toaster } from "sonner";

import { TooltipProvider } from "@/components/ui/tooltip";
import { LiveProvider } from "@/lib/live-context";

import { BootSequence } from "./BootSequence";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider delayDuration={250}>
      <LiveProvider>
        {children}
        <BootSequence />
        <Toaster position="bottom-right" expand={false} visibleToasts={4} gap={8} offset={16} toastOptions={{ unstyled: true, classNames: { toast: "!bg-transparent !border-0 !shadow-none !p-0 !w-auto" } }} />
      </LiveProvider>
    </TooltipProvider>
  );
}
