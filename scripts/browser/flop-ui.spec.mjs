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
  { name: "tablet", width: 768, height: 900, isMobile: true },
  { name: "mobile-390", width: 390, height: 844, isMobile: true },
  { name: "mobile-320", width: 320, height: 740, isMobile: true }
];
const statusFixture = {
  schema: "reddragon-flop-live-status/v1", checkedAt: "2026-11-10T12:00:00.000Z", stale: false,
  testnet: { state: "not-live", release: "next (unreleased)" },
  devnet: { state: "public-development-network", rewards: "none", operatorEnrollment: "administrator-assisted / public self-service unavailable" },
  timeline: { state: "verified", updated: "2026-10-30", testnetTarget: "Tuesday 3 November 2026", testnetOpenClaim: true, devnetRewards: "none" },
  services: { rpc: { state: "verified" }, gateway: { state: "catalog-responded", count: 2 }, validator: { state: "verified" } },
  packages: { state: "verified-from-docs", versions: [{name:"@flop/sdk",version:"1.2.3"}], validatorPackage: "0.4.1-devnet.1", validatorManualVersion: "0.4.0-devnet.1", validatorAdmission: "administrator-assisted" },
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
    locale: "en-US",
    isMobile: viewport.isMobile,
    hasTouch: viewport.isMobile,
    permissions: ["clipboard-read", "clipboard-write"]
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
    const payload = JSON.parse(route.request().postData() || "{}");
    const action = payload.action;
    if (action === "kvGet" && payload.key === "d-browser-missing-room") {
      return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "external record absent" }) });
    }
    const bodies = {
      health: { ok: true, technocore: true }, rooms: { rooms: [] }, config: {},
      read: { messages: [], next: null }, kvGet: { value: null }
    };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(bodies[action] || { ok: true }) });
  });
  return { context, page: await context.newPage() };
}

async function activate(locator, viewport) {
  if (viewport.isMobile) await locator.tap();
  else await locator.click();
}

async function assertNoHorizontalOverflow(page) {
  const diagnosis = await page.evaluate(() => {
    const client = document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll("body *")].map(el => {
      const r = el.getBoundingClientRect();
      return { tag: el.tagName.toLowerCase(), id: el.id || "", className: typeof el.className === "string" ? el.className.slice(0,100) : "", text: (el.innerText || el.textContent || "").trim().replace(/\s+/g," ").slice(0,100), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), scrollWidth: el.scrollWidth };
    }).filter(x => x.width && (x.left < -1 || x.right > client + 1)).slice(0,25);
    return { client, scroll: document.documentElement.scrollWidth, offenders };
  });
  assert.ok(diagnosis.scroll <= diagnosis.client + 1, `horizontal overflow / DOM offenders: ${JSON.stringify(diagnosis)}`);
}

async function assertVisibleCopyLocale(page, locale, label) {
  const copy = await page.evaluate(() => {
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll("script,style,noscript,code,pre,input,textarea,select,[hidden],[aria-hidden='true']").forEach(el => el.remove());
    return (clone.innerText || clone.textContent || "").replace(/\s+/g, " ").trim();
  });
  if (locale === "en") {
    assert.doesNotMatch(copy, /[çğıöşüİ]/i, `${label}: Turkish UI characters remain in English copy`);
  } else {
    const untranslated = /\b(?:the password|no records|no signed|refresh status|refresh proof|refresh inbox|enter a valid|enter your|open room|public self-service unavailable|waiting for demo|live-verify)\b/i.exec(copy);
    assert.equal(untranslated, null, `${label}: English UI phrase remains: ${untranslated?.[0]}`);
  }
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
      await page.locator("#rdTclkWorkbench").waitFor({ state: "visible" });
      await page.locator("#rdProvFixSummary").waitFor({ state: "visible" });
      const catalogAudit = await page.evaluate(() => window.RD_I18N.audit());
      assert.ok(catalogAudit.catalogs >= 6, `all module catalogs registered: ${JSON.stringify(catalogAudit)}`);
      assert.match(await page.locator("#heroDid").textContent(), /did:key:z6Mk/);
      assert.equal(await page.locator("#flopCommunityLink").isVisible(), true);
      assert.match(await page.evaluate(() => localStorage.getItem("reddragon-lang")), /^(tr|en)$/);
      await page.locator('#rdLangSwitcher button[data-lang="en"]').click();
      await page.locator(".hero-actions .ghost-link").filter({ hasText: "Open FLOP Observatory" }).waitFor({ state: "visible" });
      assert.equal(await page.locator("html").getAttribute("lang"), "en");
      assert.equal(await page.locator('.hero-actions .ghost-link[href="/flop"]').getAttribute("href"), "/flop");
      assert.match(await page.locator("#brandSub").textContent(), /Community Observatory/);
      assert.match(await page.locator("#rdDidProvenance .rd-prov-head h2").textContent(), /who built this tool/i);
      assert.equal(await page.locator("#rdDidProvenance .rd-prov-kv span").first().textContent(), "Verified owned room");
      assert.equal(await page.locator("#rdDidProvenance .rd-prov-kv span").nth(2).textContent(), "Mailbox channel");
      assert.match(await page.locator("#rdTestnetToolkit h2").textContent(), /testnet-ready/i);
      assert.match(await page.locator("#rdTclkWorkbench .rd-tclk-head p").textContent(), /verifiable agent-to-agent/i);
      await page.waitForFunction(() => /proof signals|core proof/i.test(document.querySelector("#rdProvFixSummary")?.textContent || ""));
      assert.match(await page.locator("#rdProvFixSummary").textContent(), /proof signals|core proof/i);
      assert.doesNotMatch(await page.locator("#rdTestnetToolkit .rd-testnet-head p").textContent(), /^FLOP'un güncel/);
      assert.doesNotMatch(await page.locator("#rdDidProvenance").innerText(), /Live-verifies/);
      await assertVisibleCopyLocale(page, "en", `${viewport.name}/home`);

      assert.equal((await page.locator("#helloText").inputValue()).startsWith("Hello Technocore!"), true, "English default message must be localized");
      await page.locator("#createBtn").click();
      assert.equal((await page.locator("#toast").textContent()).trim(), "The password must be at least 12 characters.");
      await page.locator('#rdLangSwitcher button[data-lang="tr"]').click();
      await page.locator(".hero-actions .ghost-link").filter({ hasText: "FLOP Gözlemevini aç" }).waitFor({ state: "visible" });
      assert.equal(await page.locator("html").getAttribute("lang"), "tr");
      assert.match(await page.locator("#brandSub").textContent(), /Topluluk Gözlemevi/);
      assert.match(await page.locator("#rdDidProvenance .rd-prov-head h2").textContent(), /bu aracı kim geliştirdi/i);
      assert.equal(await page.locator("#rdDidProvenance .rd-prov-kv span").first().textContent(), "Sahipliği doğrulanmış oda");
      assert.equal(await page.locator("#rdDidProvenance .rd-prov-kv span").nth(2).textContent(), "Posta kutusu kanalı");
      assert.match(await page.locator("#rdTestnetToolkit h2").textContent(), /testnet'e hazır mısın/i);
      assert.match(await page.locator("#rdTclkWorkbench .rd-tclk-head p").textContent(), /doğrulanabilir ajanlar arası/i);
      await page.waitForFunction(() => /kanıt|doğrulanamadı/i.test(document.querySelector("#rdProvFixSummary")?.textContent || ""));
      assert.match(await page.locator("#rdProvFixSummary").textContent(), /kanıt|doğrulanamadı/i);
      assert.doesNotMatch(await page.locator("#rdTestnetToolkit .rd-testnet-head p").textContent(), /Turns FLOP's current/);
      assert.doesNotMatch(await page.locator("#rdDidProvenance").innerText(), /Live-verifies/);
      await assertVisibleCopyLocale(page, "tr", `${viewport.name}/home`);
      assert.equal((await page.locator("#helloText").inputValue()).startsWith("Merhaba Technocore!"), true, "Turkish default message must be localized");
      await page.locator("#createBtn").click();
      assert.equal((await page.locator("#toast").textContent()).trim(), "Parola en az 12 karakter olmalı.");
      await assertNoHorizontalOverflow(page);
      assert.deepEqual(errors, [], `${viewport.name} page errors`);
    } finally { await context.close(); }
  }
});

test("main page keeps local activity isolated by public DID on all viewports", async () => {
  for (const viewport of viewports) {
    const { context, page } = await newPage(viewport);
    try {
      await page.goto(`${baseURL}/`);
      const did = page.locator("#rdLedgerDid");
      await did.waitFor({ state: "visible" });
      await did.fill(didRedDragon);
      await page.locator("#rdFaucetAmount").fill("0.25");
      await page.locator("#rdFaucetRef").fill("local-browser-check");
      await activate(page.locator("#rdRecordFaucet"), viewport);
      assert.match(await page.locator("#rdLedgerRows").textContent(), /local-browser-check/);
      const redKey = `reddragon-flop-testnet-ledger:${didRedDragon}`;
      const otherKey = `reddragon-flop-testnet-ledger:${didOther}`;
      assert.equal(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "null")?.entries?.length, redKey), 1);
      assert.equal(await page.evaluate((key) => localStorage.getItem(key), otherKey), null);

      await did.fill(didOther);
      assert.match(await page.locator("#rdLedgerRows").textContent(), /no records|henüz kayıt/i);
      await page.locator("#rdInferenceAmount").fill("1.5");
      await page.locator("#rdInferenceRef").fill("other-did-local-check");
      await activate(page.locator("#rdRecordInference"), viewport);
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
      await assertVisibleCopyLocale(page, "tr", `${viewport.name}/flop`);
      await page.reload();
      assert.equal(await language.inputValue(), "tr", "Turkish choice should survive reload");
      await language.selectOption("en");
      assert.equal(await page.locator("html").getAttribute("lang"), "en");
      assert.equal(await page.locator("#live-title").textContent(), "Live FLOP status");
      await page.reload();
      assert.equal(await language.inputValue(), "en", "English choice should survive reload");
      assert.match(await page.locator("#rdLiveTestnet [data-status]").textContent(), /planned|unreleased/i);
      assert.match(await page.locator("#rdLiveDevnet [data-detail]").textContent(), /administrator-assisted|administrator assistance/i);
      assert.doesNotMatch(await page.locator("#rdLiveDevnet [data-detail]").textContent(), /public self-service unavailable/);
      await assertVisibleCopyLocale(page, "en", `${viewport.name}/flop`);
      await assertNoHorizontalOverflow(page);
    } finally { await context.close(); }
  }
});


test("/flop keeps source failures unverified and localized", async () => {
  const { context, page } = await newPage(viewports[2]);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await context.unroute("**/api/flop-status");
  await context.route("**/api/flop-status", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({error:"simulated source failure"}) }));
  try {
    await page.goto(`${baseURL}/flop`);
    await page.locator("#rdLiveTestnet [data-status]").waitFor({ state: "visible" });
    await page.waitForFunction(() => document.querySelector("#rdLiveTestnet [data-status]")?.textContent.includes("Unverified"));
    assert.equal(await page.locator("#rdLiveTestnet").getAttribute("data-state"), "bad");
    await page.locator("#rdFlopLanguage").selectOption("tr");
    await page.waitForFunction(() => document.documentElement.lang === "tr");
    await page.waitForFunction(() => document.querySelector("#rdLiveTestnet [data-status]")?.textContent.includes("Doğrulanamadı"));
    assert.doesNotMatch(await page.locator("#rdLiveTestnet [data-detail]").textContent(), /simulated source failure/);
    assert.deepEqual(errors, [], "API failure localization must not throw a browser exception");
  } finally { await context.close(); }
});


test("DID create, encrypted backup, restore, prompts and mocked signed flows work in both locales at every viewport", { timeout: 240000 }, async () => {
  for (const viewport of viewports) for (const locale of ["en", "tr"]) {
    const { context, page } = await newPage(viewport);
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    try {
      await page.goto(`${baseURL}/`);
      await page.locator("#createBtn").waitFor({ state: "visible" });
      const langButton = page.locator(`#rdLangSwitcher button[data-lang="${locale}"]`);
      if (await page.locator("html").getAttribute("lang") !== locale) {
        if (viewport.isMobile) await langButton.tap(); else await langButton.click();
        await page.waitForFunction(expected => document.documentElement.lang === expected, locale);
      }
      const shortText = locale === "tr" ? "Parola en az 12 karakter olmalı." : "The password must be at least 12 characters.";
      await activate(page.locator("#createBtn"), viewport);
      assert.equal((await page.locator("#toast").textContent()).trim(), shortText);
      await page.locator("#pass1").fill("ephemeral-browser-only-password");
      await page.locator("#pass2").fill("ephemeral-browser-only-password");
      await activate(page.locator("#createBtn"), viewport);
      await page.waitForFunction(() => (document.querySelector("#identityOut")?.textContent || "").includes("did:key:z6Mk"), null, { timeout: 35000 });
      const did = (await page.locator("#identityOut").textContent()).split("\n")[0].trim();
      const downloadEvent = page.waitForEvent("download");
      await activate(page.locator("#backupBtn"), viewport);
      const backup = await downloadEvent;
      assert.match(backup.suggestedFilename(), /reddragon-technocore-.*\.json/);
      const backupPath = await backup.path();
      let promptText = "";
      const promptEvent = page.waitForEvent("dialog");
      const fileChooserEvent = page.waitForEvent("filechooser");
      await activate(page.locator("label.filebtn").filter({ has: page.locator("#restoreInput") }), viewport);
      const fileChooser = await fileChooserEvent;
      await fileChooser.setFiles(backupPath);
      const restorePrompt = await promptEvent;
      promptText = restorePrompt.message();
      await restorePrompt.accept("ephemeral-browser-only-password");
      const restoredText = locale === "tr" ? "Kimlik geri yüklendi." : "Identity restored.";
      await page.waitForFunction(expected => (document.querySelector("#toast")?.textContent || "").trim() === expected, restoredText);
      await page.waitForFunction(expected => (document.querySelector("#identityOut")?.textContent || "").startsWith(expected), did);
      assert.equal((await page.locator("#identityOut").textContent()).split("\n")[0].trim(), did);
      assert.equal(promptText, locale === "tr" ? "Yedek parolasını gir:" : "Enter the backup password:");
      assert.equal((await page.locator("#toast").textContent()).trim(), restoredText);
      await activate(page.locator("#helloBtn"), viewport);
      await page.waitForFunction(expected => (document.querySelector("#helloOut")?.textContent || "").includes(expected), locale === "tr" ? "sıra" : "seq");
      await page.locator("#rdVerifyRoom").fill("d-browser-missing-room");
      await page.locator("#rdVerifyDid").fill(didRedDragon);
      await activate(page.locator("#rdVerifyButton"), viewport);
      await page.waitForFunction(() => (document.querySelector("#rdVerifyResult")?.textContent || "").includes("404"));
      assert.match(await page.locator("#rdVerifyResult").textContent(), locale === "tr" ? /Dış sistemde kayıt bulunamadı/ : /external system returned no record/i);
      assert.equal(await page.locator("#rdVerifyResult").getAttribute("data-state"), "bad", "external absence is not a local ownership pass");
      assert.deepEqual(errors, [], `${locale}/${viewport.name} DID errors`);
    } finally { await context.close(); }
  }
});
