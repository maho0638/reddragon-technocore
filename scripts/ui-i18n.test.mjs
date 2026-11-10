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
const proofImport = await readFile(new URL("../public/proof-import.js", import.meta.url), "utf8");
const browserWorkflow = await readFile(new URL("../.github/workflows/flop-site-browser-audit.yml", import.meta.url), "utf8");
const productionBrowserAudit = await readFile(new URL("./browser/site-acceptance.spec.mjs", import.meta.url), "utf8");
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
});

test("live-status API failure localizes both status panels without an undefined-language exception", () => {
  assert.match(flopStatus, /catch\s*\{\s*const lang = getLang\(\);\s*const failureCopy = FLOP_STATUS_COPY\[lang\];\s*renderFailure\(lang\);/);
  assert.match(flopStatus, /const t = failureCopy;/);
});

test("browser workflow can run only on the QA branch with read-only repository permissions", () => {
  assert.match(browserWorkflow, /branches:\s*\n\s+- qa\/flop-site-browser-20261110/);
  assert.match(browserWorkflow, /if: github\.ref == 'refs\/heads\/qa\/flop-site-browser-20261110'/);
  assert.match(browserWorkflow, /permissions:\s*\n\s+contents: read/);
  assert.doesNotMatch(browserWorkflow, /vercel deploy|git push|gh pr merge/i);
  assert.match(productionBrowserAudit, /Only test data; no persistent test identities or real relay writes/);
  assert.match(productionBrowserAudit, /route\("\*\*\/api\/relay"/);
});
