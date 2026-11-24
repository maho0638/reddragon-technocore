// Mocked API security checks: no Technocore network requests are made.
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import relay, { __test as relayTest } from "../api/relay.js";

function response() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
  };
}

function base58(bytes) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) + BigInt(byte);
  let encoded = "";
  while (value > 0n) { encoded = alphabet[Number(value % 58n)] + encoded; value /= 58n; }
  for (const byte of bytes) { if (byte === 0) encoded = "1" + encoded; else break; }
  return encoded || "1";
}

function identity() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const spki = publicKey.export({ format: "der", type: "spki" });
  const raw = spki.subarray(-32);
  const did = `did:key:z${base58(Buffer.concat([Buffer.from([0xed, 0x01]), raw]))}`;
  return { did, privateKey };
}

function signedBody(room = "lobby", text = "hello") {
  const { did, privateKey } = identity();
  const nonce = "1794613172000";
  const clean = text.replace(/[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Zl}\p{Zp}]/gu, " ").replace(/\s+/g, " ").trim();
  const sig = sign(null, Buffer.from(`${room}|${nonce}|${clean}`, "utf8"), privateKey).toString("base64url");
  return { action: "signedPost", room, did, sig, nonce, text };
}

function signedProfileBody({ did: targetDid, key, value } = {}) {
  const signer = identity();
  const did = targetDid || signer.did;
  const profileKey = key || createHash("sha256").update(did, "utf8").digest("hex").slice(0, 16);
  const profileValue = value || JSON.stringify({ did, name: "Synthetic profile" });
  const nonce = "1794613172001";
  const clean = profileValue.replace(/[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Zl}\p{Zp}]/gu, " ").replace(/\s+/g, " ").trim();
  const sig = sign(null, Buffer.from(`profile|${profileKey}|${nonce}|${clean}`, "utf8"), signer.privateKey).toString("base64url");
  return { action: "kvSet", ns: "profile", key: profileKey, value: profileValue, did, nonce, sig };
}

let calls = [];
let shardedDidMiss = false;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  calls.push({ url: String(url), method: options.method || "GET", body: options.body });
  if (shardedDidMiss && String(url) === "https://technocore.chat/kv/did-5a/e177c258e12100") {
    return new Response("not found", { status: 404 });
  }
  if (shardedDidMiss && String(url) === "https://technocore.chat/kv/did/5ae177c258e12100") {
    return new Response("legacy DID note", { status: 200, headers: { "content-type": "text/plain" } });
  }
  if (String(url).includes("/r/")) {
    return new Response('{"seq":2468}', { status: 200, headers: { "content-type": "application/json" } });
  }
  return new Response("mock write", { status: 200, headers: { "content-type": "text/plain" } });
};

async function exercise(body, contentType = "application/json") {
  relayTest.rateBuckets.clear();
  const res = response();
  await relay({
    method: "POST",
    headers: { "content-type": contentType, "x-real-ip": "198.51.100.123" },
    body,
  }, res);
  return res;
}

try {
  await test("blocks writes to reserved room-owner KV namespace before upstream", async () => {
    calls = [];
    const result = await exercise({ action: "kvSet", ns: "room-owners", key: "d-test", value: "spoofed" });
    assert.equal(result.statusCode, 403);
    assert.equal(calls.length, 0);
  });

  await test("blocks arbitrary KV namespaces before upstream", async () => {
    calls = [];
    const result = await exercise({ action: "kvSet", ns: "other", key: "somekey", value: "value" });
    assert.equal(result.statusCode, 403);
    assert.equal(calls.length, 0);
  });

  await test("rejects non-string KV fields without coercion", async () => {
    calls = [];
    const result = await exercise({ action: "kvSet", ns: "topic", key: 123, value: "title" });
    assert.equal(result.statusCode, 400);
    assert.equal(calls.length, 0);
  });

  await test("rejects a DID note whose fingerprint does not match its DID", async () => {
    calls = [];
    const did = "did:key:z6MkuhrsP4tDZjWYdZLPxaur19WvrF1yuLGsGB2S8Q1gwS6K";
    const result = await exercise({ action: "kvSet", ns: "did", key: "0000000000000000", value: did });
    assert.equal(result.statusCode, 400);
    assert.equal(calls.length, 0);
  });

  await test("allows a correctly bound DID note through the mocked upstream", async () => {
    calls = [];
    const did = "did:key:z6MkuhrsP4tDZjWYdZLPxaur19WvrF1yuLGsGB2S8Q1gwS6K";
    const key = createHash("sha256").update(did, "utf8").digest("hex").slice(0, 16);
    const result = await exercise({ action: "kvSet", ns: "did", key, value: did });
    assert.equal(result.statusCode, 200);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /https:\/\/technocore\.chat\/kv\/did-[0-9a-f]{2}\/[0-9a-f]{14}\/set\//);
  });

  await test("rejects an unsigned profile overwrite before upstream", async () => {
    calls = [];
    const result = await exercise({ action: "kvSet", ns: "profile", key: "deadbeefdeadbeef", value: '{"did":"victim","name":"spoof"}' });
    assert.equal(result.statusCode, 400);
    assert.equal(calls.length, 0);
  });

  await test("rejects a profile key belonging to another DID before upstream", async () => {
    calls = [];
    const result = await exercise(signedProfileBody({ key: "deadbeefdeadbeef" }));
    assert.equal(result.statusCode, 403);
    assert.equal(calls.length, 0);
  });

  await test("rejects a modified signed profile value before upstream", async () => {
    calls = [];
    const body = signedProfileBody();
    body.value = body.value.replace("Synthetic profile", "forged profile");
    const result = await exercise(body);
    assert.equal(result.statusCode, 400);
    assert.equal(calls.length, 0);
  });

  await test("preserves owner-signed profile and public topic writes with mocked upstream", async () => {
    calls = [];
    const profile = await exercise(signedProfileBody());
    assert.equal(profile.statusCode, 200);
    const topic = await exercise({ action: "kvSet", ns: "topic", key: "lobby", value: "community chat" });
    assert.equal(topic.statusCode, 200);
    assert.equal(calls.length, 2);
    assert.match(calls[1].url, /\/kv\/topic\/lobby\/set\//);
  });

  await test("rejects misleading JSON content types", async () => {
    calls = [];
    const result = await exercise({ action: "kvSet", ns: "topic", key: "lobby", value: "title" }, "text/plain; note=application/json");
    assert.equal(result.statusCode, 415);
    assert.equal(calls.length, 0);
  });

  await test("accepts a valid Ed25519 signedPost through the mocked upstream", async () => {
    calls = [];
    const body = signedBody("mb-p-audit", "safe mock message");
    const result = await exercise(body);
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.seq, 2468);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].url, "https://technocore.chat/r/mb-p-audit?format=json");
    assert.deepEqual(JSON.parse(calls[0].body), {
      did: body.did, sig: body.sig, nonce: body.nonce, text: body.text,
    });
  });

  await test("blocks a tampered signedPost before any upstream write", async () => {
    calls = [];
    const body = signedBody();
    body.text = "tampered after signing";
    const result = await exercise(body);
    assert.equal(result.statusCode, 400);
    assert.equal(calls.length, 0);
  });

  await test("normalizes all Technocore single-line Unicode categories before verifying", async () => {
    calls = [];
    const body = signedBody("mb-p-audit", "Grüße\u00ad\ue000\u2028right");
    const result = await exercise(body);
    assert.equal(result.statusCode, 200);
    assert.equal(calls.length, 1);
    assert.equal(JSON.parse(calls[0].body).text, "Grüße right");
  });

  await test("rejects non-canonical signatures and non-string nonces", async () => {
    calls = [];
    const badSignature = signedBody();
    badSignature.sig = `${badSignature.sig.slice(0, -1)}B`;
    const sigResult = await exercise(badSignature);
    assert.equal(sigResult.statusCode, 400);
    assert.equal(calls.length, 0);

    const badNonce = signedBody();
    badNonce.nonce = 123;
    const nonceResult = await exercise(badNonce);
    assert.equal(nonceResult.statusCode, 400);
    assert.equal(calls.length, 0);
  });

  await test("kvGet remains read-only and uses the fixed public API host", async () => {
    calls = [];
    const result = await exercise({ action: "kvGet", ns: "did", key: "5ae177c258e12100" });
    assert.equal(result.statusCode, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "GET");
    assert.equal(calls[0].url, "https://technocore.chat/kv/did-5a/e177c258e12100");
  });

  await test("kvGet rejects malformed paths before upstream", async () => {
    calls = [];
    const result = await exercise({ action: "kvGet", ns: "../r", key: "lobby" });
    assert.equal(result.statusCode, 400);
    assert.equal(calls.length, 0);
  });

  await test("kvGet preserves the legacy DID note fallback after a sharded 404", async () => {
    calls = [];
    shardedDidMiss = true;
    try {
      const result = await exercise({ action: "kvGet", ns: "did", key: "5ae177c258e12100" });
      assert.equal(result.statusCode, 200);
      assert.equal(result.body, "legacy DID note");
      assert.deepEqual(calls.map(call => call.url), [
        "https://technocore.chat/kv/did-5a/e177c258e12100",
        "https://technocore.chat/kv/did/5ae177c258e12100",
      ]);
    } finally {
      shardedDidMiss = false;
    }
  });
} finally {
  globalThis.fetch = originalFetch;
}
