import test from "node:test";
import assert from "node:assert/strict";
import {
  DID, TESTNET_DOC, verifyDid, validateSource, readNetworkPage,
  textOnly, classifyNetworkPage, makeReport, runPreflight
} from "./flop-agent-preflight.mjs";

const PLANNED = '<!doctype html><p>Network: testnet (planned) · Release: next (unreleased) · Source: f6c89eaf7b96</p><h2>Expected genesis</h2><p>Unavailable — no verified public value</p><h2>RPC</h2><p>Unavailable — no verified public value</p>';
const fake = (html, status = 200, extra = {}) =>
  new Response(html, { status, headers: { "content-type": "text/html", ...extra } });

test("01: canonical RedDragon DID resolves to Ed25519 public key", () => {
  const result = verifyDid(DID);
  assert.equal(result.did, DID);
  assert.equal(result.codec, "ed25519-pub");
  assert.equal(result.publicKeyHex.length, 64);
  assert.equal(result.fingerprint.length, 16);
});

test("02: malformed public DID and wrong multicodec rejected", () => {
  for (const invalid of ["did:key:invalid", "did:key:z0", "did:key:z1", ""]) {
    assert.throws(() => verifyDid(invalid));
  }
});

test("03: strict source allowlist blocks impersonation and faucet calls", () => {
  assert.equal(validateSource(TESTNET_DOC), TESTNET_DOC);
  for (const invalid of [
    "https://docs.flop.network.attacker.invalid/networks/testnet",
    "http://docs.flop.network/networks/testnet",
    "https://docs.flop.network@attacker.invalid/networks/testnet",
    TESTNET_DOC + "?redirect=https://evil.test",
    "https://faucet.flop.network/fund"
  ]) assert.throws(() => validateSource(invalid));
});

test("04: a preflight issues GET without body, redirects or credentials", async () => {
  let calls = 0;
  const body = await readNetworkPage(TESTNET_DOC, { fetchFn: async (url, options) => {
    calls++;
    assert.equal(url, TESTNET_DOC);
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "error");
    assert.equal(options.credentials, "omit");
    assert.equal(options.cache, "no-store");
    assert.equal(options.body, undefined);
    return fake(PLANNED);
  } });
  assert.equal(calls, 1);
  assert.equal(body, PLANNED);
});

test("05: non-success HTTP fails closed", async () => {
  await assert.rejects(readNetworkPage(TESTNET_DOC, { fetchFn: async () => fake("quota", 429) }), /HTTP 429/);
});

test("06: invalid MIME type fails closed", async () => {
  await assert.rejects(readNetworkPage(TESTNET_DOC, {
    fetchFn: async () => fake("{}", 200, { "content-type": "application/json" })
  }), /MIME/);
});

test("07: misleading Content-Length or oversized real body rejected", async () => {
  await assert.rejects(readNetworkPage(TESTNET_DOC, {
    fetchFn: async () => fake("a", 200, { "content-length": "999999" })
  }), /size/);
  await assert.rejects(readNetworkPage(TESTNET_DOC, {
    fetchFn: async () => fake("A".repeat(263000))
  }), /size/);
});

test("08: response from a different URL cannot pass validation", async () => {
  const f = fake(PLANNED);
  await assert.rejects(readNetworkPage(TESTNET_DOC, {
    fetchFn: async () => ({ ok: true, url: "https://elsewhere.example/", headers: f.headers, body: f.body })
  }), /response URL/);
});

test("09: HTML scripts and comments do not affect status parsing", () => {
  const str = textOnly("<script>Network: testnet LIVE</script><!-- RPC: fake --><p>Network: testnet (planned)</p>");
  assert.doesNotMatch(str, /LIVE|fake/);
  assert.match(str, /testnet \(planned\)/);
});

test("10: official planned/unreleased testnet cannot be marked launched", () => {
  assert.equal(classifyNetworkPage(PLANNED).state, "not-launched");
});

test("11: devnet status can never be interpreted as testnet", () => {
  assert.equal(classifyNetworkPage("<p>Network: devnet (open)</p>").state, "unverified");
});

test("12: changed page requires human verification, not transactions", () => {
  const r = makeReport("<p>Network: testnet (public) · Release: 0.5.0</p>");
  assert.equal(r.state, "manual-verification-required");
  assert.equal(r.mayClaim, false);
  assert.equal(r.maySign, false);
  assert.equal(r.maySendInference, false);
});

test("13: generated report has provenance and no false reward claims", () => {
  const r = makeReport(PLANNED, new Date("2026-11-07T00:00:00Z"));
  assert.equal(r.checkedAt, "2026-11-07T00:00:00.000Z");
  assert.equal(r.readOnly, true);
  assert.equal(r.state, "not-launched");
  assert.equal(r.did, DID);
  assert.equal(r.sourceSha256.length, 64);
  assert.equal(r.testnetTx, null);
  assert.equal(r.settlementReceipt, null);
  assert.equal(r.devnetAirdropCredit, 0);
});

test("14: preflight only visits the official testnet URL", async () => {
  const requests = [];
  const result = await runPreflight({ fetchFn: async (url, options) => {
    requests.push([url, options.method]);
    return fake(PLANNED);
  } });
  assert.deepEqual(requests, [[TESTNET_DOC, "GET"]]);
  assert.equal(result.state, "not-launched");
});

test("15: known unavailable genesis takes priority over new release copy", () => {
  const r = classifyNetworkPage('<p>Network: testnet (public) · Release: 1.0.0</p><h2>Expected genesis</h2><p>Unavailable — no verified public value</p>');
  assert.equal(r.state, "not-launched");
});

test("16: no source or report requires private keys or signing", async () => {
  let attempted = 0;
  await assert.rejects(readNetworkPage("https://evil.invalid/", {
    fetchFn: async () => { attempted++; return fake(PLANNED); }
  }), /Unapproved/);
  assert.equal(attempted, 0);
  const r = await runPreflight({ fetchFn: async () => fake(PLANNED) });
  assert.doesNotMatch(JSON.stringify(r), /privateKey|seedPhrase|Authorization|access_token/i);
  assert.equal(r.maySign, false);
});
