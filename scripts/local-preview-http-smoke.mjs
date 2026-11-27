import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const port = 43_000 + Math.floor(Math.random() * 1_000);
const child = spawn(process.execPath, ["scripts/local-preview-server.mjs"], {
  cwd: process.cwd(), env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"]
});
let stdout = "";
let stderr = "";
child.stdout.setEncoding("utf8").on("data", (part) => { stdout += part; });
child.stderr.setEncoding("utf8").on("data", (part) => { stderr += part; });
const base = `http://127.0.0.1:${port}`;

async function waitReady() {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Local preview exited early: ${stderr || stdout}`);
    try {
      const response = await fetch(base, { signal: AbortSignal.timeout(500) });
      if (response.ok) return response;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Local preview did not become ready: ${stderr || stdout}`);
}

try {
  const home = await waitReady();
  assert.match(home.headers.get("x-content-type-options") || "", /nosniff/);
  assert.match(await home.text(), /RedDragon · FLOP Community Observatory/);
  console.log("PASS local preview serves the main page over loopback with nosniff");

  const flop = await fetch(`${base}/flop`);
  assert.equal(flop.status, 200);
  assert.match(await flop.text(), /id="flop-live-status"/);
  console.log("PASS local preview serves /flop route");

  const notFound = await fetch(`${base}/__missing_route_smoke__`);
  assert.equal(notFound.status, 404);
  assert.match(notFound.headers.get("content-type") || "", /text\/html/);
  assert.match(await notFound.text(), /id="rd404Language"/);
  const notFoundLanguage = await fetch(`${base}/404-i18n.js`);
  assert.equal(notFoundLanguage.status, 200);
  assert.match(await notFoundLanguage.text(), /This link is no longer here/);
  console.log("PASS custom 404 is served with the bilingual language control");

  for (const path of ["/apply.html", "/admin.html"]) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 200, `${path} must be reachable`);
    assert.match(response.headers.get("content-type") || "", /text\/html/);
  }
  const session = await fetch(`${base}/api/admin?action=session`);
  assert.equal(session.status, 200);
  assert.equal((await session.json()).authenticated, false);
  const login = await fetch(`${base}/api/admin?action=login`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ password: "not-a-real-password" }) });
  assert.equal(login.status, 503, "unconfigured admin credentials must fail closed");
  console.log("PASS application and admin pages load; unconfigured admin login fails closed");

  const assetResponses = new Map();
  for (const path of ["/ui-i18n.js", "/responsive-fixes.css", "/flop-responsive-fixes.css"]) {
    const response = await fetch(`${base}${path}`);
    assetResponses.set(path, response);
    assert.equal(response.status, 200, `${path} missing from local preview`);
    assert.match(response.headers.get("content-type") || "", path.endsWith(".css") ? /text\/css/ : /javascript/);
  }
  const homeHtml = await (await fetch(base)).text();
  const flopHtml = await (await fetch(base + "/flop")).text();
  assert.match(homeHtml, /ui-i18n\.js/);
  assert.match(flopHtml, /ui-i18n\.js/);
  const walletUi = await (await fetch(`${base}/flop-wallet.js`)).text();
  assert.match(walletUi, /flop-wallet-chain\.bundle\.js/);
  for (const id of ["rdWalletBalance", "rdWalletHistoryList", "rdWalletHistoryMore", "rdWalletForget", "rdClaimCommand", "rdCopyClaimCommand"]) assert.ok(flopHtml.includes(`id="${id}"`), `wallet control ${id} must exist`);
  const head = homeHtml.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] || "";
  const styleIndex = homeHtml.indexOf('href="/styles.css"');
  const responsiveIndex = homeHtml.indexOf('href="/responsive-fixes.css"');
  const configIndex = homeHtml.indexOf('src="/config.js"');
  const responsiveLinks = [...homeHtml.matchAll(/<link\b[^>]*href=["']\/responsive-fixes\.css["'][^>]*>/g)];
  assert.equal(responsiveLinks.length, 1, "responsive-fixes.css must be included exactly once");
  assert.ok(head.includes('href="/responsive-fixes.css"'), "responsive-fixes.css must load directly in <head>");
  assert.ok(styleIndex >= 0 && responsiveIndex > styleIndex && configIndex > responsiveIndex, "base CSS, responsive CSS, then config.js must appear in document order");
  const config = await (await fetch(base + "/config.js")).text();
  assert.doesNotMatch(config, /responsive-fixes\.css/, "config.js must not inject a duplicate responsive stylesheet");
  const responsiveCss = assetResponses.get("/responsive-fixes.css");
  assert.equal(responsiveCss?.status, 200, "responsive-fixes.css must return HTTP 200");
  assert.match(responsiveCss?.headers.get("content-type") || "", /text\/css/, "responsive-fixes.css must use CSS MIME type");
  assert.match(flopHtml, /flop-responsive-fixes\.css/);
  console.log("PASS local preview serves the render-blocking responsive stylesheet once with CSS MIME");

  const script = await fetch(`${base}/flop-live-status.js`);
  assert.equal(script.status, 200);
  assert.match(script.headers.get("content-type") || "", /javascript/);
  console.log("PASS local preview serves browser module with JavaScript MIME");

  const walletBundle = await fetch(`${base}/flop-wallet-chain.bundle.js`);
  assert.equal(walletBundle.status, 200);
  assert.match(walletBundle.headers.get("content-type") || "", /javascript/);
  assert.match(await walletBundle.text(), /RedDragonFlopReadOnly/);
  console.log("PASS local preview serves the pinned read-only Testnet wallet bundle");

  const relay = await fetch(`${base}/api/relay`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "signedPost" }) });
  assert.equal(relay.status, 503);
  assert.match((await relay.json()).error, /disabled in the local preview/);
  console.log("PASS local preview relay hard-deny prevents external writes");

  const write = await fetch(base, { method: "POST" });
  assert.equal(write.status, 405);
  assert.equal(write.headers.get("allow"), "GET, HEAD");
  console.log("PASS local preview static server rejects non-read HTTP methods");
} finally {
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.once("exit", resolve);
    setTimeout(resolve, 2_000).unref();
  });
}
