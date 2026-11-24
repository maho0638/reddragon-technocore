// Local preview acceptance or post-release read-only audit: external writes are intercepted, no real signing or posting.
// Browser-only DID generation uses an ephemeral test identity; no keys are uploaded or logged.
import assert from "node:assert/strict";
import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { before, after, test } from "node:test";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const ORIGIN = process.env.SITE_ACCEPTANCE_ORIGIN || "https://reddragon-technocore.vercel.app";
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
  const signedPosts = [];
  const kvWrites = [];
  await context.route("**/api/relay", async route => {
    let body = {};
    try { body = JSON.parse(route.request().postData() || "{}"); } catch {}
    if (body.action === "signedPost") signedPosts.push(body);
    if (body.action === "kvSet") kvWrites.push(body);
    const responses = {
      health: { ok: true, technocore: true }, rooms: { rooms: [], total: 0, notes: {}, engagement: {} },
      config: {}, read: { messages: [], next: null }, kvGet: { value: null }
    };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(responses[body.action] || { ok: true, seq: 2468, posted: { seq: 2468 } }) });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  return { context, page, signedPosts, kvWrites };
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
  console.log("[QA] production geometry " + size.name + "/" + expectedLanguage + ": " + JSON.stringify(layout));
}
async function acceptDialogDuring(page, action, promptText) {
  const dialogHandled = page.waitForEvent("dialog", { timeout: 15000 }).then(dialog => dialog.accept(promptText));
  await Promise.all([action(), dialogHandled]);
}
async function inventory(page, name) {
  const items = await page.locator("button, a[href], select, input:not([type=hidden]), textarea").evaluateAll(nodes => nodes.filter(n => n.getClientRects().length).map(n => ({tag: n.tagName, id: n.id, text: (n.textContent || "").trim().slice(0, 45), href: n.tagName === "A" ? n.getAttribute("href") : null })));
  visibleControls += items.length;
  console.log("[QA] " + name + " visible controls: " + JSON.stringify(items));
  assert.deepEqual(items.filter(x => x.tag === "A" && (!x.href || /^(javascript|data):/i.test(x.href))), [], name + " unsafe/empty links");
}
async function ready(page, selector) { await page.locator(selector).first().waitFor({ state: "visible", timeout: 30000 }); }
async function createMockedContribution(page, locale) {
  await page.locator("#clink").fill("https://github.com/maho0638/reddragon-technocore");
  await page.locator("#ctitle").fill("Ephemeral browser audit contribution");
  await page.locator("#contribBtn").click();
  await page.waitForFunction(language => {
    const text = document.querySelector("#contribOut")?.textContent || "";
    return language === "en" ? /Signed contribution.*seq\s+\d+/i.test(text) : /İmzalı katkı.*sıra\s+\d+/i.test(text);
  }, locale);
}
async function restoreDownloadedBackup(page, backupPath, backupName, password) {
  assert.match(backupName, /\.json$/i, "encrypted identity backup must retain its .json filename");
  const backupContents = await readFile(backupPath);
  const chooserEvent = page.waitForEvent("filechooser", { timeout: 30000 });
  await page.locator("label.filebtn").filter({ has: page.locator("#restoreInput") }).click();
  const chooser = await chooserEvent;
  const promptEvent = page.waitForEvent("dialog", { timeout: 15000 });
  await chooser.setFiles({ name: backupName, mimeType: "application/json", buffer: backupContents });
  const dialog = await promptEvent;
  assert.equal(dialog.type(), "prompt", "restoring encrypted backup must request password");
  const promptText = dialog.message();
  await dialog.accept(password);
  return promptText;
}
function decodeBase58(value) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let number = 0n;
  for (const char of value) {
    const digit = alphabet.indexOf(char);
    assert.notEqual(digit, -1, "DID multibase must use base58btc");
    number = number * 58n + BigInt(digit);
  }
  const bytes = [];
  while (number > 0n) { bytes.unshift(Number(number & 0xffn)); number >>= 8n; }
  let zeroes = 0;
  while (value[zeroes] === "1") zeroes++;
  return Buffer.from([...Array(zeroes).fill(0), ...bytes]);
}
function ed25519PublicKeyFromDid(did) {
  assert.ok(did.startsWith("did:key:z"), "restored identity must be a base58btc did:key");
  const multicodec = decodeBase58(did.slice("did:key:z".length));
  assert.equal(multicodec.length, 34, "Ed25519 DID must encode a 32-byte public key");
  assert.deepEqual([...multicodec.subarray(0, 2)], [0xed, 0x01], "DID must encode the Ed25519 multicodec");
  const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
  return createPublicKey({ key: Buffer.concat([spkiPrefix, multicodec.subarray(2)]), format: "der", type: "spki" });
}
function assertSignedPostMatchesDid(post, expectedDid) {
  assert.equal(post.did, expectedDid, "signed relay request must use the restored DID");
  assert.equal(typeof post.sig, "string");
  assert.equal(typeof post.nonce, "string");
  const payload = Buffer.from(`${post.room}|${post.nonce}|${post.text}`, "utf8");
  assert.equal(verifySignature(null, payload, ed25519PublicKeyFromDid(post.did), Buffer.from(post.sig, "base64url")), true,
    "restored private key must cryptographically match the DID public key");
}
function assertSignedProfileMatchesDid(write, expectedDid) {
  assert.equal(write.ns, "profile");
  assert.equal(write.did, expectedDid, "profile write must identify its signer");
  assert.equal(write.key, createHash("sha256").update(expectedDid, "utf8").digest("hex").slice(0, 16), "profile key must be derived from signer DID");
  assert.match(write.nonce, /^\d{1,19}$/);
  const normalized = write.value.replace(/[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Zl}\p{Zp}]/gu, " ").replace(/\s+/g, " ").trim();
  const payload = Buffer.from(`${write.ns}|${write.key}|${write.nonce}|${normalized}`, "utf8");
  assert.equal(verifySignature(null, payload, ed25519PublicKeyFromDid(write.did), Buffer.from(write.sig, "base64url")), true,
    "profile write signature must verify against the DID and exact stored value");
}
test("target HTTP/JSON read-only health", { timeout: 90000 }, async () => {
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
      await page.waitForURL(ORIGIN + "/");testedActions++;
      assert.deepEqual(errors, [], size.name + " JS exceptions");
      console.log("[QA] PASS navigation and responsive layout " + size.name);
    } finally { await context.close(); }
  }
});
test("local identity, validation and signed UI workflows with mocked relay (NO external writes)", { timeout: 180000 }, async () => {
  const { context, page, signedPosts, kvWrites } = await pageFor(sizes[0]);
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
    const backupJson = JSON.parse(await readFile(backupPath, "utf8"));
    assert.equal(backupJson.format, "reddragon-technocore-identity");
    assert.equal(backupJson.cipher, "AES-256-GCM");
    assert.equal(backupJson.kdf, "PBKDF2-SHA256-310000");
    assert.equal(backupJson.did, generatedDid);
    assert.ok(backupJson.ciphertextB64u && backupJson.saltB64u && backupJson.ivB64u, "downloaded backup must contain encrypted key material");
    assert.equal(await restoreDownloadedBackup(page, backupPath, backup.suggestedFilename(), "ephemeral-ui-audit-only-password"), "Enter the backup password:");
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
    assert.ok(signedPosts.length >= 4, "the restored identity must produce the mocked signed UI posts");
    for (const post of signedPosts) assertSignedPostMatchesDid(post, generatedDid);
    assert.equal(kvWrites.length, 3, "DID note, public topic and profile writes must be sent through the mocked relay");
    const profileWrite = kvWrites.find(write => write.ns === "profile");
    assert.ok(profileWrite, "style flow must submit a profile write");
    assertSignedProfileMatchesDid(profileWrite, generatedDid);
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
    await page.waitForFunction((did) => {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith("reddragon-public-state-v1:")) continue;
        try {
          const saved = JSON.parse(localStorage.getItem(key) || "null");
          const record = saved?.proof?.contribution?.record;
          if (saved?.did === did && record?.did === did && /^\d+$/.test(String(record.seq)) && Number(record.seq) > 0) return true;
        } catch {}
      }
      return false;
    }, generatedDid, { timeout: 15000 });
    const enNavigation = page.waitForNavigation({ waitUntil: "domcontentloaded" });
    await page.locator("#rdLangSwitcher button[data-lang='en']").click();
    await enNavigation;
    await page.waitForFunction(() => document.documentElement.lang === "en");
    assert.equal(await restoreDownloadedBackup(page, backupPath, backup.suggestedFilename(), "ephemeral-ui-audit-only-password"), "Enter the backup password:");
    await page.waitForFunction(() => (document.querySelector("#identityOut")?.textContent || "").includes("did:key:z6Mk"));
    assert.equal((await page.locator("#identityOut").textContent()).split("\n")[0].trim(), generatedDid, "English reload restores the same DID from the encrypted backup");
    const beforeEnglishContribution = signedPosts.length;
    await createMockedContribution(page, "en");
    assertSignedPostMatchesDid(signedPosts[beforeEnglishContribution], generatedDid);
    await page.waitForFunction(() => !document.querySelector("#xShare")?.disabled, null, { timeout: 15000 });
    const unexpectedPopups = [];
    const pageCountBeforeShare = context.pages().length;
    page.on("popup", popup => unexpectedPopups.push(popup));
    await page.locator("#xShare").click();
    await page.waitForFunction(async () => (await navigator.clipboard.readText()).includes("Built my Technocore agent identity"));
    let shareText = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(shareText, /Built my Technocore agent identity/);
    assert.match(shareText, new RegExp(generatedDid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(shareText, /https:\/\/github\.com\/maho0638\/reddragon-technocore/);
    assert.match(shareText, /#Technocore #FLOP/);
    assert.deepEqual(unexpectedPopups, [], "English X share copies text without opening a popup");
    assert.equal(context.pages().length, pageCountBeforeShare, "English X share must not create a new page");testedActions++;
    const trNavigation = page.waitForNavigation({ waitUntil: "domcontentloaded" });
    await page.locator("#rdLangSwitcher button[data-lang='tr']").click();
    await trNavigation;
    await page.waitForFunction(() => document.documentElement.lang === "tr");
    assert.equal(await restoreDownloadedBackup(page, backupPath, backup.suggestedFilename(), "ephemeral-ui-audit-only-password"), "Yedek parolasını gir:");
    await page.waitForFunction(() => (document.querySelector("#identityOut")?.textContent || "").includes("did:key:z6Mk"));
    assert.equal((await page.locator("#identityOut").textContent()).split("\n")[0].trim(), generatedDid, "Turkish reload restores the same DID from the encrypted backup");
    const beforeTurkishContribution = signedPosts.length;
    await createMockedContribution(page, "tr");
    assertSignedPostMatchesDid(signedPosts[beforeTurkishContribution], generatedDid);
    await page.waitForFunction(() => !document.querySelector("#xShare")?.disabled, null, { timeout: 15000 });
    await page.locator("#xShare").click();
    await page.waitForFunction(async () => (await navigator.clipboard.readText()).includes("Technocore ajan kimliğimi oluşturdum"));
    shareText = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(shareText, /Technocore ajan kimliğimi oluşturdum/);
    assert.ok(shareText.includes(generatedDid));
    assert.match(shareText, /https:\/\/github\.com\/maho0638\/reddragon-technocore/);
    assert.match(shareText, /#Technocore #FLOP/);
    assert.deepEqual(unexpectedPopups, [], "Turkish X share copies text without opening a popup");
    assert.equal(context.pages().length, pageCountBeforeShare, "Turkish X share must not create a new page");testedActions++;
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
