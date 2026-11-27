// Local preview acceptance audit: external writes are intercepted, no real posting.
// Browser-only DID generation uses an ephemeral test identity; no keys are uploaded or logged.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { before, after, test } from "node:test";
const require = createRequire(import.meta.url);
const { chromium, firefox, webkit } = require("playwright");
const browserName = process.env.PLAYWRIGHT_BROWSER || "chromium";
const browserType = { chromium, firefox, webkit }[browserName];
assert.ok(browserType, `Unsupported PLAYWRIGHT_BROWSER: ${browserName}`);
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
let previewServer;
let LOCAL_ORIGIN;
let visibleControls = 0;
let testedActions = 0;
let serverStdout = "";
let serverStderr = "";
before(async () => {
  const supplied = process.env.SITE_ACCEPTANCE_ORIGIN;
  if (supplied) {
    const url = new URL(supplied);
    assert.equal(url.protocol, "http:", "E2E origin must be local HTTP");
    assert.ok(["127.0.0.1", "localhost"].includes(url.hostname), "E2E may only target loopback, never production");
    LOCAL_ORIGIN = url.origin;
    assert.equal((await fetch(LOCAL_ORIGIN)).ok, true, "shared local preview must be reachable");
  } else {
    const port = 43_000 + Math.floor(Math.random() * 1_000);
    LOCAL_ORIGIN = `http://127.0.0.1:${port}`;
    previewServer = spawn(process.execPath, ["scripts/local-preview-server.mjs"], {
      cwd: process.cwd(), env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"]
    });
    previewServer.stdout.setEncoding("utf8").on("data", part => { serverStdout += part; });
    previewServer.stderr.setEncoding("utf8").on("data", part => { serverStderr += part; });
    const deadline = Date.now() + 8_000;
    let localReady = false;
    while (Date.now() < deadline) {
      if (previewServer.exitCode !== null) throw new Error(`Local preview exited (${previewServer.exitCode ?? previewServer.signalCode}): ${serverStderr || serverStdout}`);
      try {
        if ((await fetch(LOCAL_ORIGIN, { signal: AbortSignal.timeout(500) })).ok) { localReady = true; break; }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!localReady) throw new Error(`Local preview did not become ready: ${serverStderr || serverStdout}`);
  }
  const executablePath = process.env[`PLAYWRIGHT_${browserName.toUpperCase()}_EXECUTABLE_PATH`];
  browser = await browserType.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
});
after(async () => {
  await browser?.close();
  if (previewServer && previewServer.exitCode === null) {
    previewServer.kill("SIGTERM");
    await new Promise(resolve => {
      previewServer.once("exit", resolve);
      setTimeout(resolve, 2_000).unref();
    });
  }
  console.log("[QA] local E2E controls: " + visibleControls + "; explicit checks: " + testedActions + ". Writes are mocked.");
});
async function pageFor(size) {
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, locale: "en-US", ...(browserName === "firefox" ? {} : { isMobile: size.mobile, hasTouch: size.mobile }), ...(browserName === "chromium" ? { permissions: ["clipboard-read", "clipboard-write"] } : {}), acceptDownloads: true });
  if (browserName !== "chromium") await context.addInitScript(() => {
    let copied = "";
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async text => { copied = String(text); }, readText: async () => copied } });
  });
  // Only test data; no persistent test identities or real relay writes.
  await context.addInitScript(() => { try { if (!sessionStorage.getItem("__rdAcceptanceInitialized")) { localStorage.clear(); sessionStorage.setItem("__rdAcceptanceInitialized", "1"); } } catch {} });
  const relayCalls = [];
  await context.route("**/api/relay", async route => {
    let body = {};
    try { body = JSON.parse(route.request().postData() || "{}"); } catch {}
    relayCalls.push(body);
    const responses = {
      health: { ok: true, technocore: true }, rooms: { rooms: [], total: 0, notes: {}, engagement: {} },
      config: {}, read: { messages: [], next: null }, kvGet: { value: null }
    };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(responses[body.action] || { ok: true, seq: 2468, posted: { seq: 2468 } }) });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  return { context, page, relayCalls };
}
async function activate(locator, size) { if(size.mobile && browserName !== "firefox") await locator.tap(); else await locator.click(); }
async function overflow(page, name) {
  const x = await page.evaluate(() => {
    const inner = document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll("body *")].map(n => { const r=n.getBoundingClientRect();return {tag:n.tagName.toLowerCase(),id:n.id,className:typeof n.className==="string"?n.className.slice(0,100):"",text:(n.innerText||n.textContent||"").trim().replace(/\s+/g," ").slice(0,90),left:Math.round(r.left),right:Math.round(r.right),width:Math.round(r.width),scrollWidth:n.scrollWidth}; }).filter(n=>n.width&&(n.left < -1||n.right>inner+1)).slice(0,25);
    return {inner,scroll:document.documentElement.scrollWidth,offenders};
  });
  assert.ok(x.scroll <= x.inner + 1, name + ": horizontal overflow / DOM offenders " + JSON.stringify(x));
}
async function assertResponsiveHome(page, size, expectedLanguage) {
  await page.locator("#heroDragon").evaluate(img => img.decode());
  const layout = await page.evaluate(() => {
    const rect = element => {
      const r = element?.getBoundingClientRect();
      return r && { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    };
    const root = document.documentElement;
    const hero = document.querySelector(".hero");
    const art = document.querySelector(".hero-art");
    const image = document.querySelector("#heroDragon");
    const warning = document.querySelector("[data-step='11'] .warning-box");
    const title = warning?.querySelector("b");
    const copy = warning?.querySelector("span");
    const responsiveLink = [...document.querySelectorAll("head link[rel='stylesheet']")]
      .find(link => new URL(link.href).pathname === "/responsive-fixes.css");
    return {
      lang: root.lang,
      viewport: { clientWidth: root.clientWidth, scrollWidth: root.scrollWidth, innerWidth },
      responsiveCss: { inHead: !!responsiveLink, loaded: !!responsiveLink?.sheet },
      hero: {
        container: rect(hero),
        gridColumns: getComputedStyle(hero).gridTemplateColumns,
        art: { ...rect(art), cssWidth: getComputedStyle(art).width },
        image: { ...rect(image), cssWidth: getComputedStyle(image).width }
      },
      warning: { box: rect(warning), title: rect(title), copy: rect(copy), titleText: title?.textContent.trim() }
    };
  });
  assert.equal(layout.lang, expectedLanguage, size.name + " expected " + expectedLanguage);
  assert.match(layout.warning.titleText, expectedLanguage === "en" ? /Sustainable activity, not spam/ : /İstenmeyen ileti değil, sürdürülebilir etkinlik/, size.name + "/" + expectedLanguage + " step 11 title localization");
  assert.ok(layout.responsiveCss.inHead && layout.responsiveCss.loaded, size.name + "/" + expectedLanguage + " responsive CSS must be render-blocking and loaded");
  assert.ok(layout.hero.art.width <= layout.hero.container.width + 1, size.name + "/" + expectedLanguage + " hero art exceeds its grid track: " + JSON.stringify(layout));
  assert.ok(layout.hero.image.width <= layout.hero.art.width + 1, size.name + "/" + expectedLanguage + " heroDragon exceeds hero-art: " + JSON.stringify(layout));
  assert.ok(layout.hero.image.left >= layout.hero.art.left - 1 && layout.hero.image.right <= layout.hero.art.right + 1, size.name + "/" + expectedLanguage + " heroDragon escapes hero-art: " + JSON.stringify(layout));
  assert.ok(layout.viewport.scrollWidth <= layout.viewport.clientWidth + 1, size.name + "/" + expectedLanguage + " page horizontal overflow: " + JSON.stringify(layout));
  assert.ok(layout.warning.title.bottom <= layout.warning.copy.top + 1, size.name + "/" + expectedLanguage + " step 11 title/copy overlap: " + JSON.stringify(layout));
  for (const part of [layout.warning.title, layout.warning.copy]) {
    assert.ok(part.left >= layout.warning.box.left - 1 && part.right <= layout.warning.box.right + 1 && part.top >= layout.warning.box.top - 1 && part.bottom <= layout.warning.box.bottom + 1, size.name + "/" + expectedLanguage + " step 11 text escapes warning box: " + JSON.stringify(layout));
  }
  console.log("[QA] local preview geometry " + size.name + "/" + expectedLanguage + ": " + JSON.stringify(layout));
}
async function acceptDialogDuring(page, action, promptText) {
  const dialogHandled = page.waitForEvent("dialog", { timeout: 15000 }).then(dialog => dialog.accept(promptText));
  await Promise.all([action(), dialogHandled]);
}
async function inventory(page, name) {
  const items = await page.locator("button, a[href], select, input:not([type=hidden]), textarea").evaluateAll(nodes => nodes.filter(n => n.getClientRects().length).map(n => ({tag: n.tagName, id: n.id, text: (n.textContent || "").trim().slice(0, 45), href: n.tagName === "A" ? n.getAttribute("href") : null, target: n.tagName === "A" ? n.getAttribute("target") : null, rel: n.tagName === "A" ? (n.getAttribute("rel") || "") : "" })));
  visibleControls += items.length;
  const links = items.filter(item => item.tag === "A");
  const linkFailures = links.filter(link => !link.href || /^(javascript|data):/i.test(link.href) || (/^https:/i.test(link.href) && link.target === "_blank" && !/noopener|noreferrer/i.test(link.rel)));
  assert.deepEqual(linkFailures, [], name + " every visible link has a valid destination and safe new-tab policy");
  for (const [index, link] of links.entries()) console.log("[QA] link acceptance PASS " + name + " #" + (index + 1) + ": " + JSON.stringify({id:link.id,href:link.href,target:link.target,rel:link.rel}));
  console.log("[QA] " + name + " visible controls: " + JSON.stringify(items));
}
async function ready(page, selector) { await page.locator(selector).first().waitFor({ state: "visible", timeout: 30000 }); }
test("home and FLOP links, menus, languages, refresh, desktop + two mobile widths", { timeout: 180000 }, async () => {
  for (const size of sizes) {
    const { context, page } = await pageFor(size);
    const errors = []; page.on("pageerror", e => errors.push(e.message));
    try {
      await page.goto(LOCAL_ORIGIN + "/", { waitUntil: "domcontentloaded" });
      await ready(page, "#steps .step-chip");
      await ready(page, "#rdTestnetToolkit");
      await ready(page, "#rdTclkWorkbench");
      const deployedI18n = await page.evaluate(() => window.RD_I18N?.audit?.() || null);
      if (deployedI18n) assert.ok(deployedI18n.catalogs >= 6, "deployed dynamic translation modules register complete TR/EN dictionaries");
      await inventory(page, "home-" + size.name);
      assert.equal(await page.locator("#steps .step-chip").count(), 11);
      for (let n = 1; n <= 11; n++) {
        await page.locator("#steps [data-stepchip='" + n + "']").click();
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
      await assertResponsiveHome(page, size, "en");
      await overflow(page, "home-" + size.name + "-en");
      await page.locator("#rdLangSwitcher button[data-lang='tr']").click();
      await page.waitForFunction(() => document.documentElement.lang === "tr");
      await assertResponsiveHome(page, size, "tr");
      await overflow(page, "home-" + size.name + "-tr");
      testedActions += 2;
      const flopLink = page.locator("a[href='/flop']").first();
      if (await flopLink.isVisible()) {
        await activate(flopLink, size);
      } else {
        const heroFlopLink = page.locator(".hero-actions a[href='/flop']");
        assert.equal(await heroFlopLink.isVisible(), true, size.name + " must expose a touchable FLOP navigation CTA");
        await activate(heroFlopLink, size);
      }
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
      await page.waitForURL(LOCAL_ORIGIN + "/");testedActions++;
      assert.deepEqual(errors, [], size.name + " JS exceptions");
      console.log("[QA] PASS navigation and responsive layout " + size.name);
    } finally { await context.close(); }
  }
});
test("local identity, validation and signed UI workflows with mocked relay (NO external writes)", { timeout: 180000 }, async () => {
  const { context, page, relayCalls } = await pageFor(sizes[0]);
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  try {
    await page.goto(LOCAL_ORIGIN + "/", { waitUntil: "domcontentloaded" });
    await ready(page, "#createBtn");
    await page.locator("#rdQuickSetup").waitFor({ state: "visible" });
    await page.locator('.hero-actions [data-jump="1"]').click();
    await assert.doesNotReject(page.locator("#pass1").waitFor({ state: "visible" }));testedActions++;
    assert.equal(await page.locator("#repoBtn").getAttribute("href"), "https://github.com/maho0638/reddragon-technocore");
    assert.equal((await page.locator("#repoBtn").getAttribute("class"))?.includes("disabled-link"), false, "the repository link is activated with a real target");testedActions++;
    assert.equal(await page.locator("#publishDidBtn").isDisabled(), true);
    assert.equal(await page.locator("#copyPrivateBtn").isDisabled(), true);
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
    assert.equal(await page.locator("#copyDidSecret").isVisible(), false, "retired duplicate DID-secret control remains hidden");
    await page.locator("#steps [data-stepchip='11']").click();
    const secretCopyConfirm=page.waitForEvent("dialog").then(dialog=>dialog.accept());
    await Promise.all([page.locator("#copyKeySecret").click(),secretCopyConfirm]);
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /^[A-Za-z0-9+/=_-]{40,200}$/, "private-key secret-copy control copies only encoded ephemeral key material after confirmation");
    await page.locator("#steps [data-stepchip='1']").click();
    const backupEvent = page.waitForEvent("download");
    await page.locator("#backupBtn").click();
    const backup = await backupEvent;
    assert.match(backup.suggestedFilename(), /reddragon-technocore-.*\.json/);testedActions++;
    const backupPath = await backup.path();
    assert.ok(backupPath, "browser must provide the downloaded encrypted backup file");
    const backupContents = await readFile(backupPath);
    const encryptedBackup = JSON.parse(backupContents.toString("utf8"));
    assert.equal(encryptedBackup.format, "reddragon-technocore-identity");
    assert.ok(encryptedBackup.ciphertextB64u && encryptedBackup.saltB64u && encryptedBackup.ivB64u, "downloaded backup must contain encrypted key material");
    const restoreDialogEvent = page.waitForEvent("dialog", { timeout: 10000 }).catch(() => null);
    const fileChooserEvent = page.waitForEvent("filechooser");
    await activate(page.locator("label.filebtn").filter({ has: page.locator("#restoreInput") }), sizes[0]);
    const fileChooser = await fileChooserEvent;
    await fileChooser.setFiles({ name: backup.suggestedFilename(), mimeType: "application/json", buffer: backupContents });
    const restoreDialog = await restoreDialogEvent;
    if (!restoreDialog) {
      const evidence = await page.evaluate(() => ({ files: document.querySelector("#restoreInput")?.files?.length || 0, fileName: document.querySelector("#restoreInput")?.files?.[0]?.name || "", toast: document.querySelector("#toast")?.textContent || "" }));
      assert.fail(`restore password dialog did not open after selecting the downloaded .json backup: ${JSON.stringify(evidence)}`);
    }
    assert.match(restoreDialog.message(), /backup password|yedek parolasını/i);
    await restoreDialog.accept("ephemeral-ui-audit-only-password");
    const expectedRestoreMessage = "Encrypted identity backup verified · DID + private key restored";
    try {
      await page.waitForFunction(({ success, failure }) => {
        const toast = (document.querySelector("#toast")?.textContent || "").trim();
        return toast === success || toast === failure;
      }, { success: expectedRestoreMessage, failure: "The backup could not be opened or the password was incorrect." }, { timeout: 20000 });
    } catch (error) {
      const evidence = await page.evaluate(() => ({ language: document.documentElement.lang, toast: document.querySelector("#toast")?.textContent || "", identity: document.querySelector("#identityOut")?.textContent || "", inputFiles: document.querySelector("#restoreInput")?.files?.length || 0, inputName: document.querySelector("#restoreInput")?.files?.[0]?.name || "" }));
      assert.fail(`restore did not report success or rejection: ${JSON.stringify(evidence)}; page errors: ${JSON.stringify(errors)}; ${error.message}`);
    }
    const restoreMessage = (await page.locator("#toast").textContent()).trim();
    assert.equal(restoreMessage, expectedRestoreMessage, `encrypted restore must succeed, received: ${restoreMessage}`);
    assert.equal((await page.locator("#identityOut").textContent()).split("\n")[0].trim(), generatedDid, "encrypted backup restores the same public DID after keypair verification");testedActions++;
    await page.locator("#copyDidBtn").click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), generatedDid);testedActions++;
    await page.locator("#rdCopyPrivate").waitFor({ state: "visible" });
    await page.locator("#rdGithubUser").fill("ephemeral-audit-user");
    const privateKeyConfirm = page.waitForEvent("dialog").then(dialog => dialog.accept());
    await Promise.all([page.locator("#rdCopyPrivate").click(), privateKeyConfirm]);
    const copiedPrivateKey = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(copiedPrivateKey, /^[A-Za-z0-9+/=_-]{40,200}$/, "private-key copy action returns only encoded key material without logging it");testedActions++;
    const workflows = [
      ["#publishDidBtn","#didNoteOut","Published"],
      ["#helloBtn","#helloOut","Signed"],
      ["#introBtn","#introOut","Lobby introduction"],
      ["#openRoomBtn","#publicRoomOut","Opened"],
      ["#privateRoomBtn","#privateRoomOut","p-"],
      ["#styleBtn","#styleOut","profile"]
    ];
    for (const [btn, out, expected] of workflows) {
      if (btn === "#helloBtn") await page.locator("#helloText").fill("Control acceptance hello payload");
      if (btn === "#introBtn") {
        await page.locator("#agentName").fill("Acceptance Agent");
        await page.locator("#xhandle").fill("@acceptance");
        await page.locator("#introText").fill("Intro field acceptance payload");
      }
      if (btn === "#openRoomBtn") {
        await page.locator("#publicRoom").fill("acceptance-room");
        await page.locator("#roomTopic").fill("Acceptance topic value");
      }
      if (btn === "#styleBtn") {
        await page.locator("#displayName").fill("Acceptance Display");
        await page.locator("#profileColor").fill("#123456");
      }
      await activate(page.locator(btn), sizes[0]);
      await page.waitForFunction(arg => (document.querySelector(arg.out)?.textContent || "").toLowerCase().includes(arg.expected.toLowerCase()),{out,expected});
      if (btn === "#helloBtn") assert.ok(relayCalls.some(call => call.action === "signedPost" && call.text === "Control acceptance hello payload"), "hello textarea value reaches the signed payload");
      if (btn === "#introBtn") assert.ok(relayCalls.some(call => call.action === "signedPost" && /Acceptance Agent \(@acceptance\): Intro field acceptance payload/.test(call.text)), "agent name, X handle, and introduction fields reach the signed payload");
      if (btn === "#openRoomBtn") {
        assert.ok(relayCalls.some(call => call.action === "signedPost" && call.room === "acceptance-room"), "public room input selects the posted room");
        assert.ok(relayCalls.some(call => call.action === "kvSet" && call.ns === "topic" && call.key === "acceptance-room" && call.value === "Acceptance topic value"), "room topic input is saved to the topic record");
      }
      if (btn === "#privateRoomBtn") {
        const room = (await page.locator("#privateRoomOut").textContent()).split("\n")[0].trim();
        await page.locator("#copyPrivateBtn").click();
        assert.equal(await page.evaluate(() => navigator.clipboard.readText()), room, "private room copy control copies the generated room name");
        testedActions++;
      }
      if (btn === "#styleBtn") {
        const profileCall = relayCalls.findLast(call => call.action === "kvSet" && call.ns === "profile");
        assert.ok(profileCall, "profile button must save the style record");
        assert.equal(JSON.parse(profileCall.value).name, "Acceptance Display");
        assert.equal(JSON.parse(profileCall.value).color, "#123456");
      }
      testedActions++;console.log("[QA] mocked write flow " + btn + ": UI progressed and custom control values were asserted");
    }
    await page.locator("#xhandle").fill("@contribtest");
    await page.locator("#clink").fill("https://github.com/maho0638/reddragon-technocore");
    await page.locator("#ctitle").fill("Ephemeral browser audit contribution");
    await page.locator("#csummary").fill("Every field contributes to the signed audit payload.");
    await page.locator("#ctype").selectOption("Guide / Article");
    await page.locator("#targetRoom").selectOption("flop-network");
    await page.locator("#contribBtn").click();
    await page.waitForFunction(() => (document.querySelector("#contribOut")?.textContent || "").includes("Signed contribution"));
    const contributionCall = relayCalls.findLast(call => call.action === "signedPost" && call.room === "flop-network");
    assert.ok(contributionCall, "target room selection routes the signed contribution");
    for (const value of ["Ephemeral browser audit contribution", "https://github.com/maho0638/reddragon-technocore", "@contribtest", "Every field contributes", "Guide / Article"]) assert.ok(contributionCall.text.includes(value), "contribution control value appears in signed payload: " + value);
    const proofData = JSON.parse(await page.locator("#proofText").inputValue());
    assert.equal(proofData.contribution.title, "Ephemeral browser audit contribution");
    assert.equal(proofData.contribution.type, "Guide / Article");
    assert.equal(proofData.contribution.summary, "Every field contributes to the signed audit payload.");
    assert.equal(await page.locator("#downloadProof").isEnabled(),true);testedActions++;
    const proofDownloadEvent = page.waitForEvent("download");
    await page.locator("#downloadProof").click();
    assert.match((await proofDownloadEvent).suggestedFilename(), /reddragon-proof-.*\.json/);testedActions++;
    await page.locator("#copyProof").click();
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /"did":\s*"did:key:z6Mk/);testedActions++;
    await page.locator("#rdLangSwitcher button[data-lang='tr']").click();
    await page.waitForFunction(() => document.documentElement.lang === "tr");
    assert.equal((await page.locator("#identityOut").textContent()).split("\n")[0].trim(), generatedDid, "switching language must preserve the ephemeral DID");
    assert.equal(await page.locator("#xShare").isEnabled(), true, "switching language must preserve the enabled proof action");
    await page.locator("#rdLangSwitcher button[data-lang='en']").click();
    await page.waitForFunction(() => document.documentElement.lang === "en");
    assert.equal((await page.locator("#identityOut").textContent()).split("\n")[0].trim(), generatedDid, "switching back must preserve the same DID");
    assert.equal(await page.locator("#xShare").isEnabled(), true, "switching back must preserve the enabled proof action");
    const unexpectedPopups = [];
    page.on("popup", popup => unexpectedPopups.push(popup));
    const pageCountBeforeShare = context.pages().length;
    await page.locator("#xShare").click();
    await page.waitForFunction(async () => (await navigator.clipboard.readText()).includes("Built my Technocore agent identity"));
    let shareText = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(shareText, /Built my Technocore agent identity/);
    assert.match(shareText, /did:key:z6Mk/);
    assert.match(shareText, /#Technocore #FLOP/);
    assert.deepEqual(unexpectedPopups, [], "English share copies text without opening a popup");
    assert.equal(context.pages().length, pageCountBeforeShare, "English share must not create a new page");testedActions++;
    await page.locator("#rdLangSwitcher button[data-lang='tr']").click();
    await page.waitForFunction(() => document.documentElement.lang === "tr");
    assert.equal((await page.locator("#identityOut").textContent()).split("\n")[0].trim(), generatedDid, "language switching must preserve the in-memory DID");
    assert.equal(await page.locator("#xShare").isEnabled(), true, "language switching must preserve the enabled proof action");
    await page.locator("#xShare").click();
    await page.waitForFunction(async () => (await navigator.clipboard.readText()).includes("Technocore ajan kimliğimi oluşturdum"));
    shareText = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(shareText, /Technocore ajan kimliğimi oluşturdum/);
    assert.match(shareText, /did:key:z6Mk/);
    assert.match(shareText, /#Technocore #FLOP/);
    assert.deepEqual(unexpectedPopups, [], "Turkish share copies text without opening a popup");
    assert.equal(context.pages().length, pageCountBeforeShare, "Turkish share must not create a new page");testedActions++;
    await page.locator("#copyAutoGuide").click();
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /TECHNOCORE_PRIVATE_KEY_PKCS8_B64/);testedActions++;
    await acceptDialogDuring(page, () => page.locator("#resetBtn").click());
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
      await page.goto(LOCAL_ORIGIN+"/",{waitUntil:"domcontentloaded"});
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
      await acceptDialogDuring(page, () => activate(page.locator("#rdClearLedger"),size));
      assert.doesNotMatch(await page.locator("#rdLedgerRows").textContent(),/audit-local-a/);testedActions++;
      await page.locator("#rdTclkRefresh").waitFor({state:"visible"});
      await page.waitForFunction(() => !document.querySelector("#rdTclkRefresh")?.disabled);
      await activate(page.locator("#rdTclkRefresh"),size);
      await page.waitForFunction(() => !document.querySelector("#rdTclkRefresh")?.disabled);
      assert.match(await page.locator("#rdTclkStatus").textContent(),/waiting|partial|verified|bekliyor|kısmi|doğrulandı/i);testedActions++;

      await page.locator("#rdDidProvenance").waitFor({state:"visible"});
      await page.locator("#rdProvFixRefresh").waitFor({state:"visible"});
      assert.equal(await page.locator("#rdProvRefresh").count(),0,"the legacy refresh is replaced when the provenance card is rebuilt");
      assert.match(await page.locator("#rdProvFixRefresh").textContent(),/Refresh proof/i);
      await page.waitForFunction(() => !document.querySelector("#rdProvFixRefresh")?.disabled);
      await activate(page.locator("#rdProvFixRefresh"),size);
      await page.waitForFunction(() => !document.querySelector("#rdProvFixRefresh")?.disabled);
      assert.match(await page.locator("#rdProvFixSummary").textContent(),/proof|kanıt|verified|doğrulanamadı/i);testedActions++;
      await page.evaluate(() => localStorage.setItem("reddragon-lang", "tr"));
      await page.reload({waitUntil:"domcontentloaded"});
      await page.locator("#rdDidProvenance").waitFor({state:"visible"});
      const localizedProvRefresh=page.locator("#rdProvFixRefresh");
      await localizedProvRefresh.waitFor({state:"visible"});
      assert.equal((await localizedProvRefresh.textContent()).trim(),"Kanıtı yenile");
      await page.waitForFunction(() => !document.querySelector("#rdProvFixRefresh")?.disabled);
      await activate(localizedProvRefresh,size);
      await page.waitForFunction(() => !document.querySelector("#rdProvFixRefresh")?.disabled);
      assert.match(await page.locator("#rdProvFixSummary").textContent(),/kanıt|doğrulanamadı/i);testedActions++;

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
