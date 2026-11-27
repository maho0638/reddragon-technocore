import test from "node:test";
import assert from "node:assert/strict";
import relay, { __test as relayTest } from "../api/relay.js";

function request({ ip = "203.0.113.7", action = "unknown" } = {}) {
  return {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": ip },
    body: { action }
  };
}

function response() {
  return {
    headers: {}, statusCode: 200, body: undefined,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; return this; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; }
  };
}

test("relay throttles abusive requests per client and returns retry metadata", async () => {
  relayTest.rateBuckets.clear();
  for (let i = 0; i < relayTest.RATE_LIMITS.read; i++) {
    const res = response();
    await relay(request(), res);
    assert.equal(res.statusCode, 400, "within-limit unknown actions retain normal validation");
  }
  const limited = response();
  await relay(request(), limited);
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.headers["x-ratelimit-limit"], "60");
  assert.equal(limited.headers["x-ratelimit-remaining"], "0");
  assert.ok(Number(limited.headers["retry-after"]) >= 1);
  const otherClient = response();
  await relay(request({ ip: "203.0.113.8" }), otherClient);
  assert.equal(otherClient.statusCode, 400);
});

test("relay uses a separate lower budget for signed writes and KV writes", async () => {
  relayTest.rateBuckets.clear();
  for (let i = 0; i < relayTest.RATE_LIMITS.write; i++) {
    const res = response();
    await relay(request({ action: "kvSet" }), res);
    assert.equal(res.statusCode, 400, "invalid write remains rejected by existing validation");
  }
  const limited = response();
  await relay(request({ action: "signedPost" }), limited);
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.headers["x-ratelimit-limit"], "10");
});

test("relay trusts the final forwarded address and retains POST/content-type gates", async () => {
  assert.equal(relayTest.clientKey({ headers: { "x-forwarded-for": "198.51.100.1, 203.0.113.9" } }), "203.0.113.9");
  const get = response();
  await relay({ method: "GET", headers: {}, body: {} }, get);
  assert.equal(get.statusCode, 405);
  const contentType = response();
  await relay({ method: "POST", headers: { "content-type": "text/plain", "x-real-ip": "203.0.113.10" }, body: {} }, contentType);
  assert.equal(contentType.statusCode, 415);
});

test("valid read-only relay health checks still reach the fixed upstream", async () => {
  const originalFetch = globalThis.fetch;
  relayTest.rateBuckets.clear();
  globalThis.fetch = async (url) => {
    assert.equal(url, "https://technocore.chat/healthz");
    return new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
  };
  try {
    const res = response();
    await relay(request({ action: "health" }), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { ok: true, technocore: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
