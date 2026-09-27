"use client";
/**
 * Nearby Wells geospatial map. CARTO dark basemap, amber active well with radar pulse, translucent
 * radius ring, custom divIcon markers with severity halos, tooltip cards, distance lines. No default Leaflet pins
 * or control chrome anywhere. Must be loaded with next/dynamic + ssr:false (see NearbyMapDynamic).
 */
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Crosshair, Minus, Plus } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Fragment } from "react";
import { Circle, MapContainer, Marker, Polyline, TileLayer, Tooltip as LeafletTooltip, useMap, useMapEvents } from "react-leaflet";

import { fmtDepth, fmtKm } from "@/lib/format";
import { severityColor, type Severity } from "@/lib/tokens";
import type { WellSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface NearbyMapProps {
  center: { lat: number; lon: number; id: string };
  wells: WellSummary[];
  radiusKm: number;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** wells matching the active filter (null = no filter) */
  highlightIds?: Set<string> | null;
  /** per-well matched event counts when filtered */
  matchCounts?: Record<string, number>;
  compact?: boolean;
  showDistanceLines?: boolean;
  className?: string;
}

/**
 * Basemap: Esri World Dark Gray canvas + reference labels — keyless. (CARTO's dark_all now watermarks tiles with
 * "API KEY REQUIRED", so it is no longer usable without a key.) The tile pane is darkened further in globals.css.
 */
const TILES_BASE = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}";
const TILES_LABELS = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}";

function activeIcon(id: string, compact: boolean) {
  return L.divIcon({
    className: "nwis-divicon",
    html: `<div class="nwis-active${compact ? " compact" : ""}"><span class="ring r1"></span><span class="ring r2"></span><span class="ring r3"></span><span class="core"></span><span class="lbl">${id}<em>DRILLING</em></span></div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function wellIcon(w: WellSummary, opts: { dim: boolean; selected: boolean; count: number; compact: boolean }) {
  const tone = w.max_severity ? severityColor[w.max_severity as Severity] : "#5C6878";
  const size = Math.round((opts.compact ? 8 : 10) + Math.min(10, opts.count) * 0.8);
  return L.divIcon({
    className: "nwis-divicon",
    html: `<div class="nwis-marker${opts.dim ? " dim" : ""}${opts.selected ? " selected" : ""}" style="--halo:${tone};--size:${size}px"><span class="halo"></span><span class="core"></span>${opts.compact ? "" : `<span class="lbl">${w.id}</span>`}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function labelIcon(text: string, cls = "") {
  return L.divIcon({ className: "nwis-divicon", html: `<div class="nwis-ring-label ${cls}">${text}</div>`, iconSize: [0, 0], iconAnchor: [0, 0] });
}

function FitToRadius({ center, radiusKm }: { center: { lat: number; lon: number }; radiusKm: number }) {
  const map = useMap();
  useEffect(() => {
    const b = L.latLng(center.lat, center.lon).toBounds(radiusKm * 2 * 1000);
    map.fitBounds(b, { padding: [36, 36], animate: true, duration: 0.6 });
  }, [map, center.lat, center.lon, radiusKm]);
  return null;
}

function MapClickReset({ onSelect }: { onSelect?: (id: string | null) => void }) {
  useMapEvents({ click: () => onSelect?.(null) });
  return null;
}

function ZoomControls({ center }: { center: { lat: number; lon: number } }) {
  const map = useMap();
  const btn = "flex h-8 w-8 items-center justify-center text-muted transition-colors hover:bg-surface-3 hover:text-text";
  return (
    <div className="leaflet-bottom leaflet-left">
      <div className="leaflet-control m-3 overflow-hidden rounded-md border border-border-strong bg-surface/90 shadow-card backdrop-blur">
        <button className={btn} onClick={() => map.zoomIn()} aria-label="Zoom in" type="button">
          <Plus className="h-4 w-4" />
        </button>
        <button className={cn(btn, "border-t border-border")} onClick={() => map.zoomOut()} aria-label="Zoom out" type="button">
          <Minus className="h-4 w-4" />
        </button>
        <button className={cn(btn, "border-t border-border")} onClick={() => map.flyTo([center.lat, center.lon], 12, { duration: 0.6 })} aria-label="Recenter on active well" type="button">
          <Crosshair className="h-4 w-4 text-amber" />
        </button>
      </div>
    </div>
  );
}

export default function NearbyMap({ center, wells, radiusKm, selectedId, onSelect, highlightIds, matchCounts, compact = false, showDistanceLines = true, className }: NearbyMapProps) {
  const offsets = useMemo(() => wells.filter((w) => w.id !== center.id), [wells, center.id]);
  // distance lines only where they inform: the nearest offset, plus the selected well
  const distanceTargets = useMemo(() => {
    const nearest = offsets.filter((w) => w.distance_km <= radiusKm).sort((a, b) => a.distance_km - b.distance_km)[0];
    const sel = selectedId && selectedId !== center.id ? offsets.find((w) => w.id === selectedId) : undefined;
    return [nearest, sel].filter((w, i, arr): w is WellSummary => !!w && arr.findIndex((x) => x?.id === w.id) === i);
  }, [offsets, radiusKm, selectedId, center.id]);
  const ringLabelLat = center.lat + radiusKm / 111.32;

  return (
    <MapContainer
      center={[center.lat, center.lon]}
      zoom={11}
      zoomControl={false}
      attributionControl={false}
      scrollWheelZoom={!compact}
      dragging={!compact}
      doubleClickZoom={!compact}
      touchZoom={!compact}
      keyboard={!compact}
      className={cn("h-full w-full", compact && "pointer-events-auto", className)}
      style={{ background: "#0B0F14" }}
    >
      <TileLayer url={TILES_BASE} maxZoom={16} maxNativeZoom={16} />
      <TileLayer url={TILES_LABELS} maxZoom={16} maxNativeZoom={16} opacity={0.7} />
      <FitToRadius center={center} radiusKm={radiusKm} />
      <MapClickReset onSelect={onSelect} />

      {/* radius ring */}
      <Circle center={[center.lat, center.lon]} radius={radiusKm * 1000} pathOptions={{ color: "#F59E0B", weight: 1.2, opacity: 0.55, fillColor: "#F59E0B", fillOpacity: 0.045, dashArray: "6 6" }} interactive={false} />
      <Circle center={[center.lat, center.lon]} radius={(radiusKm * 1000) / 2} pathOptions={{ color: "#F59E0B", weight: 0.8, opacity: 0.2, fill: false, dashArray: "2 6" }} interactive={false} />
      <Marker position={[ringLabelLat, center.lon]} icon={labelIcon(`OFFSET WINDOW ${radiusKm} KM`)} interactive={false} />

      {/* distance lines to nearest offsets */}
      {showDistanceLines &&
        !compact &&
        distanceTargets.map((w) => (
          <Fragment key={w.id}>
            <Polyline positions={[[center.lat, center.lon], [w.lat, w.lon]]} pathOptions={{ color: "#F59E0B", weight: 1, opacity: w.id === selectedId ? 0.7 : 0.35, dashArray: "3 6" }} interactive={false} />
            {/* label at 72% along the line — clear of the active-well label cluster */}
            <Marker position={[center.lat + (w.lat - center.lat) * 0.72, center.lon + (w.lon - center.lon) * 0.72]} icon={labelIcon(`${fmtKm(w.distance_km)} ${w.bearing ?? ""}`, "dist")} interactive={false} />
          </Fragment>
        ))}

      {/* offset wells */}
      {offsets.map((w) => {
        const outside = w.distance_km > radiusKm;
        const filteredOut = highlightIds ? !highlightIds.has(w.id) : false;
        const count = matchCounts?.[w.id] ?? w.event_count;
        return (
          <Marker
            key={w.id}
            position={[w.lat, w.lon]}
            icon={wellIcon(w, { dim: outside || filteredOut, selected: selectedId === w.id, count, compact })}
            zIndexOffset={selectedId === w.id ? 900 : outside ? 0 : 300}
            eventHandlers={{ click: () => onSelect?.(w.id) }}
          >
            <LeafletTooltip className="nwis-tip" direction="top" offset={[0, -10]} opacity={1}>
              <div className="w-56">
                <div className="flex items-center justify-between">
                  <span className="num text-[13px] font-semibold text-text">{w.id}</span>
                  <span className="num text-[11px] text-muted">
                    {fmtKm(w.distance_km)} {w.bearing}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] uppercase tracking-[0.08em] text-muted">
                  {w.field} · {w.status} · TD {fmtDepth(w.total_depth_m, 0)}
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px]">
                  <span className="text-text">{w.event_count} incidents · {Math.round(w.npt_hours)} h NPT</span>
                  {w.max_severity && (
                    <span className="num uppercase tracking-[0.08em]" style={{ color: severityColor[w.max_severity as Severity] }}>
                      ● {w.max_severity}
                    </span>
                  )}
                </div>
                {matchCounts && matchCounts[w.id] !== undefined && <div className="mt-1 text-[11px] text-amber">{matchCounts[w.id]} matching filter</div>}
                {outside && <div className="mt-1 text-[10px] uppercase tracking-[0.08em] text-dim">Beyond offset window</div>}
              </div>
            </LeafletTooltip>
          </Marker>
        );
      })}

      {/* active well on top */}
      <Marker position={[center.lat, center.lon]} icon={activeIcon(center.id, compact)} zIndexOffset={1000} eventHandlers={{ click: () => onSelect?.(center.id) }} />

      {!compact && <ZoomControls center={center} />}
      <div className="leaflet-bottom leaflet-right">
        <div className="leaflet-control mb-1 mr-2 text-[9px] uppercase tracking-[0.06em] text-dim">Basemap © Esri · synthetic well positions</div>
      </div>
    </MapContainer>
  );
}
