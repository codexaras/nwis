import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

/**
 * eRTMAC-NWIS design tokens.
 * Surfaces, accents and severities are literal hex so Tailwind alpha modifiers work (bg-surface-3/80, border-amber/40).
 * Text / muted / border read CSS variables so FIELD MODE can raise contrast at runtime (see app/globals.css).
 */
const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx,mdx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0B0F14",
        surface: {
          DEFAULT: "#121821",
          2: "#18202B",
          3: "#1E2836",
        },
        border: "var(--nwis-border)",
        "border-strong": "#2F3D52",
        text: "var(--nwis-text)",
        muted: "var(--nwis-muted)",
        dim: "#5C6878",
        amber: {
          DEFAULT: "#F59E0B",
          soft: "var(--nwis-amber-soft)",
        },
        teal: {
          DEFAULT: "#14B8A6",
          soft: "var(--nwis-teal-soft)",
        },
        sev: {
          low: "#22C55E",
          medium: "#EAB308",
          high: "#F97316",
          critical: "#EF4444",
        },
        // shadcn/ui compatibility aliases (restyled to NWIS tokens)
        background: "#0B0F14",
        foreground: "var(--nwis-text)",
        card: { DEFAULT: "#121821", foreground: "var(--nwis-text)" },
        popover: { DEFAULT: "#18202B", foreground: "var(--nwis-text)" },
        primary: { DEFAULT: "#F59E0B", foreground: "#0B0F14" },
        secondary: { DEFAULT: "#18202B", foreground: "var(--nwis-text)" },
        accent: { DEFAULT: "#1E2836", foreground: "var(--nwis-text)" },
        destructive: { DEFAULT: "#EF4444", foreground: "#FFFFFF" },
        input: "var(--nwis-border)",
        ring: "#F59E0B",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        label: ["11px", { lineHeight: "14px", letterSpacing: "0.08em" }],
        body: ["13px", { lineHeight: "18px" }],
        title: ["15px", { lineHeight: "20px" }],
        "hero-sm": ["24px", { lineHeight: "28px" }],
        "hero-md": ["32px", { lineHeight: "36px" }],
        "hero-lg": ["48px", { lineHeight: "52px" }],
      },
      borderRadius: {
        card: "14px",
        lg: "12px",
        md: "10px",
        sm: "8px",
      },
      boxShadow: {
        card: "0 1px 0 0 rgba(255,255,255,0.02) inset, 0 8px 24px -12px rgba(0,0,0,0.6)",
        glow: "0 0 0 1px rgba(245,158,11,0.25), 0 0 24px -6px rgba(245,158,11,0.45)",
      },
      spacing: {
        grid: "8px",
      },
      keyframes: {
        "radar-ping": {
          "0%": { transform: "scale(0.6)", opacity: "0.55" },
          "100%": { transform: "scale(2.6)", opacity: "0" },
        },
        "status-blink": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "radar-ping": "radar-ping 2.4s cubic-bezier(0, 0, 0.2, 1) infinite",
        "status-blink": "status-blink 1.6s ease-in-out infinite",
        "fade-up": "fade-up 220ms ease-out both",
      },
    },
  },
  plugins: [animate],
};
export default config;
