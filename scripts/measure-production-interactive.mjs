import { chromium } from "@playwright/test";

const baseUrl = "https://orderflow-suite.vercel.app";
const routes = [
  ["Overzicht", "/"],
  ["Inbox", "/inbox"],
  ["Orders", "/orders"],
  ["Planning", "/planning"],
  ["Dispatch", "/dispatch"],
  ["Uitzonderingen", "/exceptions"],
  ["Autonomie", "/autonomie"],
  ["Facturatie", "/facturatie"],
  ["Rapportage", "/rapportage"],
  ["Klanten", "/klanten"],
  ["Chauffeurs", "/chauffeurs"],
  ["Vloot", "/vloot"],
  ["Users", "/users"],
  ["Settings", "/settings"],
];

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
}

function fmt(ms) {
  return `${Math.round(ms)}ms`;
}

async function waitVisible(page) {
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await page.locator("#root").waitFor({ state: "attached", timeout: 15_000 }).catch(() => {});
  await page.locator("main, [role='main'], .page-container, form").waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
}

async function waitForManualLogin(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  console.log("Login in het zichtbare browservenster. De meting start automatisch zodra /login verlaten is.");

  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(1000);
    const url = page.url();
    if (url.startsWith(baseUrl) && !new URL(url).pathname.startsWith("/login")) {
      await waitVisible(page);
      return;
    }
  }

  throw new Error("Geen login gedetecteerd binnen 5 minuten.");
}

async function measureRoute(page, label, route) {
  const visibleTimes = [];
  const idleTimes = [];
  const requestCounts = [];
  const finalUrls = [];
  const failed = [];

  for (let run = 0; run < 3; run += 1) {
    const requests = [];
    const onResponse = (response) => requests.push(response.url());
    const onRequestFailed = (request) => {
      failed.push(`${request.resourceType()} ${request.failure()?.errorText ?? "unknown"} ${request.url()}`);
    };

    page.on("response", onResponse);
    page.on("requestfailed", onRequestFailed);

    const startedAt = performance.now();
    await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
    await waitVisible(page);
    visibleTimes.push(performance.now() - startedAt);
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    idleTimes.push(performance.now() - startedAt);

    page.off("response", onResponse);
    page.off("requestfailed", onRequestFailed);
    requestCounts.push(requests.length);
    finalUrls.push(page.url());
  }

  const uniqueFinalUrls = [...new Set(finalUrls)];
  return {
    label,
    route,
    visibleP50: percentile(visibleTimes, 50),
    visibleMax: Math.max(...visibleTimes),
    idleP50: percentile(idleTimes, 50),
    idleMax: Math.max(...idleTimes),
    requestsP50: percentile(requestCounts, 50),
    requestsMax: Math.max(...requestCounts),
    finalUrl: uniqueFinalUrls.length === 1 ? uniqueFinalUrls[0] : uniqueFinalUrls.join(", "),
    failed: failed.slice(0, 8),
  };
}

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

await waitForManualLogin(page);

const results = [];
for (const [label, route] of routes) {
  const result = await measureRoute(page, label, route);
  results.push(result);
  console.log(`${label.padEnd(15)} ${route.padEnd(13)} zichtbaar p50 ${fmt(result.visibleP50).padStart(6)} max ${fmt(result.visibleMax).padStart(6)} | rustig p50 ${fmt(result.idleP50).padStart(6)} max ${fmt(result.idleMax).padStart(6)} | requests p50 ${String(result.requestsP50).padStart(3)} max ${String(result.requestsMax).padStart(3)} | final ${result.finalUrl}`);
}

await browser.close();

const redirects = results.filter((result) => result.finalUrl !== `${baseUrl}${result.route}`);
if (redirects.length) {
  console.log("\nRedirects:");
  for (const result of redirects) {
    console.log(`${result.label} ${result.route} -> ${result.finalUrl}`);
  }
}
