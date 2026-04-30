import { chromium } from "@playwright/test";

const args = process.argv.slice(2);

function argValue(name, fallback) {
  const prefixed = `--${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefixed));
  if (inline) return inline.slice(prefixed.length);
  const index = args.indexOf(`--${name}`);
  if (index >= 0 && args[index + 1]) return args[index + 1];
  return fallback;
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

const baseUrl = argValue("url", "https://orderflow-suite.vercel.app").replace(/\/$/, "");
const routes = argValue("routes", "/login").split(",").map((route) => route.trim()).filter(Boolean);
const runs = Number(argValue("runs", "5"));
const waitMode = argValue("wait", "visible");
const shouldLogin = hasFlag("login");
const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;

if (shouldLogin && (!email || !password)) {
  throw new Error("Use --login with E2E_USER_EMAIL and E2E_USER_PASSWORD set.");
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

function fmt(ms) {
  return `${Math.round(ms)}ms`;
}

async function waitForAppSettled(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.locator("#root").waitFor({ state: "attached", timeout: 15_000 }).catch(() => {});

  if (waitMode === "networkidle") {
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    return;
  }

  await page.waitForFunction(() => {
    const root = document.querySelector("#root");
    if (!root || !root.textContent?.trim()) return false;
    const busy = document.querySelector('[aria-busy="true"]');
    if (busy) return false;
    const table = document.querySelector("table.data-table, table");
    const main = document.querySelector("main, [role='main'], .page-container");
    const loginForm = document.querySelector("form input[type='email'], #login-email");
    return Boolean(table || main || loginForm);
  }, { timeout: 15_000 }).catch(() => {});
}

async function login(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.locator("form").getByRole("button", { name: "Inloggen", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20_000 });
  await waitForAppSettled(page);
}

async function measureRoute(page, route) {
  const records = [];

  for (let run = 1; run <= runs; run += 1) {
    const requests = [];
    const failed = [];

    const onResponse = async (response) => {
      const request = response.request();
      const timing = request.timing();
      const duration = timing.responseEnd > 0 ? timing.responseEnd : 0;
      requests.push({
        url: response.url(),
        method: request.method(),
        status: response.status(),
        type: request.resourceType(),
        duration,
        transferSize: Number(response.headers()["content-length"] ?? 0),
      });
    };
    const onRequestFailed = (request) => {
      failed.push({
        url: request.url(),
        type: request.resourceType(),
        error: request.failure()?.errorText ?? "unknown",
      });
    };

    page.on("response", onResponse);
    page.on("requestfailed", onRequestFailed);

    const target = `${baseUrl}${route.startsWith("/") ? route : `/${route}`}`;
    const start = performance.now();
    await page.goto(target, { waitUntil: "domcontentloaded" });
    await waitForAppSettled(page);
    const wallTime = performance.now() - start;

    const navigation = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      const paint = Object.fromEntries(performance.getEntriesByType("paint").map((entry) => [entry.name, entry.startTime]));
      return nav ? {
        domContentLoaded: nav.domContentLoadedEventEnd,
        loadEventEnd: nav.loadEventEnd,
        transferSize: nav.transferSize,
        encodedBodySize: nav.encodedBodySize,
        decodedBodySize: nav.decodedBodySize,
        firstPaint: paint["first-paint"] ?? null,
        firstContentfulPaint: paint["first-contentful-paint"] ?? null,
      } : null;
    });

    page.off("response", onResponse);
    page.off("requestfailed", onRequestFailed);

    const slowRequests = requests
      .filter((request) => request.duration >= 500)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 8);

    records.push({
      run,
      finalUrl: page.url(),
      wallTime,
      navigation,
      requestCount: requests.length,
      failed,
      slowRequests,
      totalTransfer: requests.reduce((sum, request) => sum + request.transferSize, 0),
    });
  }

  return records;
}

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

if (shouldLogin) {
  await login(page);
}

const report = {
  baseUrl,
  routes: {},
};

for (const route of routes) {
  report.routes[route] = await measureRoute(page, route);
}

await browser.close();

for (const [route, records] of Object.entries(report.routes)) {
  const wallTimes = records.map((record) => record.wallTime);
  const dcls = records.map((record) => record.navigation?.domContentLoaded ?? 0);
  const loads = records.map((record) => record.navigation?.loadEventEnd ?? 0);
  const requestCounts = records.map((record) => record.requestCount);

  console.log(`\n${baseUrl}${route}`);
  console.log(`runs: ${records.length}`);
  console.log(`wall: min ${fmt(Math.min(...wallTimes))}, p50 ${fmt(percentile(wallTimes, 50))}, p95 ${fmt(percentile(wallTimes, 95))}, max ${fmt(Math.max(...wallTimes))}`);
  console.log(`domcontentloaded: p50 ${fmt(percentile(dcls, 50))}, max ${fmt(Math.max(...dcls))}`);
  console.log(`load: p50 ${fmt(percentile(loads, 50))}, max ${fmt(Math.max(...loads))}`);
  console.log(`requests: p50 ${percentile(requestCounts, 50)}, max ${Math.max(...requestCounts)}`);

  const failed = records.flatMap((record) => record.failed);
  if (failed.length) {
    console.log("failed requests:");
    for (const item of failed.slice(0, 10)) {
      console.log(`  ${item.type} ${item.error} ${item.url}`);
    }
  }

  const slow = records.flatMap((record) => record.slowRequests)
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 10);
  if (slow.length) {
    console.log("slow requests:");
    for (const item of slow) {
      console.log(`  ${fmt(item.duration)} ${item.status} ${item.type} ${item.url}`);
    }
  }

  const finalUrls = [...new Set(records.map((record) => record.finalUrl))];
  if (finalUrls.length === 1 && !finalUrls[0].startsWith(`${baseUrl}${route}`)) {
    console.log(`final url: ${finalUrls[0]}`);
  }
}
