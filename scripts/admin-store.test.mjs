import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { pbkdf2Sync } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AdminStore, hashAdminPassword, verifyAdminPassword } from "../api/admin-store.js";
import { distributedLimit } from "../api/rate-limit.js";

const DID="did:key:z6Mkuq5Jc7KZki3G98xZVW8fLkqV2oyNNM6fQGgYgq8ZQJYq";
const WALLET="5GrwvaEF5zXb26Fz9rcQpDWSV3mH4YfJ7JY5j9j2QZ3g8d2";

test("admin password hashes are salted and verified without plain-text storage",()=>{
  const encoded=hashAdminPassword("correct horse battery staple", "0123456789abcdef0123456789abcdef");
  assert.match(encoded,/^scrypt\$/); assert.equal(verifyAdminPassword("correct horse battery staple",encoded),true); assert.equal(verifyAdminPassword("wrong",encoded),false);
});

test("application challenges are one-use and review, revoke, stop and audit are atomic",()=>{
  let now=1_800_000_000_000; const store=new AdminStore({filename:":memory:",now:()=>now});
  const challenge=store.issueChallenge({did:DID,wallet:WALLET});
  const app=store.submitApplication({challengeId:challenge.challengeId,didSignature:"d",walletSignature:"w",verifyDid:(d,m,s)=>d===DID&&m===challenge.message&&s==="d",verifyWallet:(w,m,s)=>w===WALLET&&m===challenge.message&&s==="w"});
  assert.equal(app.status,"pending"); assert.throws(()=>store.submitApplication({challengeId:challenge.challengeId,didSignature:"d",walletSignature:"w",verifyDid:()=>true,verifyWallet:()=>true}),/expired or already used/);
  const approved=store.reviewApplication({id:app.id,decision:"approve",permissions:{faucet:true,inference:true,faucetLimit:1,inferenceLimit:2},actor:"admin"});
  assert.equal(approved.faucet,1); assert.equal(approved.inference,1);
  assert.deepEqual(store.consumePermission({id:app.id,permission:"inference",amount:1}),{allowed:true,remaining:1});
  assert.deepEqual(store.consumePermission({id:app.id,permission:"inference",amount:2}),{allowed:false,reason:"daily-limit"});
  store.revoke({id:app.id,permission:"faucet",actor:"admin"}); assert.equal(store.consumePermission({id:app.id,permission:"faucet"}).reason,"permission-not-granted");
  store.emergencyStop({enabled:true,actor:"admin"}); assert.equal(store.consumePermission({id:app.id,permission:"inference"}).reason,"emergency-stop");
  assert.ok(store.auditLog().some(row=>row.action==="system.emergency_stop.enabled"));
  store.emergencyStop({enabled:false,actor:"admin"}); now+=86_400_000; assert.deepEqual(store.consumePermission({id:app.id,permission:"inference",amount:2}),{allowed:true,remaining:0});
  store.close();
});

test("file database persists application review state across store instances",()=>{
  const dir=mkdtempSync(join(tmpdir(),"rd-admin-")); const file=join(dir,"admin.sqlite");
  try { let store=new AdminStore({filename:file});const c=store.issueChallenge({did:DID,wallet:WALLET});const a=store.submitApplication({challengeId:c.challengeId,didSignature:"x",walletSignature:"y",verifyDid:()=>true,verifyWallet:()=>true});store.close();store=new AdminStore({filename:file});assert.equal(store.listApplications()[0].id,a.id);store.close(); }
  finally { rmSync(dir,{recursive:true,force:true}); }
});

test("rate limiter fails closed when configured Upstash is unavailable and uses local atomic fallback when absent",async()=>{
  const oldUrl=process.env.UPSTASH_REDIS_REST_URL,oldToken=process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.UPSTASH_REDIS_REST_URL;delete process.env.UPSTASH_REDIS_REST_TOKEN;
  const store=new AdminStore({filename:":memory:"}); assert.equal(await distributedLimit("test",1,1000,()=>store.allowRate("test",1,1000)),true); assert.equal(await distributedLimit("test",1,1000,()=>store.allowRate("test",1,1000)),false);store.close();
  if(oldUrl!==undefined)process.env.UPSTASH_REDIS_REST_URL=oldUrl;if(oldToken!==undefined)process.env.UPSTASH_REDIS_REST_TOKEN=oldToken;
});

test("a configured PostgreSQL store takes precedence so distributed limits stay in the same database",async()=>{
  const keys=["DATABASE_URL","UPSTASH_REDIS_REST_URL","UPSTASH_REDIS_REST_TOKEN"],old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  process.env.DATABASE_URL="postgres://configured";process.env.UPSTASH_REDIS_REST_URL="https://example.upstash.io";process.env.UPSTASH_REDIS_REST_TOKEN="test-token";
  let calls=0;
  try { assert.equal(await distributedLimit("shared",1,1000,async()=>{calls++;return true;}),true);assert.equal(calls,1); }
  finally { for(const k of keys) if(old[k]===undefined) delete process.env[k]; else process.env[k]=old[k]; }
});


test("offline-browser PBKDF2 hashes interoperate with the admin verifier and reject malformed costs",()=>{
  const password="ephemeral browser hash compatibility password";
  const salt=Buffer.from("0123456789abcdef0123456789abcdef","hex");
  const digest=createHashForTest(password,salt);
  const encoded=`pbkdf2-sha256$600000$${salt.toString("hex")}$${digest}`;
  assert.equal(verifyAdminPassword(password,encoded),true);
  assert.equal(verifyAdminPassword(password+"x",encoded),false);
  assert.equal(verifyAdminPassword(password,encoded.replace("$600000$","$999999999$")),false);
  assert.equal(verifyAdminPassword(password,encoded.replace(/.$/,"g")),false);
});

function createHashForTest(password,salt){
  return pbkdf2Sync(password,salt,600_000,32,"sha256").toString("hex");
}
