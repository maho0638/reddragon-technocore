import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const source = await readFile(new URL("../public/ui-i18n.js", import.meta.url), "utf8");
const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const flopStatus = await readFile(new URL("../public/flop-live-status.js", import.meta.url), "utf8");
const patches = await readFile(new URL("../public/patches.js", import.meta.url), "utf8");
const enhancements = await readFile(new URL("../public/enhancements.js", import.meta.url), "utf8");
const languageStable = await readFile(new URL("../public/language-stable.js", import.meta.url), "utf8");
const config = await readFile(new URL("../public/config.js", import.meta.url), "utf8");
const proofImport = await readFile(new URL("../public/proof-import.js", import.meta.url), "utf8");
const didProvenance = await readFile(new URL("../public/did-provenance.js", import.meta.url), "utf8");
const provenanceRefresh = await readFile(new URL("../public/provenance-room-refresh.js", import.meta.url), "utf8");
const liveObservatorySource = await readFile(new URL("../public/live-observatory.js", import.meta.url), "utf8");
const testnetToolkitSource = await readFile(new URL("../public/testnet-toolkit.js", import.meta.url), "utf8");
const tclkWorkbenchSource = await readFile(new URL("../public/tclk-workbench.js", import.meta.url), "utf8");
const finalFixesSource = await readFile(new URL("../public/final-fixes.js", import.meta.url), "utf8");
const liveObservatory = await readFile(new URL("../public/live-observatory.js", import.meta.url), "utf8");
const capacity = await readFile(new URL("../public/technocore-capacity.js", import.meta.url), "utf8");
const languageBootstrap = await readFile(new URL("../public/language-bootstrap.js", import.meta.url), "utf8");
const indexHtml = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const flopHtml = await readFile(new URL("../public/flop.html", import.meta.url), "utf8");
const browserWorkflow = await readFile(new URL("../../../.github/workflows/flop-site-browser-audit.yml", import.meta.url), "utf8");
const siteAcceptance = await readFile(new URL("./browser/site-acceptance.spec.mjs", import.meta.url), "utf8");
const flopUiSpec = await readFile(new URL("./browser/flop-ui.spec.mjs", import.meta.url), "utf8");
const browserRunner = await readFile(new URL("./run-local-browser-acceptance.mjs", import.meta.url), "utf8");
const packageJson = await readFile(new URL("../package.json", import.meta.url), "utf8");
const context = { window: {}, localStorage: { getItem: () => "en" }, navigator: { language: "en-US" } };
vm.runInNewContext(source, context);
const i18n = context.window.RD_I18N;

test("shared interface catalog provides every key in both locales and fails closed", () => {
  const result = i18n.audit();
  assert.deepEqual(Array.from(result.locales), ["tr", "en"]);
  assert.ok(result.keys >= 40);
  const sample = i18n.register("sample", { en: { item: "Item" }, tr: { item: "Öğe" } });
  assert.equal(sample.en.item, "Item");
  assert.throws(() => i18n.register("bad", { en: { item: "Item" }, tr: {} }), /Incomplete translation catalog/);
  assert.equal(i18n.audit().catalogs, 1);
  const used = [...app.matchAll(/ui\("([\w.]+)"/g)].map(match => match[1]);
  for (const key of used) for (const lang of ["tr", "en"]) assert.equal(typeof i18n.t(key, {}, lang), "string", `${lang}.${key}`);
  assert.throws(() => i18n.t("missing.key", {}, "en"), /Missing UI translation/);
  assert.equal(i18n.t("app.publishedRecord", { fingerprint: "abc" }, "en"), "Published · /kv/did/abc");
});

test("application dynamic status and confirmation copy no longer embeds mixed-language literals", () => {
  for (const key of ["passwordShort", "restoreFailed", "failure", "resetConfirm", "privateRoomPrivacy", "setupCopied", "didSecretCopied"]) {
    assert.ok(app.includes(`ui("app.${key}")`), `missing shared UI translation for ${key}`);
  }
  assert.ok(app.includes("uiLang()==="));
  assert.match(app, /#brandSub"\)\.textContent\s*=\s*ui\("app\.communityBrand"\)/);
  assert.match(app, /tool:`\$\{cfg\.brandName\|\|"RedDragon"\} \$\{ui\("app\.communityBrand"\)\}`/);
  assert.match(app, /function automationGuide\(\)[\s\S]*?uiLang\(\)==="en"/);
});

test("restore, security, relay and capacity UI messages use complete shared translations", () => {
  const patchKeys = ["publishedPath", "proofCopied", "backupProofFile", "backupJsonOnly", "backupTooLarge", "readyDidNote", "readyHello", "readyIntro", "readyRoom", "readyStyle", "readyContribution", "backupRestoredNote", "backupRestoredToast", "securityHeading", "securityBody", "relayOnline", "relayOffline", "capacityNote", "capacityRoom", "capacity404"];
  for (const key of patchKeys) for (const lang of ["en", "tr"]) assert.ok(i18n.t(`patch.${key}`, {}, lang).length > 0);
  assert.match(patches, /patchText\("backupRestoredToast"\)/);
  assert.match(patches, /patchText\("securityBody"\)/);
  assert.match(patches, /patchText\("relayOffline"\)/);
  assert.match(enhancements, /enhancementText\("capacity404"\)/);
  assert.match(enhancements, /enhancementText\("relayOnline"\)/);
});

test("onboarding and proof-import UI copy uses shared translations in both languages", () => {
  for (const key of ["proofImportNote", "agentSustainable", "agentCadence", "privateKeyHint"]) {
    assert.ok(i18n.t(`app.${key}`, {}, "en").length > 0);
    assert.ok(i18n.t(`app.${key}`, {}, "tr").length > 0);
  }
  for (const key of ["agentSustainable", "agentCadence", "privateKeyHint"]) assert.ok(languageStable.includes(`app.${key}`));
  assert.ok(proofImport.includes('window.RD_I18N.t("app.proofImportNote")'));
  assert.match(proofImport, /const isEn = window\.RD_I18N\?\.language\(\) === "en"/);
  assert.ok(proofImport.includes('isEn ? "Import Public Proof JSON"'));
  assert.ok(proofImport.includes('isEn ? "Check by sequence"'));
  assert.match(enhancements, /repoBtn\.textContent = isEn \? "Open GitHub repository"/);
  assert.match(enhancements, /warning\.textContent = window\.RD_I18N\.t\("app\.agentCadence"\)/);
});

test("TR/EN visible labels and dynamic live copy use the selected locale", () => {
  const exactEntries = languageStable.match(/const exactEN = new Map\((\[[\s\S]*?\])\);/)?.[1];
  assert.ok(exactEntries, "dynamic English translation table must exist");
  const exactEN = vm.runInNewContext(`new Map(${exactEntries})`);
  assert.equal(exactEN.get("İsteğe bağlı"), "Optional");
  assert.equal(exactEN.get("Henüz özel oda yok."), "No private room yet.");
  const liveTr = liveObservatory.slice(liveObservatory.indexOf("  tr: {"), liveObservatory.indexOf("  en: {"));
  const liveEn = liveObservatory.slice(liveObservatory.indexOf("  en: {"), liveObservatory.indexOf("let rdLiveT"));
  const keys = copy => [...copy.matchAll(/^\s+([A-Za-z][\w]*):/gm)].map(match => match[1]).filter(key => key !== "tr" && key !== "en").sort();
  assert.deepEqual(keys(liveTr), keys(liveEn), "every live-observatory label must have TR and EN entries");
  for (const phrase of ["nav: \"Canlı\"", "title: \"Canlı Ajan Gözlemevi\"", "signed: \"İmzalı ajan\"", "heartbeat: \"nabız\"", "active: \"etkin\"", "idle: \"beklemede\"", "stale: \"güncelliğini yitirmiş\"", "activity: \"Son herkese açık etkinlik\""]) assert.ok(liveTr.includes(phrase), `missing Turkish live label ${phrase}`);
  for (const key of ["buffer", "publicLabel", "polling", "publicNick", "messageCount", "redAgent"]) assert.ok(new RegExp(`\\b${key}:`).test(liveTr) && new RegExp(`\\b${key}:`).test(liveEn), `missing TR/EN live translation ${key}`);
  assert.match(liveObservatory, /small>\$\{rdEscape\(rdLiveT\.buffer\)\}/);
  assert.match(liveObservatory, /small>\$\{rdEscape\(rdLiveT\.polling\)\}/);
  assert.match(languageStable, /\.ownerline b[\s\S]*RedDragon FLOP Topluluk Aracı/);
  assert.match(languageStable, /Repository Variables[\s\S]*Depo değişkenleri/);
  assert.match(capacity, /rdCapacityLang\(\)/);
  assert.match(capacity, /Canlı okuma tamam · yalnızca herkese açık Technocore üst verileri/);
  assert.match(flopHtml, /id="rdFlopLanguage"/);
  assert.match(flopStatus, /setAttribute\("aria-label", lang === "tr" \? "Arayüz dili" : "Language"\)/);
  assert.match(flopStatus, /Topluluk çalışması · kaynak odaklı · resmî bağlantı iddiası yok/);
  assert.match(languageStable, /localStorage\.setItem\(LANG_KEY, next\)[\s\S]*location\.reload\(\)/);
});

test("X sharing copies localized text without a popup and proof intent remains available", () => {
  for (const lang of ["en", "tr"]) {
    assert.ok(i18n.t("patch.siteShareDraft", { site: "https://example.test", handle: "@example" }, lang).includes("https://example.test"));
    assert.ok(i18n.t("app.xShareDraft", { handle: "@example", did: "did:key:z6Mk-test", url: "https://example.test", room: "lobby", seq: "1" }, lang).includes("did:key:z6Mk-test"));
  }
  assert.match(enhancements, /window\.RD_I18N\.t\("app\.xShareDraft"/);
  assert.match(enhancements, /const isEn = window\.RD_I18N\?\.language\(\) === "en"/);
  for (const copy of ["Share · everyone uses their own account", "The X text is copied to your clipboard", "𝕏 Share this site", "Follow"]) assert.ok(enhancements.includes(copy), `missing English injected share copy: ${copy}`);
  assert.ok(i18n.t("app.agentCadence", {}, "en").includes("More frequent posts are not known to improve airdrop eligibility"));
  assert.ok(i18n.t("app.agentCadence", {}, "tr").includes("Daha sık gönderilerin airdrop uygunluğunu artırdığına dair kanıt yoktur"));
  assert.match(enhancements, /replacement\.onclick = \(\) => copy\(proofShareText\(\), window\.RD_I18N\.t\("app\.xTextCopied"\)\)/);
  assert.match(enhancements, /#rdProofX[\s\S]*xIntent\(proofShareText\(\)\)/);
  assert.match(siteAcceptance, /navigator\.clipboard\.readText\(\)/);
  assert.match(siteAcceptance, /deepEqual\(unexpectedPopups,\s*\[\]/);
  assert.match(siteAcceptance, /#rdDidProvenance[\s\S]*#rdProvFixRefresh/);
  assert.match(siteAcceptance, /Kanıtı yenile/);
});

test("live-status API failure localizes both status panels without an undefined-language exception", () => {
  assert.match(flopStatus, /catch\s*\{\s*const lang = getLang\(\);\s*const failureCopy = FLOP_STATUS_COPY\[lang\];\s*renderFailure\(lang\);/);
  assert.match(flopStatus, /const t = failureCopy;/);
});

test("language preference is committed before one shared event updates status and capacity panels", () => {
  assert.match(source, /const setLanguage = \(locale\) =>[\s\S]*localStorage\.setItem\("reddragon-lang", value\)[\s\S]*dispatchEvent\(new CustomEvent\("rd:languagechange"/);
  assert.match(capacity, /window\.addEventListener\("rd:languagechange", \(event\) => rdRenderCapacity\(event\.detail\?\.lang\)\)/);
  assert.doesNotMatch(capacity, /addEventListener\(['"]change['"], \(\) => rdRenderCapacity/);
  assert.match(capacity, /Live read OK · public Technocore metadata only/);
  assert.match(capacity, /Canlı okuma tamam · yalnızca herkese açık Technocore üst verileri/);
  assert.match(capacity, /rdCapacityError\(rdCapacity\.error, lang\)/);
  assert.match(flopStatus, /window\.RD_I18N\.setLanguage\(value\)/);
});

test("shared language setter stores preference and html lang before dispatch", () => {
  const values = new Map();
  const order = [];
  const root = { lang: "en" };
  const window = { dispatchEvent(event) { order.push([values.get("reddragon-lang"), root.lang, event.detail.lang]); } };
  class CustomEvent { constructor(type, init) { this.type = type; this.detail = init.detail; } }
  const localStorage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  vm.runInNewContext(source, { window, document: { documentElement: root }, localStorage, navigator: { language: "en-US" }, CustomEvent });
  assert.equal(window.RD_I18N.setLanguage("tr"), "tr");
  assert.deepEqual(order, [["tr", "tr", "tr"]]);
});

test("both pages boot the saved language early and live switching preserves the current session", () => {
  for (const html of [indexHtml, flopHtml]) {
    assert.match(html, /<script src="\/language-bootstrap\.js"><\/script>/);
    assert.ok(html.indexOf("/language-bootstrap.js") < html.indexOf("<\/head>"));
  }
  assert.match(languageBootstrap, /document\.documentElement\.lang = lang/);
  assert.match(indexHtml, /<script src="\/language-stable\.js"><\/script>/);
  assert.doesNotMatch(config, /"\/language-stable\.js"/);
  assert.doesNotMatch(languageStable, /\[350, 1900, 3200\]/);
  assert.match(languageStable, /window\.addEventListener\("rd:languagechange"/);
  assert.match(config, /window\.dispatchEvent\(new Event\("rd:addonsready"\)\)/);
  assert.match(languageStable, /window\.addEventListener\("rd:addonsready"/);
  assert.match(languageStable, /if \(window\.RD_I18N\?\.setLanguage\) \{\s*window\.RD_I18N\.setLanguage\(next\);\s*\} else \{[\s\S]*location\.reload\(\);/);
  assert.doesNotMatch(languageStable, /window\.RD_I18N\.setLanguage\(next\)[\s\S]{0,80}location\.reload\(\)/);
});

test("Public Proof and DID provenance re-render both locales without navigation", () => {
  assert.match(didProvenance, /let rdProvT\s*=\s*rdProvCatalog\[rdProvLang\(\)\]/);
  assert.match(didProvenance, /window\.addEventListener\("rd:languagechange",\s*\(event\)\s*=>\s*\{\s*rdProvApplyLocale\(event\.detail\?\.lang\)/);
  assert.match(didProvenance, /result\.dataset\.localeKey\s*=\s*Number\(error\?\.status\)\s*===\s*404\s*\?\s*"notFound"\s*:\s*"requestFailed"/);
  assert.match(provenanceRefresh, /let rdProvFixT\s*=\s*RD_PROV_FIX_CATALOG\[rdProvFixLang\(\)\]/);
  assert.match(provenanceRefresh, /window\.addEventListener\("rd:languagechange",\s*\(event\)\s*=>/);
  assert.match(provenanceRefresh, /if \(rdProvFixBuild\(\)\) rdProvFixRefresh\(\)/);
  assert.match(provenanceRefresh, /verifierRoom\.value\s*=\s*previousRoom\s*\|\|\s*RD_PROV_FIX_ROOM/);
  assert.match(languageStable, /if \(window\.RD_I18N\?\.setLanguage\) \{\s*window\.RD_I18N\.setLanguage\(next\);\s*\} else \{[\s\S]*?location\.reload\(\)/);
});

test("Testnet Toolkit and Live Observatory update locale without replacing user state", () => {
  assert.match(testnetToolkitSource, /window\.addEventListener\("rd:languagechange",\s*rdTestnetApplyLocale\)/);
  assert.match(testnetToolkitSource, /function rdTestnetApplyLocale\(\)[\s\S]*?rdLedgerRender\(\);rdMinerCalc\(\);rdValidatorCalc\(\)/);
  assert.match(testnetToolkitSource, /set\("\.rd-testnet-head h2",t\.title\)/);
  assert.match(liveObservatorySource, /let rdLiveT\s*=\s*rdLiveCopy\[rdLiveLang\(\)\]/);
  assert.match(liveObservatorySource, /window\.addEventListener\("rd:languagechange",\s*\(event\)\s*=>\s*\{\s*rdApplyLiveLocale\(event\.detail\?\.lang\)/);
  assert.match(liveObservatorySource, /if \(nav\) nav\.textContent = rdLiveT\.nav/);
  assert.match(liveObservatorySource, /function rdApplyLiveLocale\([\s\S]*?rdRenderAll\(\)/);
});

test("TCLK workbench rerenders every static label and retained transcript on shared locale changes", () => {
  const tclk = tclkWorkbenchSource;
  assert.match(tclk, /function rdTclkApplyLocale\([\s\S]*?rdTclkT\(\)/);
  assert.match(tclk, /set\("\.rd-tclk-head p",t\.intro\)/);
  assert.match(tclk, /set\("\.rd-tclk-note",t\.source\)/);
  assert.match(tclk, /rdTclkRenderTranscript\(rdTclkLastMessages\)/);
  assert.match(tclk, /window\.addEventListener\("rd:languagechange",rdTclkApplyLocale\)/);
});

test("transient toast does not leave stale-language copy after locale switch", () => {
  assert.match(app, /window\.addEventListener\("rd:languagechange",\s*\(\)\s*=>\s*\{\s*const message=\$\("#toast"\)[\s\S]*?clearTimeout\(toast\.t\)[\s\S]*?message\.textContent="";[\s\S]*?message\.classList\.remove\("show"\)/);
});

test("generated usage guide rerenders when the shared locale changes", () => {
  assert.match(finalFixesSource, /window\.addEventListener\("rd:languagechange",\s*\(event\)\s*=>\s*\{[\s\S]*?applyFinalFixes\(\)/);
});

test("sequential browser suites share one loopback preview and reject production origins", () => {
  assert.match(browserRunner, /await startPreview\(\)/);
  assert.match(browserRunner, /SITE_ACCEPTANCE_ORIGIN:\s*origin/);
  assert.match(browserRunner, /scripts\/local-preview-server\.mjs/);
  for (const spec of [siteAcceptance, flopUiSpec]) {
    assert.match(spec, /process\.env\.SITE_ACCEPTANCE_ORIGIN/);
    assert.match(spec, /url\.protocol, "http:"/);
    assert.match(spec, /\["127\.0\.0\.1", "localhost"\]\.includes\(url\.hostname\)/);
  }
});

test("sandbox browser workflow is QA-only, read-only, and contains no production smoke command", () => {
  assert.match(browserWorkflow, /branches:\s*\n\s+- qa\/flop-e2e-54354b1/);
  assert.match(browserWorkflow, /github\.ref == 'refs\/heads\/qa\/flop-e2e-54354b1'/);
  assert.match(browserWorkflow, /paths:[\s\S]*?\.github\/workflows\/flop-site-browser-audit\.yml/);
  assert.match(browserWorkflow, /working-directory: site\/current/);
  assert.match(browserWorkflow, /browser: \[chromium, firefox, webkit\]/);
  assert.match(browserWorkflow, /playwright install --with-deps/);
  assert.match(browserWorkflow, /permissions:\s*\n\s+contents: read/);
  assert.match(browserWorkflow, /runs-on: ubuntu-24\.04/);
  assert.doesNotMatch(browserWorkflow, /workflow_dispatch|run_production_acceptance|vercel deploy|git push|gh pr merge/i);
  assert.match(siteAcceptance, /Only test data; no persistent test identities or real relay writes/);
  assert.match(siteAcceptance, /route\("\*\*\/api\/relay"/);
  const scripts = JSON.parse(packageJson).scripts;
  assert.equal(scripts["test:browser:production"], undefined);
  assert.equal(scripts["test:browser"], "node scripts/run-local-browser-acceptance.mjs");
  assert.ok(browserRunner.includes('"scripts/browser/site-acceptance.spec.mjs"'));
  assert.ok(browserRunner.includes('"scripts/browser/flop-ui.spec.mjs"'));
  assert.ok(browserRunner.includes('"scripts/browser/admin-application.spec.mjs"'));
  assert.equal((browserRunner.match(/\.spec\.mjs/g) || []).length, 3);
  assert.ok(browserRunner.includes('spawnSync(process.execPath, ["--test", spec]'));
  assert.doesNotMatch(browserRunner, /Promise\.all|--test.*\*|production-smoke/);
  assert.match(browserRunner, /failures\+\+/);
  assert.match(browserRunner, /process\.exitCode = 1/);
  assert.doesNotMatch(browserRunner, /process\.exit\(/);
});

test("WebKit clipboard tests use the permission-free clipboard shim",()=>{
  assert.match(siteAcceptance,/browserName === "chromium" \? \{ permissions: \["clipboard-read", "clipboard-write"\] \}/);
  assert.match(flopUiSpec,/browserName === "chromium" \? \{ permissions: \["clipboard-read", "clipboard-write"\] \}/);
  assert.match(siteAcceptance,/browserName !== "chromium"\) await context\.addInitScript/);
  assert.match(flopUiSpec,/browserName !== "chromium"\) await context\.addInitScript/);
  assert.match(siteAcceptance,/readText: async \(\) => copied/);
  assert.match(flopUiSpec,/readText: async \(\) => copied/);
});
