import { spawn } from "node:child_process";

const port = 44_000 + Math.floor(Math.random() * 1_000);
const origin = `http://127.0.0.1:${port}`;
const preview = spawn(process.execPath, ["scripts/local-preview-server.mjs"], {
  cwd: process.cwd(), env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"]
});
let previewOutput = "";
preview.stdout.setEncoding("utf8").on("data", part => { previewOutput += part; });
preview.stderr.setEncoding("utf8").on("data", part => { previewOutput += part; });

async function waitForPreview() {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if (preview.exitCode !== null) throw new Error(`Local preview exited: ${previewOutput}`);
    try {
      const response = await fetch(origin, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Local preview did not become ready: ${previewOutput}`);
}

async function stopPreview() {
  if (preview.exitCode !== null) return;
  preview.kill("SIGTERM");
  await new Promise(resolve => {
    preview.once("exit", resolve);
    setTimeout(resolve, 2_000).unref();
  });
}

try {
  await waitForPreview();
  const tests = spawn(process.execPath, [
    "--test", "--test-concurrency=1",
    "scripts/browser/site-acceptance.spec.mjs",
    "scripts/browser/flop-ui.spec.mjs"
  ], {
    cwd: process.cwd(),
    env: { ...process.env, SITE_ACCEPTANCE_ORIGIN: origin },
    stdio: "inherit"
  });
  const code = await new Promise((resolve, reject) => {
    tests.once("error", reject);
    tests.once("exit", (status, signal) => resolve(status ?? (signal ? 1 : 0)));
  });
  if (code !== 0) process.exitCode = code;
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await stopPreview();
}
