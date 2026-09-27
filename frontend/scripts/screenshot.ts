/**
 * Visual QA capture: every route at 1440×900 and 1920×1080 → /screenshots (repo root).
 *   npm run screenshot                                   all routes, both sizes (+ boot sequence)
 *   SCREENSHOT_SIZES=1440x900 npm run screenshot         one size
 *   SCREENSHOT_ROUTES=dashboard,risk npm run screenshot  subset by name
 *   SCREENSHOT_PREFIX=offline- npm run screenshot        prefix file names (e.g. backend stopped)
 * Some entries run a scripted interaction first (sample-DDR flow, a chat prompt, datum flattening, field mode).
 * Prints a console-error report per capture.
 */
import { chromium, type Page } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.SCREENSHOT_BASE ?? "http://localhost:3000";
const OUT = resolve(process.cwd(), "..", "screenshots");
const SIZES = (process.env.SCREENSHOT_SIZES ?? "1440x900,1920x1080").split(",").map((s) => s.split("x").map(Number) as [number, number]);
const SETTLE_MS = Number(process.env.SCREENSHOT_SETTLE_MS ?? 3500);
const ONLY = (process.env.SCREENSHOT_ROUTES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const PREFIX = process.env.SCREENSHOT_PREFIX ?? "";

interface RouteSpec {
  path: string;
  name?: string;
  /** runs in the page before navigation (e.g. seed localStorage) */
  init?: () => void;
  /** scripted interaction after load */
  act?: (page: Page) => Promise<void>;
}

const ROUTES: RouteSpec[] = [
  { path: "/dashboard" },
  { path: "/dashboard", name: "dashboard_field", init: () => localStorage.setItem("nwis-field-mode", "1") },
  { path: "/map" },
  { path: "/map?well=DLJ-12" },
  { path: "/wells/DLJ-ACT-01" },
  { path: "/wells/DLJ-12" },
  { path: "/correlation" },
  {
    path: "/correlation?wells=DLJ-12,DLJ-07,DLJ-21",
    name: "correlation_datum",
    act: async (page) => {
      await page.getByLabel("Datum").click();
      await page.getByText("Flatten on Barail").click();
      await page.waitForTimeout(700);
    },
  },
  { path: "/risk" },
  { path: "/knowledge" },
  { path: "/knowledge?q=stuck%20pipe%20barail", name: "knowledge_search" },
  { path: "/ingest" },
  {
    path: "/ingest",
    name: "ingest_flow",
    act: async (page) => {
      await page.getByTestId("try-sample-ddr").click();
      await page.getByTestId("review-table").waitFor({ timeout: 30_000 });
      await page.waitForTimeout(800);
    },
  },
  {
    path: "/ingest",
    name: "ingest_scanned_saved",
    act: async (page) => {
      await page.getByTestId("try-scanned").click();
      await page.getByTestId("confirm-save").waitFor({ timeout: 30_000 });
      await page.getByTestId("confirm-save").click();
      await page.getByText("Saved to the knowledge base").waitFor({ timeout: 30_000 });
      await page.waitForTimeout(900);
    },
  },
  { path: "/assistant" },
  {
    path: "/assistant",
    name: "assistant_answer",
    act: async (page) => {
      await page.getByTestId("suggested-prompt").click();
      await page.getByTestId("answer").waitFor({ timeout: 30_000 });
      await page.waitForTimeout(4500);
    },
  },
];

function slug(route: string) {
  return route.replace(/^\//, "").replace(/[^A-Za-z0-9-]+/g, "_").replace(/_+$/, "") || "home";
}

async function capture(page: Page, spec: RouteSpec, file: string) {
  const errors: string[] = [];
  const onConsole = (m: { type: () => string; text: () => string }) => {
    if (m.type() === "error") errors.push(m.text());
  };
  page.on("console", onConsole);
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}${spec.path}`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(SETTLE_MS);
  if (spec.act) {
    try {
      await spec.act(page);
    } catch (e) {
      errors.push(`interaction failed: ${String(e).split("\n")[0]}`);
    }
  }
  await page.screenshot({ path: file, fullPage: false });
  page.off("console", onConsole);
  return errors;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const report: string[] = [];
  try {
    for (const [w, h] of SIZES) {
      for (const spec of ROUTES) {
        const name = spec.name ?? slug(spec.path);
        if (ONLY.length && !ONLY.includes(name)) continue;
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, colorScheme: "dark" });
        await ctx.addInitScript(() => sessionStorage.setItem("nwis-booted", "1"));
        if (spec.init) await ctx.addInitScript(spec.init);
        const page = await ctx.newPage();
        const file = resolve(OUT, `${PREFIX}${name}-${w}x${h}.png`);
        const errors = await capture(page, spec, file);
        report.push(`${PREFIX}${name} @ ${w}x${h}: ${errors.length ? `${errors.length} console error(s): ${errors.slice(0, 3).join(" | ")}` : "clean"}`);
        console.log(`captured ${file}`);
        await ctx.close();
      }
    }
    // boot sequence (first visit in a fresh session)
    if (!ONLY.length || ONLY.includes("boot")) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
      const page = await ctx.newPage();
      await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(700);
      await page.screenshot({ path: resolve(OUT, `${PREFIX}boot-1440x900.png`) });
      console.log("captured boot sequence");
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  console.log("\nconsole report:\n" + report.map((r) => "  " + r).join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
