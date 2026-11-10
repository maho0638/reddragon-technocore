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

  const script = await fetch(`${base}/flop-live-status.js`);
  assert.equal(script.status, 200);
  assert.match(script.headers.get("content-type") || "", /javascript/);
  console.log("PASS local preview serves browser module with JavaScript MIME");

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
