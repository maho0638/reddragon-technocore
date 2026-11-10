// Live site acceptance audit: external writes are intercepted, no real signing or posting.
// Browser-only DID generation uses an ephemeral test identity; no keys are uploaded or logged.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, after, test } from "node:test";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const ORIGIN = "https://reddragon-technocore.vercel.app";
const DIDS = [
  "did:key:z6MkuhrsP4tDZjWYdZLPxaur19WvrF1yuLGsGB2S8Q1gwS6K",
  "did:key:z6MkqEhk421dSv8pEnDvWVPatEMegY2RgXU2ksDw5pbUbU48"
];
const sizes = [
  { name: "desktop", width: 1440, height: 900, mobile: false },
  { name: "mobile", width: 390, height: 844, mobile: true },
  { name: "small-mobile", width: 320, height: 740, mobile: true }
];
let browser;
let visibleControls = 0;
let testedActions = 0;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); console.log("[QA] visible controls enumerated across pages: " + visibleControls + "; explicit action checks: " + testedActions + ". Inventory is NOT proof that every external action succeeded."); });
async function pageFor(size) {
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, isMobile: size.mobile, hasTouch: size.mobile, permissions: ["clipboard-read", "clipboard-write"], acceptDownloads: true });
  // Only test data; no persistent test identities or real relay writes.
  await context.addInitScript(() => { try { localStorage.clear(); } catch {} });
  await context.route("**/api/relay", async route => {
    let body = {};
    try { body = JSON.parse(route.request().postData() || "{}"); } catch {}
    const responses = {
      health: { ok: true, technocore: true }, rooms: { rooms: [], total: 0, notes: {}, engagement: {} },
      config: {}, read: { messages: [], next: null }, kvGet: { value: null }
    };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(responses[body.action] || { ok: true, seq: 2468, posted: { seq: 2468 } }) });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  return { context, page };
}
async function overflow(page, name) {
  const x = await page.evaluate(() => ({ inner: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(x.scroll <= x.inner + 1, name + ": horizontal overflow " + JSON.stringify(x));
}
async function inventory(page, name) {
  const items = await page.locator("button, a[href], select, input:not([type=hidden]), textarea").evaluateAll(nodes => nodes.filter(n => n.getClientRects().length).map(n => ({tag: n.tagName, id: n.id, text: (n.textContent || "").trim().slice(0, 45), href: n.tagName === "A" ? n.getAttribute("href") : null })));
  visibleControls += items.length;
  console.log("[QA] " + name + " visible controls: " + JSON.stringify(items));
  assert.deepEqual(items.filter(x => x.tag === "A" && (!x.href || /^(javascript|data):/i.test(x.href))), [], name + " unsafe/empty links");
}
async function ready(page, selector) { await page.locator(selector).first().waitFor({ state: "visible", timeout: 30000 }); }
test("public production HTTP/JSON read-only health", { timeout: 90000 }, async () => {
  for (const path of ["/", "/flop", "/flop-source-status.json", "/api/flop-status", "/assets/reddragon.jpg"]) {
    const r = await fetch(ORIGIN + path, { signal: AbortSignal.timeout(30000), redirect: "manual" });
    assert.equal(r.status, 200, path + " returned HTTP " + r.status);
    if (path === "/api/flop-status") {
      const j = await r.json();
      assert.equal(j.schema, "reddragon-flop-live-status/v1");
      assert.notEqual(j.testnet?.state, "live", "unconfirmed testnet must not be shown live");
      console.log("[QA] API says testnet: " + j.testnet?.state + ", checked: " + j.checkedAt);
    } else if (path === "/flop-source-status.json") {
      const j = await r.json();
      assert.equal(j.project?.independentCommunityTool, true);
      assert.equal(j.project?.affiliatedWithFlopLabs, false);
    } else await r.arrayBuffer();
    console.log("[QA] HTTP 200 " + path); testedActions++;
  }
  const relayGet = await fetch(ORIGIN + "/api/relay", { method: "GET", signal: AbortSignal.timeout(15000) });
  assert.equal(relayGet.status, 405, "relay GET not denied");testedActions++;
});
test("home and FLOP links, menus, languages, refresh, desktop + two mobile widths", { timeout: 180000 }, async () => {
  for (const size of sizes) {
    const { context, page } = await pageFor(size);
    const errors = []; page.on("pageerror", e => errors.push(e.message));
    try {
      await page.goto(ORIGIN + "/", { waitUntil: "domcontentloaded" });
      await ready(page, "#steps .step-chip");
      await ready(page, "#rdTestnetToolkit");
      await inventory(page, "home-" + size.name);
      assert.equal(await page.locator("#steps .step-chip").count(), 11);
      for (let n = 1; n <= 11; n++) {
        await page.locator("#steps [data-stepchip='" + n + "']").click();
        assert.equal(await page.locator("[data-step='" + n + "']").count(), 1);
        testedActions++;
      }
      await ready(page, "#rdLangSwitcher");
      await page.locator("#rdLangSwitcher button[data-lang='en']").click();
      await page.waitForFunction(() => document.documentElement.lang === "en");
      await page.locator("#rdLangSwitcher button[data-lang='tr']").click();
      await page.waitForFunction(() => document.documentElement.lang === "tr");testedActions += 2;
      await overflow(page, "home-" + size.name);
      await page.locator("a[href='/flop']").first().click();
      await page.waitForURL(/\/flop\/?$/);
      await ready(page, "#flop-live-status");testedActions++;
      await inventory(page, "flop-" + size.name);
      await page.locator("#rdFlopLanguage").selectOption("tr");
      await page.waitForFunction(() => document.documentElement.lang === "tr");
      await page.locator("#rdFlopLanguage").selectOption("en");
      await page.waitForFunction(() => document.documentElement.lang === "en");testedActions += 2;
      await page.locator("#rdRefreshStatus").click();
      await page.waitForFunction(() => !document.querySelector("#rdRefreshStatus")?.disabled, null, {timeout:35000});testedActions++;
      await overflow(page, "flop-" + size.name);
      await page.locator("a[href='/']").first().click();
      await page.waitForURL(ORIGIN + "/");testedActions++;
      assert.deepEqual(errors, [], size.name + " JS exceptions");
      console.log("[QA] PASS navigation and responsive layout " + size.name);
    } finally { await context.close(); }
  }
});
test("local identity, validation and signed UI workflows with mocked relay (NO external writes)", { timeout: 180000 }, async () => {
  const { context, page } = await pageFor(sizes[0]);
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  try {
    await page.goto(ORIGIN + "/", { waitUntil: "domcontentloaded" });
    await ready(page, "#createBtn");
    assert.equal(await page.locator("#publishDidBtn").isDisabled(), true);
    await page.locator("#pass1").fill("short");
    await page.locator("#pass2").fill("short");
    await page.locator("#createBtn").click();
    assert.match(await page.locator("#toast").textContent(), /12/);testedActions++;
    await page.locator("#pass1").fill("ephemeral-ui-audit-only-password");
    await page.locator("#pass2").fill("ephemeral-ui-audit-only-password");
    await page.locator("#createBtn").click();
    await page.waitForFunction(() => (document.querySelector("#identityOut")?.textContent || "").includes("did:key:z6Mk"), null, {timeout:35000});
    assert.equal(await page.locator("#publishDidBtn").isEnabled(),true);testedActions++;
    const workflows = [
      ["#publishDidBtn","#didNoteOut","Published"],
      ["#helloBtn","#helloOut","Signed"],
      ["#introBtn","#introOut","Lobby introduction"],
      ["#openRoomBtn","#publicRoomOut","Opened"],
      ["#privateRoomBtn","#privateRoomOut","p-"],
      ["#styleBtn","#styleOut","profile"]
    ];
    for (const [btn, out, expected] of workflows) {
      await page.locator(btn).click();
      await page.waitForFunction(arg => (document.querySelector(arg.out)?.textContent || "").toLowerCase().includes(arg.expected.toLowerCase()),{out,expected});
      testedActions++;console.log("[QA] mocked write flow " + btn + ": UI progressed");
    }
    await page.locator("#clink").fill("https://github.com/maho0638/reddragon-technocore");
    await page.locator("#ctitle").fill("Ephemeral browser audit contribution");
    await page.locator("#contribBtn").click();
    await page.waitForFunction(() => (document.querySelector("#contribOut")?.textContent || "").includes("Signed contribution"));
    assert.equal(await page.locator("#downloadProof").isEnabled(),true);testedActions++;
    page.once("dialog",d=>d.accept());
    await page.locator("#resetBtn").click();
    await page.waitForLoadState("domcontentloaded");
    assert.equal(await page.locator("#publishDidBtn").isDisabled(),true);testedActions++;
    assert.deepEqual(errors,[],"DID workflow browser exceptions");
    console.log("[QA] PASS local WebCrypto DID generation and mocked write buttons; no live write");
  } finally { await context.close(); }
});
test("user-specific ledger, calculators and panel controls (desktop and mobile)", { timeout: 180000 }, async () => {
  for(const size of sizes.slice(0,2)){
    const {context,page}=await pageFor(size);
    const errors=[];page.on("pageerror",e=>errors.push(e.message));
    try{
      await page.goto(ORIGIN+"/",{waitUntil:"domcontentloaded"});
      await ready(page,"#rdLedgerDid");
      const did=page.locator("#rdLedgerDid");
      await did.fill(DIDS[0]);
      await page.locator("#rdFaucetAmount").fill("0.25");
      await page.locator("#rdFaucetRef").fill("audit-local-a");
      await page.locator("#rdRecordFaucet").click();
      assert.match(await page.locator("#rdLedgerRows").textContent(),/audit-local-a/);testedActions++;
      await did.fill(DIDS[1]);
      assert.doesNotMatch(await page.locator("#rdLedgerRows").textContent(),/audit-local-a/);
      await page.locator("#rdInferenceAmount").fill("1.5");
      await page.locator("#rdInferenceRef").fill("audit-local-b");
      await page.locator("#rdRecordInference").click();
      assert.match(await page.locator("#rdLedgerRows").textContent(),/audit-local-b/);testedActions++;
      await did.fill(DIDS[0]);
      assert.match(await page.locator("#rdLedgerRows").textContent(),/audit-local-a/);testedActions++;
      for(const [id,value] of [["#rdSpendAllocation","1200"],["#rdSpendAmount","500"],["#rdMinerVram","24"],["#rdValCores","16"],["#rdValRam","128"]]) {
        await page.locator(id).fill(value);testedActions++;
      }
      const download=page.waitForEvent("download");
      await page.locator("#rdExportLedger").click();
      const file=await download;
      assert.match(file.suggestedFilename(),/ledger|flop/i);testedActions++;
      page.once("dialog",d=>d.accept());
      await page.locator("#rdClearLedger").click();
      assert.doesNotMatch(await page.locator("#rdLedgerRows").textContent(),/audit-local-a/);testedActions++;
      for(const selector of ["#rdTclkRefresh","#rdProvRefresh","#rdVerifyButton","#rdMailboxRefresh"]){
        if(await page.locator(selector).isVisible()){await page.locator(selector).click();testedActions++;}
        else console.log("[QA] unavailable/hidden panel button " + selector);
      }
      await overflow(page,"toolkit-"+size.name);
      assert.deepEqual(errors,[],size.name+" JS exceptions");
      console.log("[QA] PASS DID-isolated storage, calculators, export/clear and panel buttons " + size.name);
    }finally{await context.close();}
  }
});
