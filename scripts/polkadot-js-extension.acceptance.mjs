// Isolated acceptance against the published Polkadot.js Chrome extension.
// Uses a disposable profile and an in-memory test mnemonic; it never submits a chain write.
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { cryptoWaitReady, mnemonicGenerate, signatureVerify } from "@polkadot/util-crypto";
import { Keyring } from "@polkadot/keyring";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const execFileAsync = promisify(execFile);
const CHROME_WEB_STORE_ID = "mopnmbcafieddcagagdcbnhejhlodfdd";
const EXTENSION_VERSION = "0.64.0";
const EXTENSION_SHA256 = "df1d2b79cc25605e79d8e338017b7a3d0c904baf464ad537197327ee3a888dc6";
const SITE_ORIGIN = "http://127.0.0.1:4173";
const root = process.cwd();
const temporaryRoot = await mkdtemp(path.join(tmpdir(), "reddragon-wallet-extension-"));
const extensionDir = path.join(temporaryRoot, "extension");
const zipPath = path.join(temporaryRoot, "extension.zip");
const profile = path.join(temporaryRoot, "persistent-profile");
const evidenceDir = path.join(root, "test-results", "visual-evidence", "chromium", "wallet-extension");
let server;
let context;
let mnemonic = "";
let password = "";
let blockedFaucetWrites = [];

async function installPublishedExtension() {
  const updateUrl = `https://clients2.google.com/service/update2/crx?response=redirect&os=linux&arch=x64&installsource=ondemand&uc&prodversion=151.0.7922.34&acceptformat=crx3&x=id%3D${CHROME_WEB_STORE_ID}%26uc`;
  const response = await fetch(updateUrl, { redirect: "follow", signal: AbortSignal.timeout(30_000) });
  assert.equal(response.status, 200, "Chrome Web Store must serve the pinned Polkadot.js extension");
  const crx = Buffer.from(await response.arrayBuffer());
  const sha256 = createHash("sha256").update(crx).digest("hex");
  assert.equal(sha256, EXTENSION_SHA256, "Chrome Web Store package changed; review publisher/version/hash before updating the pin");
  assert.equal(crx.toString("ascii", 0, 4), "Cr24", "expected a Chrome-signed CRX package");
  assert.equal(crx.readUInt32LE(4), 3, "expected CRX3");
  const headerLength = crx.readUInt32LE(8);
  assert.ok(headerLength > 0 && 12 + headerLength < crx.length, "CRX3 header must be complete");
  await mkdir(extensionDir, { recursive: true });
  await writeFile(zipPath, crx.subarray(12 + headerLength));
  await execFileAsync("unzip", ["-q", zipPath, "-d", extensionDir]);
  const manifest = JSON.parse(await readFile(path.join(extensionDir, "manifest.json"), "utf8"));
  assert.equal(manifest.name, "polkadot{.js} extension");
  assert.equal(manifest.version, EXTENSION_VERSION);
  assert.equal(manifest.manifest_version, 3);
  return sha256;
}

async function waitForServer() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error("Isolated local preview exited before becoming ready");
    try { if ((await fetch(SITE_ORIGIN, { signal: AbortSignal.timeout(500) })).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Isolated local preview did not become ready");
}

async function waitForExtensionPage(context, extensionId, containsText) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    // The extension may reuse its existing UI page for authorization/signing instead of
    // opening another tab. Search every page owned by this extension origin.
    const candidates = context.pages().filter(page => page.url().startsWith(`chrome-extension://${extensionId}/`));
    for (const candidate of candidates) {
      try {
        await candidate.waitForLoadState("domcontentloaded", { timeout: 2_000 }).catch(() => {});
        if (await candidate.locator("body").innerText().then(text => text.includes(containsText)).catch(() => false)) return candidate;
      } catch {}
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const extensionPages = await Promise.all(context.pages()
    .filter(page => page.url().startsWith(`chrome-extension://${extensionId}/`))
    .map(async page => ({ url: page.url(), title: await page.title().catch(() => ""), text: (await page.locator("body").innerText().catch(() => "")).slice(0, 700) })));
  throw new Error(`Polkadot.js extension did not show its ${containsText} prompt; extension page diagnostics: ${JSON.stringify(extensionPages)}`);
}

async function fillExtensionField(page, label, value) {
  // Polkadot.js renders a visible <label> without a for/id association, so Playwright's
  // accessible getByLabel locator cannot resolve it. Scope the input to that label's wrapper.
  const field = page.getByText(label, { exact: true }).locator("..").locator("input");
  await field.waitFor({ state: "visible", timeout: 30_000 });
  await field.fill(value);
}

try {
  const packageHash = await installPublishedExtension();
  await cryptoWaitReady();
  mnemonic = mnemonicGenerate(12);
  const expectedAddress = new Keyring({ type: "sr25519" }).addFromMnemonic(mnemonic).address;
  password = randomBytes(24).toString("base64url") + "A9!";
  await mkdir(evidenceDir, { recursive: true });

  server = spawn(process.execPath, ["scripts/local-preview-server.mjs"], {
    cwd: root,
    env: { ...process.env, PORT: "4173", DATABASE_URL: "", NEON_INTEGRATION_DATABASE_URL: "", ADMIN_PASSWORD_HASH: "", ADMIN_SESSION_SECRET: "", ADMIN_ACTOR: "" },
    stdio: "ignore"
  });
  await waitForServer();

  // Playwright's official extension method: Chromium persistent context plus a single explicitly loaded extension.
  context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: false,
    locale: "en-US",
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
    recordVideo: { dir: evidenceDir, size: { width: 1440, height: 1000 } },
    args: ["--disable-extensions-except=" + extensionDir, "--load-extension=" + extensionDir]
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker", { timeout: 20_000 });
  const extensionId = new URL(worker.url()).host;
  assert.match(extensionId, /^[a-p]{32}$/, "the loaded extension must have a Chromium extension origin");

  worker.on("console", message => console.log(`[wallet-extension-worker:${message.type()}] ${message.text()}`));
  context.on("page", page => {
    page.on("pageerror", error => console.log(`[wallet-extension-pageerror] ${page.url()} ${error.message}`));
    page.on("console", message => { if (message.type() === "error") console.log(`[wallet-extension-console] ${page.url()} ${message.text()}`); });
  });
  const extensionPage = await context.newPage();
  await extensionPage.goto(`chrome-extension://${extensionId}/index.html`, { waitUntil: "domcontentloaded" });
  // Honor the extension's first-run notices before visiting its hash-routed import form.
  await extensionPage.getByRole("button", { name: "Understood, let me continue" }).click();
  await extensionPage.getByRole("button", { name: "I Understand" }).click();
  // Direct navigation avoids relying on whether its sidebar menu is expanded.
  await extensionPage.goto(`chrome-extension://${extensionId}/index.html#/account/import-seed`, { waitUntil: "domcontentloaded" });
  await extensionPage.waitForTimeout(1_000);
  const importScreenText = await extensionPage.locator("body").innerText();
  const seedFieldCount = await extensionPage.locator("textarea").count();
  console.log("[wallet-extension] import screen", JSON.stringify({ url: extensionPage.url(), text: importScreenText.slice(0, 1200), textareas: seedFieldCount }));
  assert.match(importScreenText, /existing 12 or 24-word mnemonic seed/i, "the official seed import form must be shown");
  assert.equal(seedFieldCount, 1, "the import form must expose exactly one mnemonic textarea");
  const seedField = extensionPage.locator("textarea").first();
  await seedField.fill(mnemonic);
  const next = extensionPage.getByRole("button", { name: "Next" });
  await next.waitFor({ state: "visible" });
  await next.waitFor({ state: "attached" });
  await extensionPage.waitForFunction(() => {
    const button = [...document.querySelectorAll("button")].find(node => node.textContent.trim() === "Next");
    return button && !button.disabled;
  }, { timeout: 30_000 });
  await next.click();
  await fillExtensionField(extensionPage, "A descriptive name for your account", "RedDragon QA temporary empty account");
  await fillExtensionField(extensionPage, "A new password for this account", password);
  await fillExtensionField(extensionPage, "Repeat password for verification", password);
  await extensionPage.getByRole("button", { name: "Add the account with the supplied seed" }).click();
  await extensionPage.getByText("RedDragon QA temporary empty account", { exact: false }).waitFor({ timeout: 30_000 });

  const appPage = await context.newPage();
  await appPage.route("**/*", async route => {
    const requestUrl = new URL(route.request().url());
    if (!['GET', 'HEAD', 'OPTIONS'].includes(route.request().method()) && !["127.0.0.1", "localhost"].includes(requestUrl.hostname)) {
      if (requestUrl.hostname === "faucet.flop.network") blockedFaucetWrites.push(route.request().method() + " " + requestUrl.pathname);
      return route.abort();
    }
    return route.continue();
  });
  await appPage.goto(SITE_ORIGIN + "/flop", { waitUntil: "domcontentloaded" });
  const connect = appPage.locator("#rdWalletConnect");
  await connect.click();
  const provider = appPage.locator("#rdWalletProvider");
  await provider.waitFor({ state: "visible" });
  await provider.selectOption("polkadot-js");
  console.log("[wallet-extension] selected provider", JSON.stringify({ name: await provider.inputValue(), options: await provider.locator("option").allTextContents() }));
  await connect.click();
  const authorization = await waitForExtensionPage(context, extensionId, "Account connection request");
  assert.match(await authorization.locator("body").innerText(), /RedDragon QA temporary empty account/, "the real extension dialog must show the disposable test account");
  const selectAll = authorization.getByText("Select all", { exact: true });
  await selectAll.waitFor({ state: "visible", timeout: 10_000 });
  await selectAll.click();
  const authorizeButton = authorization.getByRole("button", { name: /Connect 1 account/ });
  await authorizeButton.waitFor({ state: "visible", timeout: 10_000 });
  await authorizeButton.click();

  const accountSelect = appPage.locator("#rdWalletAccount");
  await accountSelect.waitFor({ state: "visible" });
  await appPage.waitForTimeout(1_000);
  const connectState = await appPage.evaluate(() => ({ status: document.querySelector("#rdWalletStatus")?.textContent, disabled: document.querySelector("#rdWalletAccount")?.disabled, options: [...(document.querySelector("#rdWalletAccount")?.options || [])].map(option => ({ text: option.textContent, value: option.value })) }));
  console.log("[wallet-extension] post-authorization site state", JSON.stringify(connectState));
  try {
    await appPage.waitForFunction(address => {
      const select = document.querySelector("#rdWalletAccount");
      return select && !select.disabled && select.options.length === 1 && select.options[0].textContent.includes(address);
    }, expectedAddress, { timeout: 45_000 });
  } catch (error) {
    const apiAccounts = await Promise.race([
      appPage.evaluate(async () => {
        const api = await globalThis.injectedWeb3?.["polkadot-js"]?.enable("RedDragon FLOP isolated diagnostics");
        return await api?.accounts?.get?.() || [];
      }).catch(cause => ({ diagnosticError: cause.message })),
      new Promise(resolve => setTimeout(() => resolve({ diagnosticError: "wallet account API timed out" }), 5_000))
    ]);
    const safeAccounts = Array.isArray(apiAccounts) ? apiAccounts.map(account => ({ address: account.address, name: account.name, genesisHash: account.genesisHash, type: account.type, meta: account.meta })) : apiAccounts;
    throw new Error(`Site did not expose the approved disposable account; site=${JSON.stringify(connectState)}; extensionAccounts=${JSON.stringify(safeAccounts)}; original=${error.message}`);
  }
  const selectedValue = await accountSelect.inputValue();
  assert.ok(selectedValue, "the site must expose the authorized account as a selectable account");
  await accountSelect.selectOption(selectedValue);

  await appPage.locator("#rdWalletReadout:not([hidden])").waitFor({ timeout: 45_000 });
  await appPage.waitForFunction(() => {
    const balance = document.querySelector("#rdWalletBalance")?.textContent || "";
    const status = document.querySelector("#rdWalletChainStatus")?.textContent || "";
    return /FLOP/.test(balance) && !/could not be verified|could not be loaded/i.test(balance) && /runtime\s+\d+/i.test(status);
  }, { timeout: 60_000 });
  await appPage.waitForFunction(() => /finalized|opening block|taranan kesinleşmiş/i.test(document.querySelector("#rdWalletHistoryStatus")?.textContent || ""), { timeout: 60_000 });
  await appPage.locator("#rdWalletRefreshAccount").click();
  await appPage.waitForFunction(() => !/Checking finalized|Kesinleşmiş Testnet bakiyesi kontrol/i.test(document.querySelector("#rdWalletBalance")?.textContent || ""), { timeout: 60_000 });

  // Test the site-facing extension signer directly if live faucet status is temporarily not ready.
  // It signs a harmless, one-off message; the app and page routes deny all faucet writes.
  const prepare = appPage.locator("#rdPrepareClaim");
  let signature;
  if (await prepare.isEnabled()) {
    await prepare.click();
    const signingPage = await waitForExtensionPage(context, extensionId, "Sign message");
    await fillExtensionField(signingPage, "Password for this account", password);
    await signingPage.getByRole("button", { name: "Sign the message" }).click();
    await appPage.locator("#rdClaimOutput:not([hidden])").waitFor({ timeout: 45_000 });
    const payload = JSON.parse(await appPage.locator("#rdClaimPayload").inputValue());
    const selectedKey = await accountSelect.inputValue();
    const selectedAddress = selectedKey.slice(selectedKey.indexOf(":") + 1);
    assert.equal(payload.address, selectedAddress);
    assert.ok(/^0x[0-9a-f]{128}$/i.test(payload.signature || ""), "the signed claim preview must contain an extension-produced signature");
    assert.equal(signatureVerify(await appPage.locator("#rdClaimMessage").textContent(), payload.signature, selectedAddress).isValid, true, "the signed claim message must verify against the selected temporary account");
  } else {
    const signed = appPage.evaluate(async () => {
      const key = document.querySelector("#rdWalletAccount")?.value;
      const [source, accountAddress] = key.split(":", 2);
      if (!source || !accountAddress) throw new Error("No selected extension account");
      const extension = await window.injectedWeb3[source].enable("RedDragon FLOP");
      const message = "RedDragon isolated wallet extension acceptance";
      const data = "0x" + Array.from(new TextEncoder().encode(message), value => value.toString(16).padStart(2, "0")).join("");
      const signed = await extension.signer.signRaw({ address: accountAddress, data, type: "bytes" });
      return { address: accountAddress, data, signature: signed.signature, message };
    });
    const signingPage = await waitForExtensionPage(context, extensionId, "Sign message");
    await fillExtensionField(signingPage, "Password for this account", password);
    await signingPage.getByRole("button", { name: "Sign the message" }).click();
    signature = await signed;
    const verification = signatureVerify(signature.message, signature.signature, signature.address);
    assert.equal(verification.isValid, true, "temporary wallet raw-message signature must verify cryptographically");
    assert.equal(await appPage.locator("#rdWalletStatus").getAttribute("data-state"), "blocked", "claim preparation must remain fail-closed while official status is not ready");
  }

  assert.deepEqual(blockedFaucetWrites, [], "the wallet flow must never POST, claim, or write to the faucet");
  await mkdir(evidenceDir, { recursive: true });
  await appPage.screenshot({ path: path.join(evidenceDir, "chromium-polkadot-js-connected-empty-wallet.png"), fullPage: true });
  await appPage.locator("#rdWalletForget").click();
  await appPage.locator("#rdWalletReadout").waitFor({ state: "hidden" });
  assert.equal(await accountSelect.isDisabled(), true, "forget/disconnect must clear the site-side wallet selection");
  assert.deepEqual(blockedFaucetWrites, []);
  console.log(`[wallet-extension] PASS: Chrome Web Store polkadot{.js} ${EXTENSION_VERSION}; CRX SHA-256 ${packageHash}; persistent-profile connect/account/read-only balance/history/sign-message/disconnect; no faucet write.`);
} finally {
  mnemonic = "";
  password = "";
  if (context) await context.close().catch(() => {});
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise(resolve => { server.once("exit", resolve); setTimeout(resolve, 2_000).unref(); });
  }
  await rm(temporaryRoot, { recursive: true, force: true });
}
