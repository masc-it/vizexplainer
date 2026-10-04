import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export interface PreviewOptions {
  outDir: string;
  width: number;
  height: number;
  dark: boolean;
}

export interface Finding {
  /** Document path of the block, e.g. `blocks[2].children[0]`, or "page". */
  path: string;
  message: string;
}

export interface PreviewResult {
  screenshots: string[];
  findings: Finding[];
}

const SMALLEST_READABLE_TEXT = 9;

const CANDIDATE_BROWSERS = [
  process.env["VIZX_CHROME"],
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/microsoft-edge",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];

export async function findBrowser(): Promise<string | undefined> {
  for (const candidate of CANDIDATE_BROWSERS) {
    if (candidate && (await access(candidate).then(() => true, () => false))) return candidate;
  }
  return undefined;
}

/**
 * Opens a rendered page in a headless Chromium-based browser, screenshots it one viewport at a time
 * (so pinned visuals show their scrolled states) and checks for problems a reader would notice.
 */
export async function previewPage(htmlFile: string, options: PreviewOptions): Promise<PreviewResult> {
  const executablePath = await findBrowser();
  if (executablePath === undefined) {
    throw new Error("No Chrome, Chromium, Edge or Brave found. Install one, or set VIZX_CHROME to its executable.");
  }
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ executablePath });
  try {
    const page = await browser.newPage({ viewport: { width: options.width, height: options.height }, colorScheme: options.dark ? "dark" : "light" });
    const findings: Finding[] = [];
    page.on("pageerror", (error) => findings.push({ path: "page", message: `script error: ${error.message}` }));
    page.on("console", (message) => {
      if (message.type() === "error") findings.push({ path: "page", message: `console error: ${message.text()}` });
    });
    await page.goto(pathToFileURL(htmlFile).href);
    await page.addStyleTag({ content: "html { scroll-behavior: auto !important; }" });
    await page.waitForTimeout(200);
    findings.push(...(await page.evaluate(inspectPage, SMALLEST_READABLE_TEXT)));

    await mkdir(options.outDir, { recursive: true });
    const screenshots: string[] = [];
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    const step = Math.max(200, options.height - 120);
    for (let y = 0, n = 1; y < total; y += step, n++) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await page.waitForTimeout(350);
      const file = path.join(options.outDir, `${String(n).padStart(2, "0")}.png`);
      await page.screenshot({ path: file });
      screenshots.push(file);
    }
    return { screenshots, findings };
  } finally {
    await browser.close();
  }
}

/** Runs in the page. Kept self-contained because it is serialised into the browser. */
function inspectPage(smallest: number): Finding[] {
  const findings: Finding[] = [];
  const where = (element: Element) => element.closest("[data-path]")?.getAttribute("data-path") ?? "page";
  const viewport = document.documentElement.clientWidth;

  // scrollWidth also counts clipped content, so test whether the page really moves sideways.
  window.scrollTo(viewport, 0);
  const sideways = window.scrollX;
  window.scrollTo(0, 0);
  if (sideways > 0) {
    findings.push({ path: "page", message: `the page scrolls ${sideways}px sideways in a ${viewport}px window; something is too wide` });
  }
  for (const svg of document.querySelectorAll<SVGSVGElement>("svg[data-vx-fit]")) {
    // Diagrams in closed details or inactive tabs are not laid out, so there is nothing to measure.
    if (svg.getClientRects().length === 0) continue;
    const viewBox = svg.viewBox.baseVal;
    const scale = viewBox.width ? svg.getBoundingClientRect().width / viewBox.width : 1;
    const label = svg.querySelector(".vx-node-label, .vx-seq-label, .vx-state-label");
    const size = label ? parseFloat(getComputedStyle(label).fontSize) * scale : 0;
    if (label && size < smallest) {
      findings.push({ path: where(svg), message: `diagram text renders at ${size.toFixed(1)}px, below ${smallest}px; show fewer boxes or give it more width` });
    }
    const box = svg.parentElement!;
    if (box.scrollWidth > box.clientWidth + 2) {
      findings.push({ path: where(svg), message: `diagram needs ${box.scrollWidth}px but has ${box.clientWidth}px, so readers must scroll it sideways` });
    }
  }
  for (const block of document.querySelectorAll<HTMLElement>(".vx-b")) {
    if (block.getBoundingClientRect().height < 2 && !block.closest("[hidden], details:not([open]), template")) {
      findings.push({ path: block.dataset.path ?? "page", message: "renders as empty" });
    }
  }
  return findings;
}

/** Writes the page next to the screenshots so it can be inspected after the run. */
export async function writePreviewPage(html: string, outDir: string): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const file = path.join(outDir, "page.html");
  await writeFile(file, html);
  return file;
}
