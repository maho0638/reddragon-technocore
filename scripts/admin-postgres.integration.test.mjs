import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { PostgresAdminStore } from "../api/admin-postgres-store.js";

const connectionString = process.env.NEON_INTEGRATION_DATABASE_URL;
const required = process.env.REQUIRE_NEON_INTEGRATION === "1";
if (required && !connectionString) throw new Error("Required Neon integration secret is missing; refusing to skip the test");
const secretBefore = process.env.ADMIN_SESSION_SECRET;

test("Neon PostgreSQL persists review, permissions, sessions and atomic limits across concurrent pools and restart", { skip: !connectionString && "Set NEON_INTEGRATION_DATABASE_URL to run PostgreSQL integration checks" }, async () => {
  process.env.ADMIN_SESSION_SECRET = randomBytes(32).toString("hex");
  const namespace = randomBytes(8).toString("hex");
  const actor = `integration:${namespace}`;
  const rateKey = `integration:${namespace}`;
  const applicationIds = [];
  const challengeIds = [];
  const did = "did:key:z6Mkuq5Jc7KZki3G98xZVW8fLkqV2oyNNM6fQGgYgq8ZQJYq";
  const wallet = "5GrwvaEF5zXb26Fz9rcQpDWSV3mH4YfJ7JY5j9j2QZ3g8d2";
  let a, b, c, token, originalPoolsClosed = false, stopChanged = false;
  try {
    a = await new PostgresAdminStore({ connectionString }).init();
    b = await new PostgresAdminStore({ connectionString }).init();
    assert.equal(await a.isStopped(),false,"site-qa test branch must begin with emergency stop disabled");

    const createApplication = async () => {
      const challenge = await a.issueChallenge({ did, wallet });
      challengeIds.push(challenge.challengeId);
      const app = await a.submitApplication({ challengeId:challenge.challengeId, didSignature:"test-did-proof", walletSignature:"test-wallet-proof", verifyDid:async()=>true, verifyWallet:async()=>true });
      applicationIds.push(app.id);
      return app;
    };

    const approved = await createApplication();
    const rejected = await createApplication();
    await a.reviewApplication({ id:approved.id, decision:"approve", permissions:{faucet:true,faucetLimit:1,inference:true,inferenceLimit:4}, actor });
    await a.reviewApplication({ id:rejected.id, decision:"reject", actor });
    const reviewed = await a.listApplications();
    assert.equal(reviewed.find(row=>row.id===approved.id)?.status,"approved");
    assert.equal(reviewed.find(row=>row.id===rejected.id)?.status,"rejected");
    assert.equal(reviewed.find(row=>row.id===rejected.id)?.inference,0);

    assert.deepEqual(await a.consumePermission({id:approved.id,permission:"faucet"}),{allowed:true,remaining:0});
    assert.deepEqual(await b.consumePermission({id:approved.id,permission:"faucet"}),{allowed:false,reason:"daily-limit"});
    await a.revoke({id:approved.id,permission:"faucet",actor});
    assert.deepEqual(await b.consumePermission({id:approved.id,permission:"faucet"}),{allowed:false,reason:"permission-not-granted"});
    assert.equal((await b.listApplications()).find(row=>row.id===approved.id)?.inference,1,"revoking faucet must preserve inference permission");

    await a.emergencyStop({enabled:true,actor});
    stopChanged = true;
    assert.deepEqual(await b.consumePermission({id:approved.id,permission:"inference"}),{allowed:false,reason:"emergency-stop"});
    await a.emergencyStop({enabled:false,actor});
    stopChanged = false;
    const concurrent = await Promise.all(Array.from({length:20},(_,i)=>(i%2?a:b).consumePermission({id:approved.id,permission:"inference"})));
    assert.equal(concurrent.filter(result=>result.allowed).length,4,"parallel requests through independent pools must respect the per-user quota");
    assert.ok(concurrent.some(result=>result.reason==="daily-limit"));
    await a.revoke({id:approved.id,permission:"inference",actor});
    assert.deepEqual(await b.consumePermission({id:approved.id,permission:"inference"}),{allowed:false,reason:"permission-not-granted"});

    const rateResults = await Promise.all(Array.from({length:20},(_,i)=>(i%2?a:b).allowRate(rateKey,3,60_000)));
    assert.equal(rateResults.filter(Boolean).length,3,"atomic shared rate-limit admits exactly its configured cap across pools");
    token = await a.createSession(actor);
    assert.ok(await b.session(token),"session is visible across independent pools");
    await a.revokeSession(token,actor);
    assert.equal(await b.session(token),null,"session revocation is shared immediately");

    await a.close(); await b.close(); originalPoolsClosed = true;
    c = await new PostgresAdminStore({connectionString}).init();
    const afterRestart = await c.listApplications();
    assert.equal(afterRestart.find(row=>row.id===approved.id)?.status,"approved","application state survives closing and reopening the database pool");
    assert.equal(afterRestart.find(row=>row.id===rejected.id)?.status,"rejected","rejection survives closing and reopening the database pool");
    assert.deepEqual(await c.consumePermission({id:approved.id,permission:"inference"}),{allowed:false,reason:"permission-not-granted"},"revoked permission remains revoked after reopening");
    assert.equal(await c.allowRate(rateKey,3,60_000),false,"rate-limit counter persists across reopening");
    assert.equal(await c.session(token),null,"revoked administrator session remains revoked after reopening");
    assert.equal(await c.isStopped(),false,"emergency-stop state survives reopening in its disabled state");
    const log = await c.auditLog();
    assert.ok(log.some(row=>row.actor===actor&&row.action==="application.reject"),"rejection is present in the durable audit log");
    assert.ok(log.some(row=>row.actor===actor&&row.action==="admin.logout"),"session revocation is present in the durable audit log");
  } finally {
    const cleanup = c || (!originalPoolsClosed ? a : undefined);
    if (cleanup && stopChanged) { try { await cleanup.emergencyStop({enabled:false,actor}); } catch {} }
    if (cleanup && (applicationIds.length || challengeIds.length || token)) {
      try {
        await cleanup.tx(async client=>{
          if (applicationIds.length) {
            await client.query("DELETE FROM rd_admin_usage WHERE application_id = ANY($1::text[])",[applicationIds]);
            await client.query("DELETE FROM rd_admin_audit WHERE target = ANY($1::text[])",[applicationIds]);
            await client.query("DELETE FROM rd_admin_applications WHERE id = ANY($1::text[])",[applicationIds]);
          }
          if (challengeIds.length) await client.query("DELETE FROM rd_admin_challenges WHERE id = ANY($1::text[])",[challengeIds]);
          await client.query("DELETE FROM rd_admin_audit WHERE actor=$1",[actor]);
          await client.query("DELETE FROM rd_admin_rate_limits WHERE key=$1",[rateKey]);
          await client.query("DELETE FROM rd_admin_sessions WHERE actor=$1",[actor]);
        });
      } catch { /* Preserve the test failure if Neon is already unavailable. */ }
    }
    for (const store of [a,b,c]) if (store) { try { await store.close(); } catch {} }
    if (secretBefore===undefined) delete process.env.ADMIN_SESSION_SECRET; else process.env.ADMIN_SESSION_SECRET=secretBefore;
  }
});

test("PostgreSQL adapter fails closed on initialization and mid-request connection outages", async () => {
  let unavailable = false;
  const pool = {
    async query() { if (unavailable) throw new Error("simulated database outage"); return {rows:[]}; },
    async connect() { if (unavailable) throw new Error("simulated database connection loss"); throw new Error("unexpected connection request"); },
    async end() {}
  };
  const store = new PostgresAdminStore({ pool });
  await store.init();
  unavailable = true;
  await assert.rejects(store.allowRate("outage-test",1,1000),/simulated database outage/);
  await assert.rejects(store.tx(async()=>true),/simulated database connection loss/);
  await store.close();
});
