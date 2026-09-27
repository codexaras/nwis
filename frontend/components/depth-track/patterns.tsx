/** SVG lithology patterns: sand dots · clay/shale dashes · coal solid dark · limestone brick · basement crosses. */
import { colors } from "@/lib/tokens";

const INK = colors.text;

export const LITHOLOGY_PATTERN: Record<string, string> = {
  sand: "lith-sand",
  clay: "lith-clay",
  shale: "lith-shale",
  coal: "lith-coal",
  limestone: "lith-limestone",
  basement: "lith-basement",
};

export function LithologyDefs() {
  return (
    <defs>
      <pattern id="lith-sand" width="8" height="8" patternUnits="userSpaceOnUse">
        <rect width="8" height="8" fill="#B59A5B" opacity="0.28" />
        <circle cx="2" cy="2" r="0.9" fill={INK} opacity="0.55" />
        <circle cx="6" cy="6" r="0.9" fill={INK} opacity="0.55" />
      </pattern>
      <pattern id="lith-clay" width="10" height="6" patternUnits="userSpaceOnUse">
        <rect width="10" height="6" fill="#8E6E4E" opacity="0.3" />
        <line x1="0" y1="1.5" x2="4" y2="1.5" stroke={INK} strokeWidth="0.8" opacity="0.5" />
        <line x1="6" y1="4.5" x2="10" y2="4.5" stroke={INK} strokeWidth="0.8" opacity="0.5" />
      </pattern>
      <pattern id="lith-shale" width="8" height="5" patternUnits="userSpaceOnUse">
        <rect width="8" height="5" fill="#6B5B7A" opacity="0.3" />
        <line x1="0" y1="2.5" x2="8" y2="2.5" stroke={INK} strokeWidth="0.8" opacity="0.5" />
      </pattern>
      <pattern id="lith-coal" width="8" height="8" patternUnits="userSpaceOnUse">
        <rect width="8" height="8" fill="#20262E" />
        <line x1="0" y1="4" x2="8" y2="4" stroke="#4F5B63" strokeWidth="1" />
      </pattern>
      <pattern id="lith-limestone" width="12" height="8" patternUnits="userSpaceOnUse">
        <rect width="12" height="8" fill="#5F8A8B" opacity="0.28" />
        <path d="M0 0H12M0 4H12M6 0V4M0 4V8M12 4V8" stroke={INK} strokeWidth="0.7" opacity="0.5" fill="none" />
      </pattern>
      <pattern id="lith-basement" width="10" height="10" patternUnits="userSpaceOnUse">
        <rect width="10" height="10" fill="#3A3F47" opacity="0.6" />
        <path d="M2 5H8M5 2V8" stroke={INK} strokeWidth="0.8" opacity="0.45" />
      </pattern>
      <pattern id="hatch-cement" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" fill="#8B98A9" opacity="0.16" />
        <line x1="0" y1="0" x2="0" y2="6" stroke="#8B98A9" strokeWidth="1.2" opacity="0.7" />
      </pattern>
      <pattern id="hatch-overpressure" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
        <line x1="0" y1="0" x2="0" y2="7" stroke="#EF4444" strokeWidth="1.2" opacity="0.5" />
      </pattern>
    </defs>
  );
}
