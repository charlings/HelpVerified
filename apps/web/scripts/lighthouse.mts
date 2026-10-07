/**
 * Lighthouse (mobile) on Home and Services against a production server, using Playwright's Chromium.
 * Usage: pnpm --filter web build && pnpm --filter web lighthouse  (expects `pnpm start --port 3200` or starts it)
 */
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";
import { chromium } from "@playwright/test";

const root = resolve(import.meta.dirname, "..");
const outDir = resolve(root, "lighthouse");
const PORT = 3200;
const base = `http://localhost:${PORT}`;
const pages = { home: "/", services: "/services" };
const thresholds = { performance: 90, accessibility: 100, seo: 100 } as const;

async function waitForServer(url: string, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server at ${url} did not start`);
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const server = spawn("pnpm", ["start", "--port", String(PORT)], { cwd: root, shell: true, stdio: "ignore" });
  const chrome = await chromeLauncher.launch({
    chromePath: chromium.executablePath(),
    chromeFlags: ["--headless=new", "--no-sandbox"],
  });

  const failures: string[] = [];
  try {
    await waitForServer(base);
    for (const [name, path] of Object.entries(pages)) {
      const result = await lighthouse(`${base}${path}`, {
        port: chrome.port,
        output: "html",
        onlyCategories: Object.keys(thresholds),
        logLevel: "error",
      });
      if (!result) throw new Error(`No Lighthouse result for ${path}`);
      await writeFile(resolve(outDir, `${name}.html`), result.report as string);
      const line: string[] = [];
      for (const [category, min] of Object.entries(thresholds)) {
        const score = Math.round((result.lhr.categories[category]?.score ?? 0) * 100);
        line.push(`${category} ${score}`);
        if (score < min) failures.push(`${path} ${category} ${score} < ${min}`);
      }
      console.log(`${path.padEnd(10)} ${line.join(" · ")}`);
    }
  } finally {
    chrome.kill();
    // With shell: true the server is a child of the shell; kill the whole tree so `next start` doesn't linger.
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    else server.kill();
  }

  if (failures.length > 0) {
    console.error(`Below threshold:\n  ${failures.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`All pages meet the thresholds. Reports in ${outDir}`);
}

await main();
