import test from "node:test";
import assert from "node:assert/strict";
import flopStatus, { buildStatus, classifyTestnetPage, parseCommit, parseDevnetPage, parseFaucetChain, parseFaucetLimits, parsePackageVersions, parseTimelinePage, parseValidatorManual, parseValidatorPackage, sourceText, __test } from "../api/flop-status.js";
import { isPublicEd25519Did, ledgerStorageKey, loadDidLedger, saveDidLedger } from "../public/flop-did-utils.js";

const testnet = `<h1>testnet network</h1><p>Network: testnet (planned) · Release: next (unreleased)</p><p>Public operator enrollment is unavailable.</p><p>RPC Unavailable — no verified public value</p>`;
const devnet = `<h1>devnet network</h1><p>Network: devnet (development) · Release: next (unreleased)</p><p>RPC wss://rpc.devnet.flop.network</p><p>Gateway https://api.flop.network</p><p>Model catalog https://api.flop.network/v1/models</p><p>Public devnet endpoints are available. Operator enrollment and inference readiness require separate checks.</p><p>Devnet is running and earns nothing: no rewards and no airdrop weight.</p>`;
const sdk = `<p>@flop-labs/client 0.2.1 (npm)</p><p>@flop-labs/sdk 0.4.0 (npm)</p><p>@flop-labs/cli 0.4.0 (npm)</p><p>flop-sdk 0.2.0 (PyPI)</p>`;
const timeline = `<p>Last updated 2026-10-30</p><p>The working target is Tuesday 3 November 2026. It is a target rather than a fixed date.</p><p>Devnet earns nothing: no rewards and no airdrop weight.</p><p>Testnet is open — no whitelist.</p>`;

test("testnet status is fail-closed for planned, unreleased and unknown source copy", () => {
  assert.deepEqual(classifyTestnetPage(testnet), { state: "not-live", release: "next (unreleased)" });
  assert.equal(classifyTestnetPage("<p>Network: testnet</p><p>Release: 1.0</p>").state, "unverified");
  assert.equal(classifyTestnetPage("<p>Launch is soon</p>").state, "unverified");
});

test("official live-but-unscored Testnet wording is distinct from an activation block", () => {
  const page = "<h1>FLOP Testnet</h1><p>FLOP Testnet went live on 24 November 2026 with six founding validators.</p><p>This opening is unscored. Voucher earning starts at the publicly announced finalized block of a future upgrade.</p>";
  assert.deepEqual(classifyTestnetPage(page), { state: "live-unscored", release: "live · unscored" });
  assert.equal(classifyTestnetPage(page.replace("unscored", "scored")).state, "unverified");
});

test("Testnet faucet parsers require exact network identity and signed agent-claim limits", () => {
  const genesisHash = "0x918abd58fb16306b30ef3886514cfaebffecb4de43e82b6f8ec4795c43cfd800";
  const chain = parseFaucetChain({ network: "testnet", genesisHash, rpc: "wss://testnet.flop.network", ss58Format: 42, decimals: 18, tokenSymbol: "FLOP", technocoreBot: { did: "not-returned" } });
  assert.equal(chain.genesisHash, genesisHash);
  assert.equal("technocoreBot" in chain, false);
  assert.throws(() => parseFaucetChain({ network: "devnet", genesisHash, rpc: "wss://testnet.flop.network", ss58Format: 42, decimals: 18, tokenSymbol: "FLOP" }), /identity mismatch/);
  assert.throws(() => parseFaucetChain({ network: "testnet", genesisHash: "0x" + "0".repeat(64), rpc: "wss://testnet.flop.network", ss58Format: 42, decimals: 18, tokenSymbol: "FLOP" }), /identity mismatch/);
  const limits = parseFaucetLimits({ network: "testnet", asOf: "2026-11-25T18:00:00Z", faucet: { status: "open", agent: { grantFlop: 10, claimPath: "/v1/testnet/agent-claims", rolling24HourCapFlop: 10, cooldownSeconds: 86400, rolloverRequiresSpend: true } } });
  assert.equal(limits.state, "open");
  assert.equal(limits.grantFlop, "10");
  assert.equal(limits.cooldownSeconds, 86400);
  assert.throws(() => parseFaucetLimits({ network: "testnet", faucet: { status: "open", agent: { grantFlop: 10, claimPath: "/fund", rolling24HourCapFlop: 10, cooldownSeconds: 86400 } } }), /contract/);
  assert.throws(() => parseFaucetLimits({ network: "devnet", faucet: { status: "open", agent: { grantFlop: 10, claimPath: "/v1/testnet/agent-claims", rolling24HourCapFlop: 10, cooldownSeconds: 86400 } } }), /contract/);
});

test("devnet parser separates public endpoints from operator admission and reward status", () => {
  const parsed = parseDevnetPage(devnet);
  assert.equal(parsed.state, "public-development-network");
  assert.equal(parsed.operatorEnrollment, "administrator-assisted / public self-service unavailable");
  assert.equal(parsed.rewards, "none");
  assert.equal(parseDevnetPage(devnet.replace("wss://rpc.devnet.flop.network", "https://bad.example/rpc")).rpc, null);
});

test("only named FLOP packages are parsed", () => {
  const versions = parsePackageVersions(sdk);
  assert.deepEqual(versions.map(({ name, version }) => `${name} ${version}`), [
    "@flop-labs/client 0.2.1", "@flop-labs/sdk 0.4.0", "@flop-labs/cli 0.4.0", "flop-sdk 0.2.0"
  ]);
  assert.equal(parsePackageVersions("<p>@flop-labs/not-a-package 9.9.9</p>").length, 0);
});

test("validator explorer version is distinguished from the older/manual guide version", () => {
  const explorer = parseValidatorPackage("<p>validator-cs-be91fe83 · 0.4.1-devnet.1 · FLOP Devnet</p><p>Administrator-assisted devnet onboarding.</p>");
  const manual = parseValidatorManual("<p>Last updated 2026-11-06</p><p>Use 0.4.0-devnet.1 for the current devnet.</p>");
  assert.equal(explorer.packageVersion, "0.4.1-devnet.1");
  assert.match(explorer.admission, /administrator-assisted/);
  assert.equal(manual.packageVersion, "0.4.0-devnet.1");
  assert.equal(manual.updated, "2026-11-06");
});

test("official timeline is dated and its testnet contradiction never changes network status", () => {
  const parsed = parseTimelinePage(timeline);
  assert.equal(parsed.updated, "2026-10-30");
  assert.equal(parsed.testnetTarget, "Tuesday 3 November 2026");
  assert.equal(parsed.testnetTargetIsUnconfirmed, true);
  assert.equal(parsed.testnetOpenClaim, true);
  assert.equal(parsed.devnetRewards, "none");
  assert.equal(classifyTestnetPage(testnet).state, "not-live");
  assert.throws(() => __test.safeUrl("https://docs.flop.network/docs/testnet-and-timeline?next=https://evil.example"), /not allowlisted/);
});

test("public DID format check validates Ed25519 multicodec and isolates browser ledgers by DID", () => {
  const redDragon = "did:key:z6MkuhrsP4tDZjWYdZLPxaur19WvrF1yuLGsGB2S8Q1gwS6K";
  const other = "did:key:z6MkqEhk421dSv8pEnDvWVPatEMegY2RgXU2ksDw5pbUbU48";
  assert.equal(isPublicEd25519Did(redDragon), true);
  assert.equal(isPublicEd25519Did(other), true);
  assert.equal(isPublicEd25519Did("did:key:z6Mk0invalid"), false);
  assert.equal(isPublicEd25519Did(other), true);
  assert.notEqual(ledgerStorageKey(redDragon), ledgerStorageKey(other));
  assert.equal(ledgerStorageKey("not-a-did"), "");
});

test("DID ledger read/write rejects cross-DID records and malformed stored state", () => {
  const redDragon = "did:key:z6MkuhrsP4tDZjWYdZLPxaur19WvrF1yuLGsGB2S8Q1gwS6K";
  const other = "did:key:z6MkqEhk421dSv8pEnDvWVPatEMegY2RgXU2ksDw5pbUbU48";
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const red = { version: 1, did: redDragon, createdAt: "2026-11-10T00:00:00.000Z", entries: [{ amount: 1, type: "faucet" }] };
  const user = { version: 1, did: other, createdAt: "2026-11-10T00:00:00.000Z", entries: [{ amount: 2, type: "inference" }] };
  assert.equal(saveDidLedger(storage, red), true);
  assert.equal(saveDidLedger(storage, user), true);
  assert.deepEqual(loadDidLedger(storage, redDragon).entries, red.entries);
  assert.deepEqual(loadDidLedger(storage, other).entries, user.entries);
  values.set(ledgerStorageKey(other), JSON.stringify(red));
  assert.deepEqual(loadDidLedger(storage, other).entries, [], "a record declaring a different DID is ignored");
  values.set(ledgerStorageKey(redDragon), "{broken json");
  assert.deepEqual(loadDidLedger(storage, redDragon).entries, [], "malformed browser data fails closed");
  assert.equal(saveDidLedger(storage, { ...red, did: "invalid" }), false);
});

test("source validation rejects unlisted endpoints and keeps HTML text extraction inert", () => {
  assert.throws(() => __test.safeUrl("https://docs.flop.network.evil.example/networks/testnet"), /not allowlisted/);
  assert.throws(() => __test.safeUrl("https://docs.flop.network/networks/testnet?url=https://evil.example"), /not allowlisted/);
  assert.equal(__test.safeUrl(__test.SOURCES.testnetModels), "https://gateway.testnet.flop.network/v1/models");
  assert.match(sourceText('<script>secret()</script><p>FLOP &amp; testnet</p>'), /FLOP & testnet/);
  assert.doesNotMatch(sourceText('<script>secret()</script><p>FLOP</p>'), /secret/);
});

test("streamed source size, MIME, redirect and JSON parsing failures are rejected", async () => {
  const ok = await __test.fetchText(__test.SOURCES.testnet, async () => new Response("official page", { headers: { "content-type": "text/html" } }));
  assert.equal(ok, "official page");
  await assert.rejects(__test.fetchText(__test.SOURCES.testnet, async () => new Response("x".repeat(257 * 1024), { headers: { "content-type": "text/html" } })), /size exceeded/);
  await assert.rejects(__test.fetchText(__test.SOURCES.testnet, async () => new Response("{}", { headers: { "content-type": "image/png" } })), /source type/);
  await assert.rejects(__test.fetchText(__test.SOURCES.testnet, async () => { const r = new Response("ok", { headers: { "content-type": "text/html" } }); Object.defineProperty(r, "redirected", { value: true }); return r; }), /redirect/);
  assert.throws(() => parseCommit({ sha: "not-a-commit", commit: {} }), /Malformed/);
});

test("timeouts produce explicit aborts rather than fabricated success", async () => {
  await assert.rejects(__test.fetchText(__test.SOURCES.testnet, (url, options) => new Promise((_, reject) => options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))), { timeoutMs: 20 }), /aborted/);
});

test("all read-only sources and RPC errors remain visible as unverified", async () => {
  const fetchFn = async (url, options = {}) => {
    if (url === __test.SOURCES.testnet) return new Response(testnet, { headers: { "content-type": "text/html" } });
    if (url === __test.SOURCES.devnet) return new Response(devnet, { headers: { "content-type": "text/html" } });
    if (url === __test.SOURCES.official) return new Response("<p>There is no FLOP token yet. Updated 2026-10-23</p>", { headers: { "content-type": "text/html" } });
    if (url === __test.SOURCES.sdks) return new Response(sdk, { headers: { "content-type": "text/html" } });
    if (url === __test.SOURCES.validator || url === __test.SOURCES.validatorManual) return new Response("<p>Administrator-assisted devnet onboarding</p><p>Use 0.4.0-devnet.1</p>", { headers: { "content-type": "text/html" } });
    if (url === __test.SOURCES.timeline) return new Response(timeline, { headers: { "content-type": "text/html" } });
    if (url === __test.SOURCES.paperContent) return new Response(JSON.stringify([{ sha: "content-sha", commit: { committer: { date: "2026-10-26T12:00:00Z" }, message: "docs(yellowpaper): content sync" } }]), { headers: { "content-type": "application/json" } });
    if (url === __test.SOURCES.repoHead) return new Response(JSON.stringify({ sha: "ci-sha", commit: { committer: { date: "2026-11-05T12:00:00Z" }, message: "ci(triage): update classifier" } }), { headers: { "content-type": "application/json" } });
    if (url === __test.SOURCES.models) return new Response(JSON.stringify({ object: "list", data: [{ id: "model-a", name: "Model A", owned_by: "flop-network" }] }), { headers: { "content-type": "application/json" } });
    if (url === __test.SOURCES.testnetModels) return new Response(JSON.stringify({ object: "list", data: [{ id: "testnet-model-a", name: "Testnet Model A", owned_by: "flop-network" }] }), { headers: { "content-type": "application/json" } });
    if (url === __test.SOURCES.rpc || url === __test.SOURCES.testnetRpc || url === __test.SOURCES.faucetChain || url === __test.SOURCES.faucetLimits) throw new Error("network unavailable");
    throw new Error("Unexpected source");
  };
  const data = await buildStatus({ fetchFn, now: new Date("2026-11-10T12:00:00Z") });
  assert.equal(data.testnet.state, "not-live");
  assert.equal(data.devnet.state, "public-development-network");
  assert.equal(data.devnet.rewards, "none");
  assert.equal(data.timeline.updated, "2026-10-30");
  assert.equal(data.timeline.testnetOpenClaim, true);
  assert.equal(data.testnet.state, "not-live");
  assert.equal(data.services.gateway.state, "catalog-responded");
  assert.equal(data.services.testnetGateway.state, "catalog-responded");
  assert.equal(data.services.testnetGateway.count, 1);
  assert.equal(data.services.testnetGateway.inference, "not-tested-no-authorized-key");
  assert.equal(data.services.rpc.state, "unverified");
  assert.equal(data.yellowPaper.githubContentCommit.sha, "content-sha");
  assert.equal(data.yellowPaper.githubRepositoryHead.sha, "ci-sha");
  assert.equal(data.yellowPaper.contentVsCiDistinguished, true);
});

test("live Testnet status requires matching block zero, faucet chain identity and open signed-claim limits", async () => {
  const expected = "0x918abd58fb16306b30ef3886514cfaebffecb4de43e82b6f8ec4795c43cfd800";
  const livePage = "<h1>FLOP Testnet</h1><p>FLOP Testnet went live on 24 November 2026 with six founding validators.</p><p>This opening is unscored. Voucher earning starts at the publicly announced finalized block of a future upgrade.</p>";
  const faucetChain = { network: "testnet", genesisHash: expected, rpc: "wss://testnet.flop.network", ss58Format: 42, decimals: 18, tokenSymbol: "FLOP" };
  const faucetLimits = { network: "testnet", asOf: "2026-11-25T18:00:00.000Z", stale: false, faucet: { status: "open", agent: { grantFlop: 10, claimPath: "/v1/testnet/agent-claims", rolling24HourCapFlop: 10, cooldownSeconds: 86400, rolloverRequiresSpend: true } } };
  const fetchFn = async (url, options = {}) => {
    if (url === __test.SOURCES.testnet) return new Response(livePage, { headers: { "content-type": "text/html" } });
    if (url === __test.SOURCES.devnet) return new Response(devnet, { headers: { "content-type": "text/html" } });
    if (url === __test.SOURCES.official) return new Response("<p>There is no FLOP token yet. Updated 2026-11-25</p>", { headers: { "content-type": "text/html" } });
    if (url === __test.SOURCES.sdks) return new Response(sdk, { headers: { "content-type": "text/html" } });
    if (url === __test.SOURCES.validator || url === __test.SOURCES.validatorManual) return new Response("<p>Administrator-assisted devnet onboarding</p><p>Use 0.4.0-devnet.1</p>", { headers: { "content-type": "text/html" } });
    if (url === __test.SOURCES.timeline) return new Response(timeline, { headers: { "content-type": "text/html" } });
    if (url === __test.SOURCES.paperContent) return new Response(JSON.stringify([{ sha: "content-sha", commit: { committer: { date: "2026-10-26T12:00:00Z" }, message: "paper" } }]), { headers: { "content-type": "application/json" } });
    if (url === __test.SOURCES.repoHead) return new Response(JSON.stringify({ sha: "head-sha", commit: { committer: { date: "2026-11-05T12:00:00Z" }, message: "ci" } }), { headers: { "content-type": "application/json" } });
    if (url === __test.SOURCES.models) return new Response(JSON.stringify({ object: "list", data: [{ id: "model-a", name: "Model A", owned_by: "flop-network" }] }), { headers: { "content-type": "application/json" } });
    if (url === __test.SOURCES.testnetModels) return new Response(JSON.stringify({ object: "list", data: [{ id: "testnet-model-a", name: "Testnet Model A", owned_by: "flop-network" }] }), { headers: { "content-type": "application/json" } });
    if (url === __test.SOURCES.faucetChain) return new Response(JSON.stringify(faucetChain), { headers: { "content-type": "application/json" } });
    if (url === __test.SOURCES.faucetLimits) return new Response(JSON.stringify(faucetLimits), { headers: { "content-type": "application/json" } });
    if (url === `${__test.SOURCES.rpc}/` || url === `${__test.SOURCES.testnetRpc}/`) {
      const { id, method } = JSON.parse(options.body);
      const isTestnet = url === `${__test.SOURCES.testnetRpc}/`;
      const result = method === "chain_getBlockHash" ? (isTestnet ? expected : "0x99c172c095340ace980631f9123544c6bebd4839f3437e463533422d8be2d631") : method === "system_chain" ? "FLOP Devnet" : "test-version";
      return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), { headers: { "content-type": "application/json" } });
    }
    throw new Error(`Unexpected source ${url}`);
  };
  const data = await buildStatus({ fetchFn, now: new Date("2026-11-25T18:01:00.000Z") });
  assert.equal(data.testnet.state, "live-unscored");
  assert.equal(data.services.testnetRpc.state, "identity-matched");
  assert.equal(data.services.faucet.ready, true);
  assert.equal(data.services.faucet.limits.grantFlop, "10");
  assert.equal(data.services.testnetGateway.state, "catalog-responded");
  assert.equal(data.services.testnetGateway.inference, "not-tested-no-authorized-key");
  const stale = await buildStatus({ fetchFn, now: new Date("2026-11-25T18:06:00.000Z") });
  assert.equal(stale.services.faucet.ready, false, "faucet limits older than five minutes must not enable claim preparation");
  assert.equal(stale.services.faucet.state, "unverified");
});

test("Testnet gateway discovery accepts an empty public catalog without enabling inference", async () => {
  const parsed = __test.parseModels(JSON.stringify({ object: "list", data: [] }));
  assert.equal(parsed.count, 0);
  assert.deepEqual(parsed.models, []);
});

function apiResponse() {
  return {
    headers: {}, statusCode: 200, body: undefined,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; return this; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; }
  };
}

test("status API rejects non-GET and reports source failures as unverified without cache", async () => {
  const originalFetch = globalThis.fetch;
  __test.resetCache();
  const methodRes = apiResponse();
  await flopStatus({ method: "POST" }, methodRes);
  assert.equal(methodRes.statusCode, 405);
  assert.equal(methodRes.headers.allow, "GET");

  globalThis.fetch = async () => { throw new Error("network unavailable in test"); };
  try {
    const res = apiResponse();
    await flopStatus({ method: "GET" }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.testnet.state, "unverified");
    assert.equal(res.body.devnet.state, "unverified");
    assert.equal(res.body.services.rpc.state, "unverified");
    assert.equal(res.body.services.gateway.state, "unverified");
    assert.equal(res.body.stale, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    __test.resetCache();
  }
});

test("status API marks old cache stale when current source checks fail", async () => {
  const originalFetch = globalThis.fetch;
  const old = { schema: "reddragon-flop-live-status/v1", checkedAt: "2026-11-09T00:00:00.000Z", testnet: { state: "not-live" } };
  __test.seedCache(old, Date.now() - 3 * 60_000);
  globalThis.fetch = async () => { throw new Error("upstream unavailable"); };
  try {
    const res = apiResponse();
    await flopStatus({ method: "GET" }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.stale, true);
    assert.equal(res.body.testnet.state, "not-live");
    assert.ok(res.body.cachedAt);
    assert.match(res.headers["cache-control"], /stale-while-revalidate/);
  } finally {
    globalThis.fetch = originalFetch;
    __test.resetCache();
  }
});
