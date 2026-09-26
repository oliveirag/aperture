// Captures the demo drag-in asset and the Devpost screenshots against a running server.
// Run: npm run build && npm run start, then
//   npx -y -p playwright node scripts/capture.mjs [asset|devpost|all] [baseUrl]
// First run may need: npx -y playwright install chromium
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

// ESM ignores NODE_PATH, so find the playwright that `npx -p playwright` put on PATH.
async function loadPlaywright() {
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!dir.endsWith(path.join("node_modules", ".bin"))) continue;
    try {
      const resolved = createRequire(path.join(dir, "..", "_.js")).resolve("playwright");
      return await import(pathToFileURL(resolved).href);
    } catch {}
  }
  return import("playwright");
}

const playwright = await loadPlaywright();
const { chromium } = playwright.chromium ? playwright : playwright.default;

const mode = process.argv[2] ?? "all";
const base = process.argv[3] ?? "http://localhost:3000";
const SHOTS = "docs/screenshots";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function captureAsset(browser) {
  await mkdir("public/demo", { recursive: true });
  // 3x so the PNG reads like a real phone screenshot when dropped into /import.
  const page = await browser.newPage({ viewport: { width: 600, height: 900 }, deviceScaleFactor: 3 });
  await page.goto(`${base}/demo-assets/brokerage`, { waitUntil: "networkidle" });
  await page.locator("#capture").screenshot({ path: "public/demo/brokerage-positions.png" });
  await page.close();
  console.log("saved public/demo/brokerage-positions.png");
}

async function captureDevpost(browser) {
  await mkdir(SHOTS, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const shot = async (name) => {
    await page.screenshot({ path: `${SHOTS}/${name}` });
    console.log(`saved ${SHOTS}/${name}`);
  };

  // 01 Landing
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  await wait(2200);
  await shot("01-landing.png");

  // 02 Import, sample read and extracted
  await page.goto(`${base}/import`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Use sample screenshot" }).click();
  await page.getByRole("button", { name: "Look through my portfolio" }).waitFor();
  await wait(2400);
  await shot("02-import-extracted.png");

  // 03 X-Ray with the NVIDIA tooltip open
  await page.getByRole("button", { name: "Look through my portfolio" }).click();
  await page.waitForURL("**/xray");
  await wait(2000);
  await page.getByText("NVIDIA", { exact: true }).first().hover();
  await wait(600);
  await shot("03-xray-nvidia.png");

  // 04 Shock: CRE run, BXP path selected, evidence drawer open
  await page.goto(`${base}/shock?scenario=cre`, { waitUntil: "networkidle" });
  await wait(2600);
  await page.getByRole("button", { name: /^BXP/ }).first().click();
  await wait(400);
  await page.getByRole("button", { name: "Evidence" }).last().click();
  await wait(700);
  await shot("04-shock-cre-bxp.png");

  // 05 Radar: NVDA card, Compare wording open
  await page.goto(`${base}/radar`, { waitUntil: "networkidle" });
  await wait(1500);
  const nvda = page
    .locator("article, section, li")
    .filter({ hasText: "NVDA" })
    .filter({ has: page.getByRole("button", { name: "Compare wording" }) })
    .last();
  await nvda.getByRole("button", { name: "Compare wording" }).first().click();
  await wait(700);
  await shot("05-radar-nvda-compare.png");

  // 06 IC Room memo
  await page.goto(`${base}/ic?run=1`, { waitUntil: "networkidle" });
  await wait(800);
  await page.getByRole("button", { name: "Skip to memo" }).click();
  await wait(1200);
  await page.locator("[aria-label='Investment committee memo']").first().scrollIntoViewIfNeeded();
  await wait(500);
  await shot("06-ic-memo.png");

  await context.close();
}

const browser = await chromium.launch();
try {
  if (mode === "asset" || mode === "all") await captureAsset(browser);
  if (mode === "devpost" || mode === "all") await captureDevpost(browser);
} finally {
  await browser.close();
}
