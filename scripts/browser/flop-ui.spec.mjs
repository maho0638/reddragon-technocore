import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { after, before, test } from "node:test";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const didRedDragon = "did:key:z6MkuhrsP4tDZjWYdZLPxaur19WvrF1yuLGsGB2S8Q1gwS6K";
const didOther = "did:key:z6MkqEhk421dSv8pEnDvWVPatEMegY2RgXU2ksDw5pbUbU48";
const viewports = [
  { name: "desktop", width: 1440, height: 1000, isMobile: false },
  { name: "mobile", width: 390, height: 844, isMobile: true }
];
const statusFixture = {
  schema: "reddragon-flop-live-status/v1", checkedAt: "2026-11-10T12:00:00.000Z", stale: false,
  testnet: { state: "not-live", release: "next (unreleased)" },
  devnet: { state: "public-development-network", rewards: "none" },
  timeline: { state: "verified", updated: "2026-10-30", testnetTarget: "Tuesday 3 November 2026", testnetOpenClaim: true, devnetRewards: "none" },
  services: { rpc: { state: "verified" }, gateway: { state: "catalog-responded", count: 2 }, validator: { state: "verified" } },
  packages: { state: "verified", validatorPackage: "0.4.1-devnet.1", validatorManual: "0.4.0-devnet.1" },
  yellowPaper: { state: "verified", livePageUpdated: "2026-09-24", contentVsCiDistinguished: true, githubContentCommit: { date: "2026-10-26T12:00:00.000Z" }, githubRepositoryHead: { date: "2026-11-05T12:00:00.000Z", message: "ci: fixture" } },
  token: { state: "verified", claim: "no token yet" }
};

let browser;
let server;
let baseURL;
let serverStdout = "";
let serverStderr = "";

async function waitForServer(child, url) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Local preview exited: ${serverStderr || serverStdout}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Local preview did not start: ${serverStderr || serverStdout}`);
}

async function newPage(viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.isMobile,
    hasTouch: viewport.isMobile
  });
  await context.addInitScript(() => {
    if (!sessionStorage.getItem("__rdBrowserSmokeInitialized")) {
      localStorage.clear();
      sessionStorage.setItem("__rdBrowserSmokeInitialized", "1");
    }
  });
  await context.route("**/api/flop-status", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify(statusFixture)
  }));
  await context.route("**/api/relay", (route) => {
    const action = JSON.parse(route.request().postData() || "{}").action;
    const bodies = {
      health: { ok: true, technocore: true }, rooms: { rooms: [] }, config: {},
      read: { messages: [], next: null }, kvGet: { value: null }
    };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(bodies[action] || { ok: true }) });
  });
  return { context, page: await context.newPage() };
}

async function assertNoHorizontalOverflow(page) {
  const widths = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(widths.scroll <= widths.client + 1, `horizontal overflow: ${JSON.stringify(widths)}`);
}

before(async () => {
  const port = 43_000 + Math.floor(Math.random() * 1_000);
  baseURL = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["scripts/local-preview-server.mjs"], {
    cwd: process.cwd(), env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"]
  });
  server.stdout.setEncoding("utf8").on("data", (part) => { serverStdout += part; });
  server.stderr.setEncoding("utf8").on("data", (part) => { serverStderr += part; });
  await waitForServer(server, baseURL);
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((resolve) => {
      server.once("exit", resolve);
      setTimeout(resolve, 2_000).unref();
    });
  }
});

test("main page boots from empty storage and translates in desktop and mobile", async () => {
  for (const viewport of viewports) {
    const { context, page } = await newPage(viewport);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.goto(`${baseURL}/`);
      await page.locator("h1").waitFor({ state: "visible" });
      await page.locator("#rdTestnetToolkit").waitFor({ state: "visible" });
      assert.match(await page.locator("#heroDid").textContent(), /did:key:z6Mk/);
      assert.equal(await page.locator("#flopCommunityLink").isVisible(), true);
      assert.match(await page.evaluate(() => localStorage.getItem("reddragon-lang")), /^(tr|en)$/);
      await page.locator('#rdLangSwitcher button[data-lang="en"]').click();
      await page.locator(".hero-copy .ghost-link").filter({ hasText: "Open FLOP Observatory" }).waitFor({ state: "visible" });
      assert.equal(await page.locator("html").getAttribute("lang"), "en");
      await page.locator('#rdLangSwitcher button[data-lang="tr"]').click();
      await page.locator(".hero-copy .ghost-link").filter({ hasText: "FLOP Gözlemevini aç" }).waitFor({ state: "visible" });
      assert.equal(await page.locator("html").getAttribute("lang"), "tr");
      await assertNoHorizontalOverflow(page);
      assert.deepEqual(errors, [], `${viewport.name} page errors`);
    } finally { await context.close(); }
  }
});

test("main page keeps local activity isolated by public DID on desktop and mobile", async () => {
  for (const viewport of viewports) {
    const { context, page } = await newPage(viewport);
    try {
      await page.goto(`${baseURL}/`);
      const did = page.locator("#rdLedgerDid");
      await did.waitFor({ state: "visible" });
      await did.fill(didRedDragon);
      await page.locator("#rdFaucetAmount").fill("0.25");
      await page.locator("#rdFaucetRef").fill("local-browser-check");
      await page.locator("#rdRecordFaucet").click();
      assert.match(await page.locator("#rdLedgerRows").textContent(), /local-browser-check/);
      const redKey = `reddragon-flop-testnet-ledger:${didRedDragon}`;
      const otherKey = `reddragon-flop-testnet-ledger:${didOther}`;
      assert.equal(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "null")?.entries?.length, redKey), 1);
      assert.equal(await page.evaluate((key) => localStorage.getItem(key), otherKey), null);

      await did.fill(didOther);
      assert.match(await page.locator("#rdLedgerRows").textContent(), /no records|henüz kayıt/i);
      await page.locator("#rdInferenceAmount").fill("1.5");
      await page.locator("#rdInferenceRef").fill("other-did-local-check");
      await page.locator("#rdRecordInference").click();
      assert.match(await page.locator("#rdLedgerRows").textContent(), /other-did-local-check/);
      assert.equal(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "null")?.entries?.length, otherKey), 1);

      await did.fill(didRedDragon);
      assert.match(await page.locator("#rdLedgerRows").textContent(), /local-browser-check/);
      assert.doesNotMatch(await page.locator("#rdLedgerRows").textContent(), /other-did-local-check/);
      await assertNoHorizontalOverflow(page);
    } finally { await context.close(); }
  }
});

test("/flop Turkish and English copy, fail-closed status, and responsive layout", async () => {
  for (const viewport of viewports) {
    const { context, page } = await newPage(viewport);
    try {
      await page.goto(`${baseURL}/flop`);
      await page.locator("#flop-live-status").waitFor({ state: "visible" });
      await page.locator("#rdLiveTestnet [data-status]").waitFor({ state: "visible" });
      const language = page.locator("#rdFlopLanguage");
      await language.selectOption("tr");
      assert.equal(await page.locator("html").getAttribute("lang"), "tr");
      assert.equal(await page.locator("#live-title").textContent(), "Canlı FLOP durumu");
      await page.reload();
      assert.equal(await language.inputValue(), "tr", "Turkish choice should survive reload");
      await language.selectOption("en");
      assert.equal(await page.locator("html").getAttribute("lang"), "en");
      assert.equal(await page.locator("#live-title").textContent(), "Live FLOP status");
      await page.reload();
      assert.equal(await language.inputValue(), "en", "English choice should survive reload");
      assert.match(await page.locator("#rdLiveTestnet [data-status]").textContent(), /planned|unreleased|planlandı|yayımlanmadı/i);
      await assertNoHorizontalOverflow(page);
    } finally { await context.close(); }
  }
});
