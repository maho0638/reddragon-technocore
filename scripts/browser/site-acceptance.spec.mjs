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
  { name: "tablet", width: 768, height: 900, mobile: true },
  { name: "mobile", width: 390, height: 844, mobile: true },
  { name: "small-mobile", width: 320, height: 740, mobile: true }
];
let browser;
let visibleControls = 0;
let testedActions = 0;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); console.log("[QA] visible controls enumerated across pages: " + visibleControls + "; explicit action checks: " + testedActions + ". Inventory is NOT proof that every external action succeeded."); });
async function pageFor(size) {
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, locale: "en-US", isMobile: size.mobile, hasTouch: size.mobile, permissions: ["clipboard-read", "clipboard-write"], acceptDownloads: true });
  // Only test data; no persistent test identities or real relay writes.
  await context.addInitScript(() => { try { if (!sessionStorage.getItem("__rdAcceptanceInitialized")) { localStorage.clear(); sessionStorage.setItem("__rdAcceptanceInitialized", "1"); } } catch {} });
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
async function activate(locator, size) { if(size.mobile) await locator.tap(); else await locator.click(); }
async function overflow(page, name) {
  const x = await page.evaluate(() => {
    const inner = document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll("body *")].map(n => { const r=n.getBoundingClientRect();return {tag:n.tagName.toLowerCase(),id:n.id,className:typeof n.className==="string"?n.className.slice(0,100):"",text:(n.innerText||n.textContent||"").trim().replace(/\s+/g," ").slice(0,90),left:Math.round(r.left),right:Math.round(r.right),width:Math.round(r.width),scrollWidth:n.scrollWidth}; }).filter(n=>n.width&&(n.left < -1||n.right>inner+1)).slice(0,25);
    return {inner,scroll:document.documentElement.scrollWidth,offenders};
  });
  assert.ok(x.scroll <= x.inner + 1, name + ": horizontal overflow / DOM offenders " + JSON.stringify(x));
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
      await ready(page, "#rdTclkWorkbench");
      const deployedI18n = await page.evaluate(() => window.RD_I18N?.audit?.() || null);
      if (deployedI18n) assert.ok(deployedI18n.catalogs >= 6, "deployed dynamic translation modules register complete TR/EN dictionaries");
      await inventory(page, "home-" + size.name);
      assert.equal(await page.locator("#steps .step-chip").count(), 11);
      for (let n = 1; n <= 11; n++) {
        await activate(page.locator("#steps [data-stepchip='" + n + "']"), size);
        const card = page.locator("[data-step='" + n + "']");
        assert.equal(await card.count(), 1);
        await page.waitForFunction(step => {
          const rect = document.querySelector(`[data-step="${step}"]`)?.getBoundingClientRect();
          return rect && rect.top < innerHeight && rect.bottom > 0;
        }, String(n));
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
      await activate(page.locator("#rdRefreshStatus"), size);
      await page.waitForFunction(() => !document.querySelector("#rdRefreshStatus")?.disabled, null, {timeout:35000});
      assert.ok((await page.locator("#rdLiveSummary").textContent()).trim().length > 0, "refresh should leave a visible source summary");testedActions++;
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
    const generatedDid = (await page.locator("#identityOut").textContent()).split("\n")[0].trim();
    const backupEvent = page.waitForEvent("download");
    await page.locator("#backupBtn").click();
    const backup = await backupEvent;
    assert.match(backup.suggestedFilename(), /reddragon-technocore-.*\.json/);testedActions++;
    const backupPath = await backup.path();
    page.once("dialog", dialog => dialog.accept("ephemeral-ui-audit-only-password"));
    await page.locator("#restoreInput").setInputFiles(backupPath);
    await page.waitForFunction(() => (document.querySelector("#identityOut")?.textContent || "").includes("did:key:z6Mk"));
    assert.equal((await page.locator("#identityOut").textContent()).split("\n")[0].trim(), generatedDid, "encrypted backup restores the same public DID");testedActions++;
    await page.locator("#copyDidBtn").click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), generatedDid);testedActions++;
    const workflows = [
      ["#publishDidBtn","#didNoteOut","Published"],
      ["#helloBtn","#helloOut","Signed"],
      ["#introBtn","#introOut","Lobby introduction"],
      ["#openRoomBtn","#publicRoomOut","Opened"],
      ["#privateRoomBtn","#privateRoomOut","p-"],
      ["#styleBtn","#styleOut","profile"]
    ];
    for (const [btn, out, expected] of workflows) {
      await activate(page.locator(btn), sizes[0]);
      await page.waitForFunction(arg => (document.querySelector(arg.out)?.textContent || "").toLowerCase().includes(arg.expected.toLowerCase()),{out,expected});
      testedActions++;console.log("[QA] mocked write flow " + btn + ": UI progressed");
    }
    await page.locator("#clink").fill("https://github.com/maho0638/reddragon-technocore");
    await page.locator("#ctitle").fill("Ephemeral browser audit contribution");
    await page.locator("#contribBtn").click();
    await page.waitForFunction(() => (document.querySelector("#contribOut")?.textContent || "").includes("Signed contribution"));
    assert.equal(await page.locator("#downloadProof").isEnabled(),true);testedActions++;
    const proofDownloadEvent = page.waitForEvent("download");
    await page.locator("#downloadProof").click();
    assert.match((await proofDownloadEvent).suggestedFilename(), /reddragon-proof-.*\.json/);testedActions++;
    await page.locator("#copyProof").click();
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /"did":\s*"did:key:z6Mk/);testedActions++;
    await page.locator("#xShare").click();
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /#Technocore #FLOP/);testedActions++;
    await page.locator("#copyAutoGuide").click();
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /TECHNOCORE_PRIVATE_KEY_PKCS8_B64/);testedActions++;
    page.once("dialog",d=>d.accept());
    await page.locator("#resetBtn").click();
    await page.waitForLoadState("domcontentloaded");
    assert.equal(await page.locator("#publishDidBtn").isDisabled(),true);testedActions++;
    assert.deepEqual(errors,[],"DID workflow browser exceptions");
    console.log("[QA] PASS local WebCrypto DID generation and mocked write buttons; no live write");
  } finally { await context.close(); }
});
test("user-specific ledger, calculators and panel controls (desktop and mobile)", { timeout: 180000 }, async () => {
  for(const size of sizes){
    const {context,page}=await pageFor(size);
    const errors=[];page.on("pageerror",e=>errors.push(e.message));
    try{
      await page.goto(ORIGIN+"/",{waitUntil:"domcontentloaded"});
      await ready(page,"#rdLedgerDid");
      const did=page.locator("#rdLedgerDid");
      await did.fill(DIDS[0]);
      await page.locator("#rdFaucetAmount").fill("0.25");
      await page.locator("#rdFaucetRef").fill("audit-local-a");
      await activate(page.locator("#rdRecordFaucet"),size);
      assert.match(await page.locator("#rdLedgerRows").textContent(),/audit-local-a/);testedActions++;
      await did.fill(DIDS[1]);
      assert.doesNotMatch(await page.locator("#rdLedgerRows").textContent(),/audit-local-a/);
      await page.locator("#rdInferenceAmount").fill("1.5");
      await page.locator("#rdInferenceRef").fill("audit-local-b");
      await activate(page.locator("#rdRecordInference"),size);
      assert.match(await page.locator("#rdLedgerRows").textContent(),/audit-local-b/);testedActions++;
      await did.fill(DIDS[0]);
      assert.match(await page.locator("#rdLedgerRows").textContent(),/audit-local-a/);testedActions++;
      for(const [id,value] of [["#rdSpendAllocation","1200"],["#rdSpendAmount","500"],["#rdMinerVram","24"],["#rdValCores","16"],["#rdValRam","128"]]) {
        await page.locator(id).fill(value);testedActions++;
      }
      assert.equal(await page.locator("#rdSpendResult").getAttribute("data-state"),"warn","partial spend must remain below the modeled threshold");
      assert.equal(await page.locator("#rdSpendRequired").textContent(),"900");
      assert.equal(await page.locator("#rdMinerResult").getAttribute("data-state"),"ok");
      assert.match(await page.locator("#rdMinerResult b").textContent(),/meets|karşılıyor/i);
      assert.equal(await page.locator("#rdValidatorResult").getAttribute("data-state"),"ok");
      assert.equal(await page.locator("#rdValidatorResult small").textContent(),"4/4");
      testedActions+=6;
      const download=page.waitForEvent("download");
      await activate(page.locator("#rdExportLedger"),size);
      const file=await download;
      assert.match(file.suggestedFilename(),/ledger|flop/i);testedActions++;
      page.once("dialog",d=>d.accept());
      await activate(page.locator("#rdClearLedger"),size);
      assert.doesNotMatch(await page.locator("#rdLedgerRows").textContent(),/audit-local-a/);testedActions++;
      await page.locator("#rdTclkRefresh").waitFor({state:"visible"});
      await page.waitForFunction(() => !document.querySelector("#rdTclkRefresh")?.disabled);
      await activate(page.locator("#rdTclkRefresh"),size);
      await page.waitForFunction(() => !document.querySelector("#rdTclkRefresh")?.disabled);
      assert.match(await page.locator("#rdTclkStatus").textContent(),/waiting|partial|verified|bekliyor|kısmi|doğrulandı/i);testedActions++;

      await page.locator("#rdProvRefresh").waitFor({state:"visible"});
      await activate(page.locator("#rdProvRefresh"),size);
      await page.waitForFunction(() => !document.querySelector("#rdProvRefresh")?.disabled);
      assert.match(await page.locator("#rdProvSummary").textContent(),/chain|proof|kanıt|Technocore/i);testedActions++;

      await page.locator("#rdProvFixRefresh").waitFor({state:"visible"});
      await page.waitForFunction(() => !document.querySelector("#rdProvFixRefresh")?.disabled);
      await activate(page.locator("#rdProvFixRefresh"),size);
      await page.waitForFunction(() => !document.querySelector("#rdProvFixRefresh")?.disabled);
      assert.match(await page.locator("#rdProvFixSummary").textContent(),/proof|kanıt|verified|doğrulanamadı/i);testedActions++;

      await page.locator("#rdMailboxRefresh").waitFor({state:"visible"});
      await activate(page.locator("#rdMailboxRefresh"),size);
      await page.waitForFunction(() => (document.querySelector("#rdMailboxList")?.textContent || "").trim().length > 0);
      assert.match(await page.locator("#rdMailboxList").textContent(),/mail|mesaj|inbox|posta/i);testedActions++;
      await page.locator("#rdVerifyRoom").fill("invalid room");
      await activate(page.locator("#rdVerifyButton"),size);
      assert.match(await page.locator("#rdVerifyResult").textContent(),/valid d-|geçerli bir d-/i);testedActions++;
      await activate(page.locator("#rdCopyMailbox"),size);
      assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),"mb-reddragon-agent");testedActions++;
      await overflow(page,"toolkit-"+size.name);
      assert.deepEqual(errors,[],size.name+" JS exceptions");
      console.log("[QA] PASS DID-isolated storage, calculators, export/clear and panel buttons " + size.name);
    }finally{await context.close();}
  }
});
