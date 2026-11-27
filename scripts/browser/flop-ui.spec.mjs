import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { after, before, test } from "node:test";
import { cryptoWaitReady, mnemonicGenerate, signatureVerify } from "@polkadot/util-crypto";
import { Keyring } from "@polkadot/keyring";

const require = createRequire(import.meta.url);
const { chromium, firefox, webkit } = require("playwright");
const browserName = process.env.PLAYWRIGHT_BROWSER || "chromium";
const browserType = { chromium, firefox, webkit }[browserName];
assert.ok(browserType, `Unsupported PLAYWRIGHT_BROWSER: ${browserName}`);
const didRedDragon = "did:key:z6MkuhrsP4tDZjWYdZLPxaur19WvrF1yuLGsGB2S8Q1gwS6K";
const didOther = "did:key:z6MkqEhk421dSv8pEnDvWVPatEMegY2RgXU2ksDw5pbUbU48";
const viewports = [
  { name: "desktop", width: 1440, height: 1000, isMobile: false },
  { name: "tablet", width: 768, height: 900, isMobile: true },
  { name: "mobile-390", width: 390, height: 844, isMobile: true },
  { name: "mobile-320", width: 320, height: 740, isMobile: true }
];
const statusFixture = {
  schema: "reddragon-flop-live-status/v1", checkedAt: new Date().toISOString(), stale: false,
  testnet: { state: "live-unscored", release: "opened 2026-11-24" },
  devnet: { state: "public-development-network", rewards: "none", operatorEnrollment: "administrator-assisted / public self-service unavailable" },
  timeline: { state: "verified", updated: "2026-11-26", testnetTarget: null, testnetOpenClaim: true, devnetRewards: "none" },
  services: {
    rpc: { state: "verified" }, testnetRpc: { state: "identity-matched", genesis: "0x918abd58fb16306b30ef3886514cfaebffecb4de43e82b6f8ec4795c43cfd800" },
    faucet: { state: "open", ready: true, chain: { network: "testnet", genesisHash: "0x918abd58fb16306b30ef3886514cfaebffecb4de43e82b6f8ec4795c43cfd800" }, limits: { asOf: new Date().toISOString(), network: "testnet", state: "open", stale: false, claimPath: "/v1/testnet/agent-claims", grantFlop: 10, cooldownSeconds: 86400 } },
    gateway: { state: "catalog-responded", count: 2 },
    testnetGateway: { state: "catalog-responded", source: "https://gateway.testnet.flop.network/v1/models", count: 2, models: [{ id: "qwen/qwen3-14b", name: "Qwen3 14B (FLOP Testnet)", ownedBy: "flop-network" }, { id: "qwen/qwen3-8b", name: "Qwen3 8B (FLOP Testnet)", ownedBy: "flop-network" }], inference: "not-tested-no-authorized-key" },
    validator: { state: "verified" }
  },
  packages: { state: "verified-from-docs", versions: [{name:"@flop-labs/sdk",version:"0.12.1"}], validatorPackage: "0.4.1-devnet.1", validatorManualVersion: "0.4.0-devnet.1", validatorAdmission: "administrator-assisted" },
  yellowPaper: { state: "verified", livePageUpdated: "2026-09-24", contentVsCiDistinguished: true, githubContentCommit: { date: "2026-10-26T12:00:00.000Z" }, githubRepositoryHead: { date: "2026-11-05T12:00:00.000Z", message: "ci: fixture" } },
  token: { state: "verified", claim: "no token yet" }
};
function freshStatusFixture() {
  const status = structuredClone(statusFixture);
  const now = new Date().toISOString();
  status.checkedAt = now;
  if (status.services.faucet?.limits) status.services.faucet.limits.asOf = now;
  return status;
}

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

async function newPage(viewport, preferredLocale, options = {}) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    locale: "en-US",
    ...(options.record && process.env.FUNCTIONAL_VIDEO_DIR && browserName === "chromium" ? { recordVideo: { dir: process.env.FUNCTIONAL_VIDEO_DIR, size: { width: viewport.width, height: viewport.height } } } : {}),
    ...(browserName === "firefox" ? {} : { isMobile: viewport.isMobile, hasTouch: viewport.isMobile }),
    ...(browserName === "chromium" ? { permissions: ["clipboard-read", "clipboard-write"] } : {})
  });
  if (browserName !== "chromium") await context.addInitScript(() => {
    let copied = "";
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async text => { copied = String(text); }, readText: async () => copied } });
  });
  await context.addInitScript((locale) => {
    if (!sessionStorage.getItem("__rdBrowserSmokeInitialized")) {
      localStorage.clear();
      if (locale === "tr" || locale === "en") localStorage.setItem("reddragon-lang", locale);
      sessionStorage.setItem("__rdBrowserSmokeInitialized", "1");
    }
  }, preferredLocale);
  await context.route("**/api/flop-status", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify(freshStatusFixture())
  }));
  await context.route("**/api/relay", async (route) => {
    const request = route.request();
    const targetOrigin = new URL(request.url()).origin;
    const requestOrigin = request.headers().origin || "";
    const isLocalPreviewOrigin = new URL(baseURL).origin === targetOrigin;
    console.log(`[QA] relay mock ${request.method()} target=${targetOrigin} origin=${requestOrigin || "none"}`);
    const corsHeaders = isLocalPreviewOrigin ? {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, HEAD, POST, OPTIONS",
      "access-control-allow-headers": request.headers()["access-control-request-headers"] || "content-type, accept",
      "access-control-max-age": "600",
      "vary": "Origin"
    } : {};
    if (request.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: corsHeaders, body: "" });
    }
    const payload = JSON.parse(request.postData() || "{}");
    const action = payload.action;
    if (action === "kvGet" && payload.key === "d-browser-missing-room") {
      return route.fulfill({ status: 404, contentType: "application/json", headers: corsHeaders, body: JSON.stringify({ error: "external record absent" }) });
    }
    const bodies = {
      health: { ok: true, technocore: true }, rooms: { rooms: [] }, config: {},
      read: { messages: [], next: null }, kvGet: { value: null }
    };
    return route.fulfill({ status: 200, contentType: "application/json", headers: corsHeaders, body: JSON.stringify(bodies[action] || { ok: true }) });
  });
  return { context, page: await context.newPage() };
}

async function activate(locator, viewport) {
  if (viewport.isMobile && browserName !== "firefox") await locator.tap();
  else await locator.click();
}

async function assertNoHorizontalOverflow(page) {
  const diagnosis = await page.evaluate(() => {
    const client = document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll("body *")].map(el => {
      const r = el.getBoundingClientRect();
      const ancestors = []; let containedByRail = false;
      for (let p = el.parentElement, n = 0; p && n < 6; p = p.parentElement, n++) { const pr = p.getBoundingClientRect(); const overflowX=getComputedStyle(p).overflowX; if (overflowX === "auto" || overflowX === "scroll") containedByRail = true; ancestors.push({tag:p.tagName.toLowerCase(),id:p.id||"",className:typeof p.className === "string" ? p.className.slice(0,70) : "",left:Math.round(pr.left),right:Math.round(pr.right),width:Math.round(pr.width),overflowX,scrollWidth:p.scrollWidth}); }
      return { tag: el.tagName.toLowerCase(), id: el.id || "", className: typeof el.className === "string" ? el.className.slice(0,100) : "", text: (el.innerText || el.textContent || "").trim().replace(/\s+/g," ").slice(0,100), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), scrollWidth: el.scrollWidth, containedByRail, ancestors };
    }).filter(x => x.width && (x.left < -1 || x.right > client + 1)).slice(0,25);
    return { client, scroll: document.documentElement.scrollWidth, offenders, uncontained: offenders.filter(x => !x.containedByRail) };
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
    const hits = [...copy.matchAll(/[çğıöşüİ]/gi)].slice(0, 20).map(match => ({
      character: match[0], context: copy.slice(Math.max(0, match.index - 65), Math.min(copy.length, match.index + 85))
    }));
    assert.deepEqual(hits, [], `${label}: Turkish UI characters remain in English copy`);
  } else {
    const untranslated = /\b(?:the password|no records|no signed|refresh status|refresh proof|refresh inbox|enter a valid|enter your|open room|public self-service unavailable|waiting for demo|live-verify)\b/i.exec(copy);
    assert.equal(untranslated, null, `${label}: English UI phrase remains: ${untranslated?.[0]}`);
  }
}

before(async () => {
  const supplied = process.env.SITE_ACCEPTANCE_ORIGIN;
  if (supplied) {
    const url = new URL(supplied);
    assert.equal(url.protocol, "http:", "E2E origin must be local HTTP");
    assert.ok(["127.0.0.1", "localhost"].includes(url.hostname), "E2E may only target loopback, never production");
    baseURL = url.origin;
    assert.equal((await fetch(baseURL)).ok, true, "shared local preview must be reachable");
  } else {
    const port = 43_000 + Math.floor(Math.random() * 1_000);
    baseURL = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, ["scripts/local-preview-server.mjs"], {
      cwd: process.cwd(), env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"]
    });
    server.stdout.setEncoding("utf8").on("data", (part) => { serverStdout += part; });
    server.stderr.setEncoding("utf8").on("data", (part) => { serverStderr += part; });
    await waitForServer(server, baseURL);
  }
  const executablePath = process.env[`PLAYWRIGHT_${browserName.toUpperCase()}_EXECUTABLE_PATH`];
  browser = await browserType.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
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
    const relayFailures = [];
    page.on("pageerror", (error) => errors.push(error.stack || error.message));
    page.on("requestfailed", (request) => {
      if (request.url().includes("/api/relay")) relayFailures.push({ url: request.url(), method: request.method(), error: request.failure()?.errorText });
    });
    try {
      await page.goto(`${baseURL}/`);
      await page.locator("h1").waitFor({ state: "visible" });
      await page.locator("#rdTestnetToolkit").waitFor({ state: "visible" });
      await page.locator("#rdTclkWorkbench").waitFor({ state: "visible" });
      await page.locator("#rdProvFixSummary").waitFor({ state: "visible" });
      const catalogAudit = await page.evaluate(() => window.RD_I18N.audit());
      assert.ok(catalogAudit.catalogs >= 6, `all module catalogs registered: ${JSON.stringify(catalogAudit)}`);
      assert.match(await page.locator("#heroDid").textContent(), /did:key:z6Mk/);
      const communityNav = page.locator("#flopCommunityLink");
      assert.equal(await communityNav.getAttribute("href"), "/flop");
      if (viewport.width > 980) {
        assert.equal(await communityNav.isVisible(), true, `${viewport.name} desktop navigation should be visible`);
        await activate(communityNav, viewport);
      } else {
        assert.equal(await communityNav.isVisible(), false, `${viewport.name} compact navigation is intentionally hidden`);
        const heroNav = page.locator('.hero-actions .ghost-link[href="/flop"]');
        assert.equal(await heroNav.isVisible(), true, `${viewport.name} must expose a touchable FLOP navigation CTA`);
        await activate(heroNav, viewport);
      }
      await page.waitForURL((url) => url.pathname === "/flop");
      await page.locator("h1").waitFor({ state: "visible" });
      await page.goBack();
      await page.locator("#rdTestnetToolkit").waitFor({ state: "visible" });
      assert.match(await page.evaluate(() => localStorage.getItem("reddragon-lang")), /^(tr|en)$/);
      await page.locator('#rdLangSwitcher button[data-lang="en"]').click();
      await page.locator(".hero-actions .ghost-link").filter({ hasText: "Open FLOP Observatory" }).waitFor({ state: "visible" });
      assert.equal(await page.locator("html").getAttribute("lang"), "en");
      await page.waitForFunction(() => {
        const panel = document.querySelector("#rdSharePanel");
        return panel?.querySelector("h3")?.textContent?.trim() === "Share · everyone uses their own account" &&
          panel?.querySelector("p")?.textContent?.includes("The X text is copied to your clipboard") &&
          document.querySelector("#rdShareSiteX")?.textContent?.trim() === "𝕏 Share this site";
      }, null, { timeout: 10000 });
      assert.equal(await page.locator('.hero-actions .ghost-link[href="/flop"]').getAttribute("href"), "/flop");
      assert.match(await page.locator("#brandSub").textContent(), /Community Observatory/);
      assert.match(await page.locator("#rdDidProvenance .rd-prov-head h2").textContent(), /who built this tool/i);
      assert.match(await page.locator("#rdDidProvenance .rd-prov-head p").textContent(), /Checks the RedDragon Technocore DID binding/i);
      assert.equal(await page.locator("#rdDidProvenance .rd-prov-kv span").first().textContent(), "Ownership claim");
      assert.equal(await page.locator("#rdDidProvenance .rd-prov-kv span").nth(3).textContent(), "Mailbox lane");
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
      assert.equal(await page.locator("#rdDidProvenance .rd-prov-kv span").first().textContent(), "Sahiplik beyanı");
      assert.equal(await page.locator("#rdDidProvenance .rd-prov-kv span").nth(3).textContent(), "Posta kutusu kanalı");
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
      const ledgerDid = page.locator("#rdLedgerDid");
      await ledgerDid.fill(didOther);
      await activate(page.locator('#rdLangSwitcher button[data-lang="en"]'), viewport);
      await page.waitForFunction(() => document.documentElement.lang === "en");
      assert.equal(await ledgerDid.inputValue(), didOther, `${viewport.name} language change preserves Testnet Toolkit input`);
      assert.equal((await page.locator("#rdTestnetToolkit h2").textContent()).trim(), "Are you testnet-ready?");
      assert.equal((await page.locator("#rdLiveNav").textContent()).trim(), "Live");
      await assertVisibleCopyLocale(page, "en", `${viewport.name}/home-live-panels`);
      await activate(page.locator('#rdLangSwitcher button[data-lang="tr"]'), viewport);
      await page.waitForFunction(() => document.documentElement.lang === "tr");
      assert.equal(await ledgerDid.inputValue(), didOther, `${viewport.name} reverse language change preserves Testnet Toolkit input`);
      assert.equal((await page.locator("#rdTestnetToolkit h2").textContent()).trim(), "Testnet'e hazır mısın?");
      await assertNoHorizontalOverflow(page);
      assert.deepEqual(errors, [], `${viewport.name} page errors; relay failures: ${JSON.stringify(relayFailures)}`);
    } finally { await context.close(); }
  }
});

test("step 11 warning copy stays separated and localized at all supported widths", async () => {
  const translations = {
    tr: {
      title: "İstenmeyen ileti değil, sürdürülebilir etkinlik",
      description: "Ana ve yedek workflow farklı zamanlarda çalışır. GitHub bir zamanlamayı geciktirirse sonraki tetikleyici açığı kapatabilir. Technocore'daki kalıcı durum, imzalı check-in'ler arasında en az 12 saat bırakır. Daha sık gönderilerin airdrop uygunluğunu artırdığına dair kanıt yoktur; uygunluk ölçütlerini yalnızca FLOP Labs doğrulayabilir."
    },
    en: {
      title: "Sustainable activity, not spam",
      description: "Primary and backup workflows run on staggered schedules. If GitHub delays one schedule, a later trigger can recover. Durable Technocore state keeps signed check-ins at least 12 hours apart. More frequent posts are not known to improve airdrop eligibility; FLOP Labs alone confirms eligibility criteria."
    }
  };

  for (const viewport of viewports) {
    const { context, page } = await newPage(viewport, "tr");
    try {
      await page.goto(`${baseURL}/`);
      const warning = page.locator('[data-step="11"] > .warning-box');
      const heading = warning.locator("b");
      const description = warning.locator("span");
      await heading.waitFor({ state: "visible" });

      for (const locale of ["tr", "en"]) {
        if (await page.locator("html").getAttribute("lang") !== locale) {
          await page.locator('#rdLangSwitcher button[data-lang="' + locale + '"]').click();
          await page.waitForFunction(expected => document.documentElement.lang === expected, locale);
        }
        const observed = await page.evaluate(() => ({
          htmlLang: document.documentElement.lang,
          storedLang: localStorage.getItem("reddragon-lang"),
          title: document.querySelector('[data-step="11"] > .warning-box b')?.textContent?.trim() ?? null,
          description: document.querySelector('[data-step="11"] > .warning-box span')?.textContent?.trim() ?? null
        }));
        console.log("step11 locale " + viewport.name + "/" + locale + ": " + JSON.stringify(observed));
        assert.equal(observed.htmlLang, locale, viewport.name + "/" + locale + " html.lang");
        assert.equal(observed.storedLang, locale, viewport.name + "/" + locale + " localStorage");
        assert.equal(observed.title, translations[locale].title, viewport.name + "/" + locale + " title");
        assert.equal(observed.description, translations[locale].description, viewport.name + "/" + locale + " description");
        assert.equal((await page.locator(".ownerline b").textContent()).trim(), locale === "tr" ? "RedDragon FLOP Topluluk Aracı" : "RedDragon FLOP Community Tool");
        assert.equal((await page.locator('[data-step="11"] .automation-grid > div:nth-child(2) h3').textContent()).trim(), locale === "tr" ? "Depo değişkenleri" : "Repository Variables");
        assert.equal((await page.locator("#rdLiveNav").textContent()).trim(), locale === "tr" ? "Canlı" : "Live");
        assert.equal((await page.locator("#rdLiveTitle").textContent()).trim(), locale === "tr" ? "Canlı Ajan Gözlemevi" : "Live Agent Observatory");
        const localizedLiveCopy = (await page.locator("#rdLiveObservatory .eyebrow, #rdLiveTitle, #rdLiveTitle + p, .rd-live-public-note, .rd-live-metric, .rd-live-panel-head h3, .rd-live-footnote, .rd-live-empty, .rd-live-presence, .rd-live-presence + small").allTextContents()).join(" ").toLowerCase();
        if (locale === "tr") assert.doesNotMatch(localizedLiveCopy, /\b(?:signed agent|active|idle|stale|heartbeat|public activity|agent view|public data|private room|buffer|polling)\b/i);
        else assert.doesNotMatch(localizedLiveCopy, /[çğıöşüİ]/i);

        const geometry = await warning.evaluate((box) => {
          const title = box.querySelector("b");
          const copy = box.querySelector("span");
          const boxRect = box.getBoundingClientRect();
          const titleRect = title.getBoundingClientRect();
          const copyRect = copy.getBoundingClientRect();
          return {
            box: { left: boxRect.left, right: boxRect.right, top: boxRect.top, bottom: boxRect.bottom },
            title: { left: titleRect.left, right: titleRect.right, top: titleRect.top, bottom: titleRect.bottom },
            copy: { left: copyRect.left, right: copyRect.right, top: copyRect.top, bottom: copyRect.bottom },
            titleDisplay: getComputedStyle(title).display,
            copyDisplay: getComputedStyle(copy).display,
            scrollWidth: box.scrollWidth,
            clientWidth: box.clientWidth
          };
        });
        assert.equal(geometry.titleDisplay, "block", `${viewport.name}/${locale} title uses its own row`);
        assert.equal(geometry.copyDisplay, "block", `${viewport.name}/${locale} description uses its own row`);
        assert.ok(geometry.title.bottom < geometry.copy.top, `${viewport.name}/${locale} title and description overlap: ${JSON.stringify(geometry)}`);
        assert.ok(geometry.title.left >= geometry.box.left && geometry.title.right <= geometry.box.right, `${viewport.name}/${locale} title escapes warning box: ${JSON.stringify(geometry)}`);
        assert.ok(geometry.copy.left >= geometry.box.left && geometry.copy.right <= geometry.box.right, `${viewport.name}/${locale} description escapes warning box: ${JSON.stringify(geometry)}`);
        assert.ok(geometry.scrollWidth <= geometry.clientWidth, `${viewport.name}/${locale} warning box overflows: ${JSON.stringify(geometry)}`);
      }
      await assertNoHorizontalOverflow(page);
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
      const fieldTab = page.locator("#rdFieldRoomTabs .rd-field-room").nth(1);
      const fieldRailOverflows = await page.locator("#rdFieldRoomTabs").evaluate(el => el.scrollWidth > el.clientWidth);
      assert.equal(fieldRailOverflows, viewport.width < 650, "field room rail should scroll only when its natural content exceeds the viewport");
      await activate(fieldTab, viewport);
      assert.equal(await fieldTab.getAttribute("aria-selected"), "true", "touching a room tab selects that room");
      const liveTab = page.locator("#rdLiveRoomTabs .rd-live-room-tab").nth(1);
      const liveRailOverflows = await page.locator("#rdLiveRoomTabs").evaluate(el => el.scrollWidth > el.clientWidth);
      assert.equal(liveRailOverflows, viewport.width < 650, "live room rail should scroll only when its natural content exceeds the viewport");
      await activate(liveTab, viewport);
      assert.equal(await liveTab.getAttribute("aria-selected"), "true", "touching a live room tab changes the selected feed");

      const liveRefresh=page.locator("#rdLiveRefresh");
      await activate(liveRefresh,viewport);
      await page.waitForFunction(()=>{const button=document.querySelector("#rdLiveRefresh"),metric=document.querySelector("#rdMetricRefresh");return button&&!button.disabled&&metric&&(metric.textContent||"").trim()!=="—";});
      assert.equal(await liveRefresh.isEnabled(),true,"public observatory refresh returns to an enabled state after its read-only refresh");

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
      assert.equal(await page.locator(".lang-pick .sr-only").textContent(), "Arayüz dili");
      assert.equal(await page.locator("footer > span:last-child").textContent(), "Topluluk çalışması · kaynak odaklı · resmî bağlantı iddiası yok");
      assert.match(await page.locator("#rdLiveGateway [data-status]").textContent(), /Testnet model kataloğu yanıt verdi/i);
      assert.match(await page.locator("#rdLiveGateway [data-detail]").textContent(), /inference kapalıdır/i);
      await assertVisibleCopyLocale(page, "tr", `${viewport.name}/flop`);
      await page.reload();
      assert.equal(await language.inputValue(), "tr", "Turkish choice should survive reload");
      await language.selectOption("en");
      assert.equal(await page.locator("html").getAttribute("lang"), "en");
      assert.equal(await page.locator("#live-title").textContent(), "Live FLOP status");
      assert.equal(await page.locator(".lang-pick .sr-only").textContent(), "Language");
      assert.equal(await page.locator("footer > span:last-child").textContent(), "Community-built · source-first · no affiliation claim");
      await page.reload();
      assert.equal(await language.inputValue(), "en", "English choice should survive reload");
      assert.match(await page.locator("#rdLiveTestnet [data-status]").textContent(), /live · unscored/i);
      assert.match(await page.locator("#rdLiveGateway [data-status]").textContent(), /Testnet model catalog responded/i);
      assert.match(await page.locator("#rdLiveGateway [data-detail]").textContent(), /Inference stays disabled/i);
      assert.match(await page.locator("#rdLiveDevnet [data-detail]").textContent(), /administrator-assisted|administrator assistance/i);
      assert.doesNotMatch(await page.locator("#rdLiveDevnet [data-detail]").textContent(), /public self-service unavailable/);
      await assertVisibleCopyLocale(page, "en", `${viewport.name}/flop`);
      await assertNoHorizontalOverflow(page);
    } finally { await context.close(); }
  }
});

test("language changes render all panels consistently across reloads and in-flight status refreshes", async () => {
  const { context, page } = await newPage(viewports[2], "tr");
  try {
    await page.goto(`${baseURL}/`);
    await page.locator('#rdLangSwitcher button[data-lang="en"]').click();
    await page.locator('.hero-actions .ghost-link').filter({ hasText: "Open FLOP Observatory" }).waitFor({ state: "visible" });
    assert.equal(await page.locator("html").getAttribute("lang"), "en");
    assert.equal(await page.evaluate(() => localStorage.getItem("reddragon-lang")), "en");
    await page.locator('#rdLangSwitcher button[data-lang="tr"]').click();
    await page.locator('.hero-actions .ghost-link').filter({ hasText: "FLOP Gözlemevini Aç" }).waitFor({ state: "visible" });
    assert.equal(await page.locator("html").getAttribute("lang"), "tr");
    await page.reload();
    assert.equal(await page.locator("html").getAttribute("lang"), "tr", "saved Turkish preference applies on first page boot");

    let releaseStatus;
    const statusGate = new Promise(resolve => { releaseStatus = resolve; });
    await context.unroute("**/api/flop-status");
    await context.route("**/api/flop-status", async route => {
      await statusGate;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(freshStatusFixture()) });
    });
    await context.unroute("**/api/relay");
    await context.route("**/api/relay", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "simulated failure" }) }));
    await page.goto(`${baseURL}/flop`);
    const language = page.locator("#rdFlopLanguage");
    assert.equal(await page.locator("html").getAttribute("lang"), "tr");
    await language.selectOption("en");
    assert.equal(await page.evaluate(() => localStorage.getItem("reddragon-lang")), "en");
    await expectCapacityMessage(page, "en", "The live source returned HTTP 503.");
    releaseStatus();
    await page.waitForFunction(() => document.querySelector("#rdLiveTestnet [data-status]")?.textContent.includes("Live · unscored"));
    assert.equal(await page.locator("html").getAttribute("lang"), "en", "late live data uses current locale");
    await language.selectOption("tr");
    await expectCapacityMessage(page, "tr", "Canlı kaynak HTTP 503 yanıtı verdi.");
    await page.reload();
    assert.equal(await language.inputValue(), "tr", "the final choice persists across reload");
    await expectCapacityMessage(page, "tr", "Canlı kaynak HTTP 503 yanıtı verdi.");
  } finally { await context.close(); }
});

async function expectCapacityMessage(page, lang, phrase) {
  await page.waitForFunction(({ lang, phrase }) => document.documentElement.lang === lang && document.getElementById("rdTcStatus")?.textContent.includes(phrase), { lang, phrase });
  const text = await page.locator("#rdTcStatus").textContent();
  assert.match(text, new RegExp(lang === "tr" ? "Canlı okuma aksadı" : "Live read degraded"));
}


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
        if (viewport.isMobile && browserName !== "firefox") await langButton.tap(); else await langButton.click();
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
      const backupContents = await readFile(backupPath);
      const encryptedBackup = JSON.parse(backupContents.toString("utf8"));
      assert.equal(encryptedBackup.format, "reddragon-technocore-identity");
      assert.equal(encryptedBackup.did, did);
      assert.ok(encryptedBackup.ciphertextB64u && encryptedBackup.saltB64u && encryptedBackup.ivB64u);
      let promptText = "";
      const promptEvent = page.waitForEvent("dialog", { timeout: 8_000 }).catch(() => null);
      const fileChooserEvent = page.waitForEvent("filechooser");
      await activate(page.locator("label.filebtn").filter({ has: page.locator("#restoreInput") }), viewport);
      const fileChooser = await fileChooserEvent;
      await fileChooser.setFiles({ name: backup.suggestedFilename(), mimeType: "application/json", buffer: backupContents });
      const restorePrompt = await promptEvent;
      if (!restorePrompt) {
        const evidence = await page.evaluate(() => ({ files: document.querySelector("#restoreInput")?.files?.length || 0, fileName: document.querySelector("#restoreInput")?.files?.[0]?.name || "", toast: document.querySelector("#toast")?.textContent || "" }));
        assert.fail(`restore prompt did not open after choosing a valid encrypted backup: ${JSON.stringify(evidence)}`);
      }
      promptText = restorePrompt.message();
      await restorePrompt.accept("ephemeral-browser-only-password");
      const restoredText = locale === "tr" ? "Şifreli kimlik yedeği doğrulandı · DID + private key geri yüklendi" : "Encrypted identity backup verified · DID + private key restored";
      await page.waitForFunction(expected => (document.querySelector("#toast")?.textContent || "").trim() === expected, restoredText, { timeout: 12_000 });
      assert.equal((await page.locator("#toast").textContent()).trim(), restoredText, "encrypted backup should decrypt, restore, and show the localized completion message");
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

test("candidate X share copies localized text without opening X or writing externally", { timeout: 90000 }, async () => {
  for (const locale of ["en", "tr"]) {
    const { context, page } = await newPage(viewports[0], locale);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
      await page.goto(`${baseURL}/`);
      await page.waitForFunction(expected => document.documentElement.lang === expected, locale);
      await page.locator("#createBtn").waitFor({ state: "visible" });
      await page.locator("#pass1").fill("ephemeral-browser-only-password");
      await page.locator("#pass2").fill("ephemeral-browser-only-password");
      await page.locator("#createBtn").click();
      await page.waitForFunction(() => (document.querySelector("#identityOut")?.textContent || "").includes("did:key:z6Mk"), null, { timeout: 35000 });
      const did = (await page.locator("#identityOut").textContent()).split("\n")[0].trim();

      await page.locator("#clink").fill("https://example.test/red-dragon-contribution");
      await page.locator("#ctitle").fill("Ephemeral browser audit contribution");
      await page.locator("#contribBtn").click();
      await page.waitForFunction(expected => (document.querySelector("#contribOut")?.textContent || "").includes(expected), locale === "tr" ? "İmzalı katkı" : "Signed contribution");
      const shareButton = page.locator("#xShare");
      assert.equal(await shareButton.isEnabled(), true, "a recorded contribution enables X sharing");
      assert.equal((await shareButton.textContent()).trim(), locale === "tr" ? "X'te paylaş" : "Share on X");

      const unexpectedPopups = [];
      const pageCountBeforeShare = context.pages().length;
      page.on("popup", popup => unexpectedPopups.push(popup));
      await shareButton.click();
      const expectedStart = locale === "tr"
        ? "Technocore ajan kimliğimi oluşturdum ve faydalı bir katkı yayımladım"
        : "Built my Technocore agent identity and published a useful contribution";
      await page.waitForFunction(async expected => (await navigator.clipboard.readText()).includes(expected), expectedStart);
      const text = await page.evaluate(() => navigator.clipboard.readText());
      assert.ok(text.includes(expectedStart), `${locale} clipboard share has the correct localized intro`);
      assert.ok(text.includes(did), `${locale} share contains the public DID`);
      assert.ok(text.includes("https://example.test/red-dragon-contribution"), `${locale} share contains the contribution URL`);
      assert.match(text, /#Technocore #FLOP/);
      assert.deepEqual(unexpectedPopups, [], `${locale} clipboard share must not open a popup`);
      assert.equal(context.pages().length, pageCountBeforeShare, `${locale} clipboard share must not create a new page`);
      assert.deepEqual(errors, [], `${locale} X share should not throw a browser exception`);
    } finally { await context.close(); }
  }
});

test("wallet balance, recent transfers, older blocks, forget action and locale work with an injected wallet and mocked read-only chain", { timeout: 180000 }, async () => {
  await cryptoWaitReady();
  for (const viewport of viewports) for (const locale of ["en", "tr"]) {
    const { context, page } = await newPage(viewport, locale, { record: viewport.name === "desktop" && locale === "en" });
    const keyring = new Keyring({ type: "sr25519" });
    const pairs = [keyring.addFromMnemonic(mnemonicGenerate()), keyring.addFromMnemonic(mnemonicGenerate())];
    const pairsByAddress = new Map(pairs.map(pair => [pair.address, pair]));
    await context.route("**/flop-wallet-chain.bundle.js", route => route.fulfill({
      status: 200, contentType: "text/javascript", body: `
        globalThis.__walletMockCalls = { connect: 0, history: 0, disconnect: 0 };
        globalThis.RedDragonFlopReadOnly = Object.freeze({
          async connect(address) { globalThis.__walletMockCalls.connect++; return { balance: address === ${JSON.stringify(pairs[0].address)} ? "12.5" : "7.25", genesis: "0x918abd58fb16306b30ef3886514cfaebffecb4de43e82b6f8ec4795c43cfd800", specVersion: 1014039 }; },
          async readTransfers(address, before) { globalThis.__walletMockCalls.history++; return before == null ? { finalizedHeight: 250, scannedFrom: 250, scannedTo: 226, nextBeforeHeight: 225, rows: [{ block: 248, direction: "in", amount: address === ${JSON.stringify(pairs[0].address)} ? "12.5" : "7.25", txHash: "0x${"a".repeat(64)}" }] } : { finalizedHeight: 250, scannedFrom: 225, scannedTo: 201, nextBeforeHeight: 200, rows: [{ block: 220, direction: "out", amount: "1", txHash: "0x${"b".repeat(64)}" }] }; },
          async disconnect() { globalThis.__walletMockCalls.disconnect++; }
        });`
    }));
    await context.exposeFunction("__rdTestSignRaw", async (address, data) => {
      const bytes = Buffer.from(String(data).replace(/^0x/, ""), "hex");
      const pair = pairsByAddress.get(address);
      if (!pair) throw new Error("test signer address unavailable");
      return `0x${Buffer.from(pair.sign(bytes)).toString("hex")}`;
    });
    await context.addInitScript(addresses => {
      globalThis.injectedWeb3 = { "Mock Wallet": { enable: async () => ({
        accounts: { get: async () => addresses.map((address, index) => ({ address, meta: { source: "Mock Wallet", name: `Ephemeral test account ${index + 1}` } })) },
        signer: { signRaw: async ({ address, data }) => ({ signature: await globalThis.__rdTestSignRaw(address, data) }) }
      }) } };
    }, pairs.map(pair => pair.address));
    const errors = [];
    let faucetPosts = 0;
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => { if (request.method() === "POST" && request.url().startsWith("https://faucet.flop.network/")) faucetPosts++; });
    try {
      await page.goto(`${baseURL}/flop`);
      await activate(page.locator("#rdWalletConnect"), viewport);
      await page.locator("#rdWalletProvider").selectOption({ label: "Mock Wallet" });
      await activate(page.locator("#rdWalletConnect"), viewport);
      await page.locator("#rdWalletReadout").waitFor({ state: "visible" });
      await page.waitForFunction(() => document.querySelector("#rdWalletBalance")?.textContent.includes("12.5 FLOP"));
      await page.waitForFunction(() => document.querySelectorAll("#rdWalletHistoryList li").length === 1);
      await activate(page.locator("#rdWalletRefreshAccount"), viewport);
      await page.waitForFunction(() => globalThis.__walletMockCalls.connect === 2 && globalThis.__walletMockCalls.history === 2);
      await page.locator("#rdWalletAccount").selectOption({ index: 1 });
      await page.waitForFunction(() => document.querySelector("#rdWalletBalance")?.textContent.includes("7.25 FLOP"));
      await page.waitForFunction(() => globalThis.__walletMockCalls.connect === 3 && globalThis.__walletMockCalls.history === 3);
      await activate(page.locator("#rdWalletHistoryMore"), viewport);
      await page.waitForFunction(() => document.querySelectorAll("#rdWalletHistoryList li").length === 2);
      await page.waitForFunction(() => globalThis.__walletMockCalls.connect === 4 && globalThis.__walletMockCalls.history === 4);
      assert.equal(await page.locator("#rdPrepareClaim").isEnabled(), true, "a current official-status fixture enables local signature preparation");
      await activate(page.locator("#rdPrepareClaim"), viewport);
      await page.locator("#rdClaimOutput").waitFor({ state: "visible" });
      const signedRequest = JSON.parse(await page.locator("#rdClaimPayload").inputValue());
      const signedMessage = await page.locator("#rdClaimMessage").textContent();
      assert.ok(signedMessage.includes(pairs[1].address));
      assert.equal(signatureVerify(signedMessage, signedRequest.signature, pairs[1].address).isValid, true, "ephemeral sr25519 wallet produces a cryptographically valid claim signature");
      assert.equal(await page.locator("#rdClaimOutput a").getAttribute("href"), "https://docs.flop.network/docs/testnet-and-timeline");
      await activate(page.locator("#rdCopyClaim"), viewport);
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), await page.locator("#rdClaimPayload").inputValue());
      await activate(page.locator("#rdCopyClaimCommand"), viewport);
      assert.match(await page.evaluate(() => navigator.clipboard.readText()), /https:\/\/faucet\.flop\.network\/v1\/testnet\/agent-claims/);
      assert.equal(faucetPosts, 0, "the site prepares but never submits a faucet request");
      await page.locator("#rdFlopLanguage").selectOption(locale);
      assert.equal((await page.locator("#rdWalletHistoryTitle").textContent()).trim(), locale === "tr" ? "Son transferler" : "Recent transfers");
      assert.match(await page.locator("#rdWalletHistoryCoverage").textContent(), locale === "tr" ? /Yalnızca son kesinleşmiş bloklar/ : /Recent finalized blocks only/);
      await assertNoHorizontalOverflow(page);
      const calls = await page.evaluate(() => globalThis.__walletMockCalls);
      assert.equal(calls.connect, 4, "connect, refresh, account switch and older-page load all refresh the balance");
      assert.equal(calls.history, 4);
      const disconnectsBeforeForget = calls.disconnect;
      await activate(page.locator("#rdWalletForget"), viewport);
      await page.locator("#rdWalletReadout").waitFor({ state: "hidden" });
      assert.equal(await page.evaluate(() => globalThis.__walletMockCalls.disconnect), disconnectsBeforeForget + 1);
      assert.deepEqual(errors, [], `${viewport.name}/${locale} page errors`);
    } finally { await context.close(); }
  }
});
