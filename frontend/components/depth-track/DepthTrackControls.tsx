"use client";
import { Maximize2, Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

import { useDepthHover } from "./context";

/** Zoom / fit buttons for the depth track — placed in a card header, reads the shared context. */
export function DepthTrackControls() {
  const { pxPerM, zoomIn, zoomOut, fit } = useDepthHover();
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border bg-surface-2 p-0.5">
      <Button variant="ghost" size="iconSm" onClick={zoomOut} aria-label="Zoom out" title="Zoom out">
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <span className="num w-24 whitespace-nowrap text-center text-[10px] text-muted">{pxPerM === null ? "FIT" : `${Math.round(pxPerM * 100)} px/100 m`}</span>
      <Button variant="ghost" size="iconSm" onClick={zoomIn} aria-label="Zoom in" title="Zoom in">
        <Plus className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="iconSm" onClick={fit} aria-label="Fit whole well" title="Fit whole well" className={pxPerM === null ? "text-amber" : undefined}>
        <Maximize2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
