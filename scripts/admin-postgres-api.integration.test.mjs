import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, generateKeyPairSync, sign } from "node:crypto";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { cryptoWaitReady, mnemonicGenerate } from "@polkadot/util-crypto";
import { Keyring } from "@polkadot/keyring";
import { PostgresAdminStore } from "../api/admin-postgres-store.js";
import { hashAdminPassword } from "../api/admin-store.js";

const require = createRequire(import.meta.url);
const connectionString = process.env.NEON_INTEGRATION_DATABASE_URL;
const required = process.env.REQUIRE_NEON_INTEGRATION === "1";
if (required && !connectionString) throw new Error("Required Neon integration secret is missing; refusing to skip");
const testClientIp = `198.51.100.${1 + randomBytes(1)[0] % 253}`;
const replayTestClientIp = `203.0.113.${1 + randomBytes(1)[0] % 253}`;
const base58Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58(bytes) {
  let value = BigInt(`0x${Buffer.from(bytes).toString("hex")}`), out = "";
  while (value) { const digit = Number(value % 58n); out = base58Alphabet[digit] + out; value /= 58n; }
  for (const byte of bytes) { if (byte) break; out = `1${out}`; }
  return out;
}
function createDid() {
  const pair = generateKeyPairSync("ed25519");
  const publicBytes = pair.publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  return { did: `did:key:z${base58(Buffer.concat([Buffer.from([0xed, 0x01]), publicBytes]))}`, privateKey: pair.privateKey };
}
function didSignature(identity, message) { return sign(null, Buffer.from(message), identity.privateKey).toString("base64url"); }
function walletPair() { const keyring = new Keyring({ type: "sr25519" }); return keyring.addFromMnemonic(mnemonicGenerate()); }
function walletSignature(pair, message) { return `0x${Buffer.from(pair.sign(message)).toString("hex")}`; }
async function body(response) { return response.json(); }
async function request(origin, action, payload = {}, options = {}) {
  const headers = { "content-type": "application/json", origin, "x-real-ip": testClientIp, ...(options.headers || {}) };
  return fetch(`${origin}/api/admin?action=${encodeURIComponent(action)}`, { method: options.method || "POST", headers, ...(options.method === "GET" ? {} : { body: JSON.stringify(payload) }) });
}
async function startServer(port, env) {
  const childEnv = { ...process.env, ...env, PORT: String(port) };
  delete childEnv.NEON_INTEGRATION_DATABASE_URL;
  const child = spawn(process.execPath, ["scripts/local-preview-server.mjs"], { cwd: process.cwd(), env: childEnv, stdio: "ignore" });
  const origin = `http://127.0.0.1:${port}`, deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${origin}/api/admin?action=session`)).ok) return { child, origin }; } catch {}
    if (child.exitCode !== null) throw new Error(`Admin API preview exited with ${child.exitCode}`);
    await delay(100);
  }
  child.kill("SIGTERM");
  throw new Error("Admin API preview did not become ready");
}

test("admin HTTP API fails closed when the configured database is unreachable", { timeout: 20_000 }, async () => {
  const port = 54_500 + Math.floor(Math.random() * 800), origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["scripts/local-preview-server.mjs"], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), DATABASE_URL: "postgres://redacted:redacted@127.0.0.1:1/unavailable?connect_timeout=1", NODE_ENV: "production" }, stdio: "ignore" });
  try {
    let response;
    const deadline = Date.now() + 8_000;
    while (Date.now() < deadline) {
      try { response = await fetch(`${origin}/api/admin?action=session`, { signal: AbortSignal.timeout(2_000) }); break; } catch {}
      if (child.exitCode !== null) throw new Error("Unavailable-database preview exited unexpectedly");
      await delay(100);
    }
    assert.ok(response, "admin API responds while backing database is down");
    assert.equal(response.status, 503, "database failure rejects the admin operation");
    assert.deepEqual(await body(response), { error: "Admin database unavailable" });
  } finally {
    if (child.exitCode === null) { child.kill("SIGTERM"); await new Promise(resolve => child.once("exit", resolve)); }
  }
});

test("Neon API verifies real DID and wallet signatures and completes isolated application/admin lifecycle", { skip: !connectionString && "Set NEON_INTEGRATION_DATABASE_URL to run real Neon API integration" , timeout: 180_000 }, async t => {
  await cryptoWaitReady();
  const namespace = randomBytes(12).toString("hex"), actor = `api-integration:${namespace}`;
  const password = `temporary-${randomBytes(24).toString("base64url")}`, adminHash = hashAdminPassword(password);
  const sessionSecret = randomBytes(32).toString("base64url");
  const oldDatabaseUrl = process.env.DATABASE_URL;
  const port = 44_000 + Math.floor(Math.random() * 10_000), ids = [], challengeIds = [];
  let server, store, emergencyStopChanged = false, initialEmergencyStop = false;
  process.env.DATABASE_URL = connectionString;
  try {
    const env = { DATABASE_URL: connectionString, ADMIN_PASSWORD_HASH: adminHash, ADMIN_SESSION_SECRET: sessionSecret, ADMIN_ACTOR: actor, NODE_ENV: "test" };
    delete env.NEON_INTEGRATION_DATABASE_URL;
    server = await startServer(port, env);
    const { origin } = server;
    store = await new PostgresAdminStore({ connectionString }).init();
    initialEmergencyStop = await store.isStopped();

    const applicant = { identity: createDid(), wallet: walletPair() };
    const rejectedApplicant = { identity: createDid(), wallet: walletPair() };
    const submit = async person => {
      const challengeResponse = await request(origin, "application-challenge", { did: person.identity.did, wallet: person.wallet.address });
      assert.equal(challengeResponse.status, 200, "API issues an identity-bound challenge");
      const challenge = await body(challengeResponse); challengeIds.push(challenge.challengeId);
      const proof = { challengeId: challenge.challengeId, didSignature: didSignature(person.identity, challenge.message), walletSignature: walletSignature(person.wallet, challenge.message) };
      const result = await request(origin, "application-submit", proof);
      assert.equal(result.status, 201, "valid DID and sr25519 signatures submit through HTTP API");
      const application = await body(result); ids.push(application.id);
      return { challenge, proof, application };
    };

    const pending = await submit(applicant);
    const rejectPending = await submit(rejectedApplicant);

    const invalidChallengeResponse = await request(origin, "application-challenge", { did: applicant.identity.did, wallet: applicant.wallet.address });
    const invalidChallenge = await body(invalidChallengeResponse); challengeIds.push(invalidChallenge.challengeId);
    const fake = await request(origin, "application-submit", { challengeId: invalidChallenge.challengeId, didSignature: "not-a-signature", walletSignature: "0x" + "00".repeat(64) });
    assert.equal(fake.status, 400, "forged signatures are rejected by the production API verifier");
    const crossIdentity = await request(origin, "application-submit", { challengeId: invalidChallenge.challengeId, didSignature: didSignature(rejectedApplicant.identity, invalidChallenge.message), walletSignature: walletSignature(applicant.wallet, invalidChallenge.message) });
    assert.equal(crossIdentity.status, 400, "proofs from another DID cannot claim the challenge");
    const crossWallet = await request(origin, "application-submit", { challengeId: invalidChallenge.challengeId, didSignature: didSignature(applicant.identity, invalidChallenge.message), walletSignature: walletSignature(rejectedApplicant.wallet, invalidChallenge.message) });
    assert.equal(crossWallet.status, 400, "proofs from another wallet cannot claim the challenge");
    const replay = await request(origin, "application-submit", pending.proof, { headers: { "x-real-ip": replayTestClientIp } });
    assert.equal(replay.status, 400, "a successful challenge cannot be replayed");
    const submitRateLimited = await request(origin, "application-submit", pending.proof);
    assert.equal(submitRateLimited.status, 429, "Neon-backed API rate limit rejects excessive submission attempts");
    for (let i = 0; i < 7; i++) {
      const limitedChallenge = await request(origin, "application-challenge", { did: applicant.identity.did, wallet: applicant.wallet.address });
      assert.equal(limitedChallenge.status, 200, "Neon-backed distributed challenge budget admits requests below its cap");
      challengeIds.push((await body(limitedChallenge)).challengeId);
    }
    const limitedOut = await request(origin, "application-challenge", { did: applicant.identity.did, wallet: applicant.wallet.address });
    assert.equal(limitedOut.status, 429, "Neon-backed API rate limit rejects requests above its cap");

    const unauthorized = await request(origin, "applications", {}, { method: "GET" });
    assert.equal(unauthorized.status, 403, "admin queue is denied without a session");
    const foreignOrigin = await fetch(`${origin}/api/admin?action=login`, { method: "POST", headers: { origin: "https://attacker.invalid", "content-type": "application/json" }, body: JSON.stringify({ password }) });
    assert.equal(foreignOrigin.status, 403, "foreign-origin login is rejected before creating a session");
    const login = await request(origin, "login", { password });
    assert.equal(login.status, 200);
    const setCookies = login.headers.getSetCookie();
    const cookie = setCookies.map(value => value.split(";")[0]).join("; ");
    const csrf = setCookies.find(value => value.startsWith("rd_csrf="))?.split(";")[0].slice("rd_csrf=".length);
    assert.ok(cookie.includes("rd_admin=")); assert.ok(csrf);
    const adminHeaders = { cookie, "x-csrf-token": csrf };
    const missingCsrf = await request(origin, "applications", {}, { method: "GET", headers: { cookie } });
    assert.equal(missingCsrf.status, 403, "admin session without CSRF token is rejected");
    const crossOriginAdmin = await request(origin, "applications", {}, { method: "GET", headers: { ...adminHeaders, origin: "https://attacker.invalid" } });
    assert.equal(crossOriginAdmin.status, 403, "authenticated admin session is still denied to a foreign origin");
    const queueResponse = await request(origin, "applications", {}, { method: "GET", headers: adminHeaders });
    assert.equal(queueResponse.status, 200);
    const queue = await body(queueResponse);
    assert.ok(queue.applications.some(row => row.id === pending.application.id && row.did === applicant.identity.did));

    const approve = await request(origin, "review", { id: pending.application.id, decision: "approve", permissions: { faucet: true, faucetLimit: 1, inference: true, inferenceLimit: 2 } }, { headers: adminHeaders });
    assert.equal(approve.status, 200); assert.equal((await body(approve)).application.status, "approved");
    const reject = await request(origin, "review", { id: rejectPending.application.id, decision: "reject" }, { headers: adminHeaders });
    assert.equal(reject.status, 200); assert.equal((await body(reject)).application.status, "rejected");
    const revokeFaucet = await request(origin, "revoke", { id: pending.application.id, permission: "faucet" }, { headers: adminHeaders });
    assert.equal(revokeFaucet.status, 200); assert.equal((await body(revokeFaucet)).application.faucet, 0);
    const permissionsAfterRevoke = await body(await request(origin, "applications", {}, { method: "GET", headers: adminHeaders }));
    assert.equal(permissionsAfterRevoke.applications.find(row => row.id === pending.application.id)?.inference, 1, "faucet revocation preserves the independent inference permission");
    const stop = await request(origin, "emergency-stop", { enabled: true }, { headers: adminHeaders });
    assert.equal(stop.status, 200); emergencyStopChanged = true;
    const auditResponse = await request(origin, "applications", {}, { method: "GET", headers: adminHeaders });
    const audit = await body(auditResponse);
    assert.ok(audit.audit.some(row => row.actor === applicant.identity.did && row.action === "application.submitted"));
    assert.ok(audit.audit.some(row => row.actor === actor && row.action === "application.approve"));
    assert.ok(audit.audit.some(row => row.actor === actor && row.action === "application.reject"));
    assert.ok(audit.audit.some(row => row.actor === actor && row.action === "permission.faucet.revoked"));
    assert.ok(audit.audit.some(row => row.actor === actor && row.action === "system.emergency_stop.enabled"));
    const logout = await request(origin, "logout", {}, { headers: adminHeaders });
    assert.equal(logout.status, 200);
    const afterLogout = await request(origin, "applications", {}, { method: "GET", headers: adminHeaders });
    assert.equal(afterLogout.status, 403, "revoked session cannot access the admin API");
    t.diagnostic("Real Neon API lifecycle passed with ephemeral DID and wallet keys; no key material was logged.");
  } finally {
    try {
      if (server?.child && server.child.exitCode === null) { server.child.kill("SIGTERM"); await new Promise(resolve => server.child.once("exit", resolve)); }
      if (store) {
        try {
          await store.tx(async client => {
            if (ids.length) {
              await client.query("DELETE FROM rd_admin_usage WHERE application_id=ANY($1::text[])", [ids]);
              await client.query("DELETE FROM rd_admin_audit WHERE target=ANY($1::text[])", [ids]);
              await client.query("DELETE FROM rd_admin_applications WHERE id=ANY($1::text[])", [ids]);
            }
            if (challengeIds.length) await client.query("DELETE FROM rd_admin_challenges WHERE id=ANY($1::text[])", [challengeIds]);
            await client.query("DELETE FROM rd_admin_audit WHERE actor=$1", [actor]);
            await client.query("DELETE FROM rd_admin_sessions WHERE actor=$1", [actor]);
            await client.query("DELETE FROM rd_admin_rate_limits WHERE key IN ($1,$2,$3,$4,$5,$6)", [`apply:${testClientIp}`,`submit:${testClientIp}`,`login:${testClientIp}`,`apply:${replayTestClientIp}`,`submit:${replayTestClientIp}`,`login:${replayTestClientIp}`]);
            if (emergencyStopChanged) await client.query("UPDATE rd_admin_state SET value=$1 WHERE key='emergency_stop'", [initialEmergencyStop ? "true" : "false"]);
          });
        } finally { await store.close(); }
      }
    } finally {
      if (oldDatabaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldDatabaseUrl;
    }
  }
});
