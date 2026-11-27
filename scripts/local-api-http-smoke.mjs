import assert from "node:assert/strict";
import http from "node:http";
import flopStatus, { __test as statusTest } from "../api/flop-status.js";
import relay from "../api/relay.js";

function responseFor(res) {
  return {
    statusCode: 200,
    setHeader(name, value) { res.setHeader(name, value); return this; },
    status(code) { this.statusCode = code; return this; },
    json(value) { res.statusCode = this.statusCode; res.setHeader("content-type", "application/json; charset=utf-8"); res.end(JSON.stringify(value)); return this; },
    send(value) { res.statusCode = this.statusCode; res.end(value); return this; }
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const apiRes = responseFor(res);
  if (url.pathname === "/api/flop-status") return void await flopStatus({ method: req.method, headers: req.headers }, apiRes);
  if (url.pathname === "/api/relay") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    let body;
    try { body = raw ? JSON.parse(raw) : undefined; } catch { body = null; }
    return void await relay({ method: req.method, headers: req.headers, body, socket: req.socket }, apiRes);
  }
  res.writeHead(404); res.end();
});

statusTest.resetCache();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;
try {
  const status = await fetch(`${base}/api/flop-status`, { headers: { accept: "application/json" } });
  assert.equal(status.status, 200, "local HTTP GET /api/flop-status should respond");
  assert.match(status.headers.get("cache-control") || "", /s-maxage=120/);
  const statusBody = await status.json();
  assert.equal(statusBody.schema, "reddragon-flop-live-status/v1");
  assert.ok(statusBody.checkedAt, "status must expose its check timestamp");
  assert.ok(statusBody.testnet && statusBody.devnet && statusBody.services, "status must preserve the response sections");
  console.log(`PASS local HTTP status GET (testnet=${statusBody.testnet.state}, devnet=${statusBody.devnet.state}, RPC=${statusBody.services.rpc.state})`);

  const statusPost = await fetch(`${base}/api/flop-status`, { method: "POST" });
  assert.equal(statusPost.status, 405);
  assert.equal(statusPost.headers.get("allow"), "GET");
  console.log("PASS local HTTP status method rejection (POST -> 405 / Allow: GET)");

  const relayGet = await fetch(`${base}/api/relay`);
  assert.equal(relayGet.status, 405);
  console.log("PASS local HTTP relay method rejection (GET -> 405)");

  const badType = await fetch(`${base}/api/relay`, { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" });
  assert.equal(badType.status, 415);
  console.log("PASS local HTTP relay content-type gate (text/plain -> 415)");

  const unknown = await fetch(`${base}/api/relay`, { method: "POST", headers: { "content-type": "application/json", "x-real-ip": "198.51.100.17" }, body: JSON.stringify({ action: "unknown" }) });
  assert.equal(unknown.status, 400);
  assert.equal(unknown.headers.get("x-ratelimit-limit"), "60");
  console.log("PASS local HTTP relay invalid-action response and rate headers (400)");

  const publicDid = "did:key:z6MkuhrsP4tDZjWYdZLPxaur19WvrF1yuLGsGB2S8Q1gwS6K";
  const readonlyRelay = async (body, ip) => fetch(`${base}/api/relay`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": ip },
    body: JSON.stringify(body)
  });
  const owner = await readonlyRelay({ action: "kvGet", ns: "room-owners", key: "d-reddragon-835ae177" }, "198.51.100.20");
  const ownerBody = await owner.text();
  assert.equal(owner.status, 404, `ownership key should be an external missing record at this check, got ${owner.status}: ${ownerBody.slice(0, 160)}`);
  console.log("CONFIRMED read-only Technocore owner lookup: HTTP 404; external ownership record is absent (not a local DID parser result)");

  const didNote = await readonlyRelay({ action: "kvGet", ns: "did-83", key: "5ae177c258e121" }, "198.51.100.21");
  const didNoteText = await didNote.text();
  assert.equal(didNote.status, 200, `public DID note must be readable, got ${didNote.status}`);
  assert.ok(didNoteText.includes(publicDid), "DID note should contain the canonical RedDragon DID");
  assert.ok(didNoteText.split(/\s+/).includes("tclk1:paper"), "DID note should contain the TCLK capability checked by application code");
  assert.ok(!didNoteText.includes("mailbox:"), "current external DID note does not include a mailbox binding");
  console.log("PASS read-only Technocore DID note: canonical DID and tclk1:paper are present; mailbox field is absent");

  const historical = await readonlyRelay({ action: "read", room: "d-reddragon-lab" }, "198.51.100.22");
  assert.equal(historical.status, 200, `historical proof room read failed: ${historical.status}`);
  const historyBody = await historical.json();
  const historyMessages = Array.isArray(historyBody) ? historyBody : (historyBody.messages || historyBody.items || []);
  const maxSequence = historyMessages.reduce((max, message) => Math.max(max, Number(message?.seq) || 0), 0);
  console.log(`PASS read-only Technocore historical proof room read (messages=${historyMessages.length}, maxSeq=${maxSequence})`);

  const limitedIp = "198.51.100.18";
  let last;
  for (let i = 0; i < 61; i++) {
    last = await fetch(`${base}/api/relay`, { method: "POST", headers: { "content-type": "application/json", "x-real-ip": limitedIp }, body: JSON.stringify({ action: "unknown" }) });
  }
  assert.equal(last.status, 429);
  assert.ok(Number(last.headers.get("retry-after")) >= 1);
  assert.equal(last.headers.get("x-ratelimit-limit"), "60");
  console.log("PASS local HTTP per-instance read budget boundary (request 61 -> 429)");

  const writeIp = "198.51.100.19";
  for (let i = 0; i < 10; i++) {
    const write = await fetch(`${base}/api/relay`, { method: "POST", headers: { "content-type": "application/json", "x-real-ip": writeIp }, body: JSON.stringify({ action: "signedPost" }) });
    assert.equal(write.status, 400, "invalid signed payload must be rejected before upstream access");
  }
  const writeLimited = await fetch(`${base}/api/relay`, { method: "POST", headers: { "content-type": "application/json", "x-real-ip": writeIp }, body: JSON.stringify({ action: "signedPost" }) });
  assert.equal(writeLimited.status, 429);
  assert.equal(writeLimited.headers.get("x-ratelimit-limit"), "10");
  console.log("PASS local HTTP signed-write budget boundary (request 11 -> 429 before upstream access)");
} finally {
  statusTest.resetCache();
  await new Promise((resolve) => server.close(resolve));
}
