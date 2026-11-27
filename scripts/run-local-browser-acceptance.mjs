import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";

// Run these separately so clipboard permissions and browser state cannot collide.
// Continue to the second suite after a failure, then return a failing exit code.
const specs = [
  "scripts/browser/site-acceptance.spec.mjs",
  "scripts/browser/flop-ui.spec.mjs",
  "scripts/browser/admin-application.spec.mjs"
];
let failures = 0;
let preview;

async function reserveLoopbackPort() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const { port } = probe.address();
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  return port;
}

async function startPreview() {
  const port = await reserveLoopbackPort();
  const origin = `http://127.0.0.1:${port}`;
  preview = spawn(process.execPath, ["scripts/local-preview-server.mjs"], {
    cwd: process.cwd(), env: { ...process.env, PORT: String(port) }, stdio: "inherit"
  });
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if (preview.exitCode !== null) throw new Error(`Local preview exited with ${preview.exitCode ?? preview.signalCode}`);
    try {
      const response = await fetch(origin, { signal: AbortSignal.timeout(500) });
      if (response.ok) return origin;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Loopback local preview did not become ready");
}

try {
  const origin = await startPreview();
  const env = { ...process.env, SITE_ACCEPTANCE_ORIGIN: origin };
  for (const spec of specs) {
    console.log(`\n=== ${spec} ===`);
    const result = spawnSync(process.execPath, ["--test", spec], { stdio: "inherit", env });
    if (result.error) {
      console.error(`FAIL ${spec}: ${result.error.message}`);
      failures++;
    } else if (result.status !== 0) {
      console.error(`FAIL ${spec}: exited with status ${result.status ?? "unknown"}`);
      failures++;
    }
  }
} catch (error) {
  console.error(`FAIL local preview setup: ${error.message}`);
  failures++;
} finally {
  if (preview && preview.exitCode === null) {
    preview.kill("SIGTERM");
    await new Promise(resolve => {
      preview.once("exit", resolve);
      setTimeout(resolve, 2_000).unref();
    });
  }
}
if (failures > 0) process.exitCode = 1;
