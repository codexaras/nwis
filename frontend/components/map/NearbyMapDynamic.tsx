"use client";
import dynamic from "next/dynamic";

import { Skeleton } from "@/components/nwis/Skeletons";

/** Leaflet touches `window` — load client-only. */
export const NearbyMap = dynamic(() => import("./NearbyMap"), {
  ssr: false,
  loading: () => (
    <div className="relative h-full w-full overflow-hidden bg-bg">
      <div className="plot-grid absolute inset-0 opacity-60" />
      <Skeleton className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-40" />
      <div className="hud-label absolute bottom-3 left-3">Loading basemap · CARTO dark</div>
    </div>
  ),
});
