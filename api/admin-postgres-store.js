import { Pool } from "@neondatabase/serverless";
import { createHmac, randomBytes } from "node:crypto";
import { AdminInputError } from "./admin-store.js";

const TYPES = new Set(["faucet", "inference"]);
const CAPS = Object.freeze({ faucet: { daily: 1 }, inference: { daily: 100 } });

const SCHEMA = `
CREATE TABLE IF NOT EXISTS rd_admin_applications (
  id text PRIMARY KEY, did text NOT NULL, wallet text NOT NULL,
  faucet boolean NOT NULL DEFAULT false, inference boolean NOT NULL DEFAULT false,
  faucet_limit integer NOT NULL DEFAULT 0, inference_limit integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at bigint NOT NULL, reviewed_at bigint, reviewer text
);
CREATE INDEX IF NOT EXISTS rd_admin_applications_status_created ON rd_admin_applications(status, created_at DESC);
CREATE TABLE IF NOT EXISTS rd_admin_challenges (id text PRIMARY KEY, did text NOT NULL, wallet text NOT NULL, expires_at bigint NOT NULL, used boolean NOT NULL DEFAULT false);
CREATE TABLE IF NOT EXISTS rd_admin_sessions (token_hash text PRIMARY KEY, actor text NOT NULL, created_at bigint NOT NULL, expires_at bigint NOT NULL, revoked boolean NOT NULL DEFAULT false);
CREATE TABLE IF NOT EXISTS rd_admin_audit (id bigserial PRIMARY KEY, at bigint NOT NULL, actor text NOT NULL, action text NOT NULL, target text, detail jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE INDEX IF NOT EXISTS rd_admin_audit_at ON rd_admin_audit(id DESC);
CREATE TABLE IF NOT EXISTS rd_admin_state (key text PRIMARY KEY, value text NOT NULL);
CREATE TABLE IF NOT EXISTS rd_admin_rate_limits (key text PRIMARY KEY, window_start bigint NOT NULL, hits integer NOT NULL CHECK (hits >= 0));
CREATE TABLE IF NOT EXISTS rd_admin_usage (application_id text NOT NULL REFERENCES rd_admin_applications(id), permission text NOT NULL CHECK (permission IN ('faucet','inference')), day bigint NOT NULL, hits integer NOT NULL CHECK (hits >= 0), PRIMARY KEY(application_id, permission, day));
`;

function hmac(secret, value) { return createHmac("sha256", secret).update(value).digest("hex"); }
function asApp(row) {
  if (!row) return row;
  return { ...row, faucet: Number(row.faucet), inference: Number(row.inference),
    faucet_limit: Number(row.faucet_limit), inference_limit: Number(row.inference_limit),
    created_at: Number(row.created_at), reviewed_at: row.reviewed_at == null ? null : Number(row.reviewed_at) };
}

/** Neon-backed store. It creates a request-scoped WebSocket pool and uses SQL transactions. */
export class PostgresAdminStore {
  constructor({ connectionString = process.env.DATABASE_URL, now = () => Date.now(), pool } = {}) {
    if (!connectionString && !pool) throw new Error("DATABASE_URL is required");
    this.pool = pool || new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5000, idleTimeoutMillis: 1000 });
    this.now = now;
    this.secret = process.env.ADMIN_SESSION_SECRET || "";
    this.initialized = false;
  }
  async init() {
    if (!this.initialized) {
      await this.pool.query(SCHEMA);
      await this.pool.query("INSERT INTO rd_admin_state(key,value) VALUES('emergency_stop','false') ON CONFLICT(key) DO NOTHING");
      this.initialized = true;
    }
    return this;
  }
  async close() { await this.pool.end(); }
  async tx(fn) {
    const client = await this.pool.connect();
    try { await client.query("BEGIN"); const value = await fn(client); await client.query("COMMIT"); return value; }
    catch (error) { try { await client.query("ROLLBACK"); } catch {} throw error; }
    finally { client.release(); }
  }
  async audit(client, actor, action, target, detail = {}) {
    await client.query("INSERT INTO rd_admin_audit(at,actor,action,target,detail) VALUES($1,$2,$3,$4,$5::jsonb)", [this.now(), actor, action, target, JSON.stringify(detail)]);
  }
  async issueChallenge({ did, wallet }) {
    if (!/^did:key:z[1-9A-HJ-NP-Za-km-z]{40,60}$/.test(did || "") || typeof wallet !== "string" || wallet.length < 32 || wallet.length > 64) throw new AdminInputError("Valid DID and wallet address required");
    const id = randomBytes(32).toString("base64url"), expiresAt = this.now() + 300_000;
    await this.pool.query("INSERT INTO rd_admin_challenges(id,did,wallet,expires_at) VALUES($1,$2,$3,$4)", [id,did,wallet,expiresAt]);
    return { challengeId:id, message:`RedDragon FLOP application\nDID: ${did}\nWallet: ${wallet}\nChallenge: ${id}`, expiresAt };
  }
  async submitApplication({ challengeId, didSignature, walletSignature, verifyDid, verifyWallet }) {
    return this.tx(async client => {
      const { rows } = await client.query("SELECT * FROM rd_admin_challenges WHERE id=$1 FOR UPDATE", [challengeId]);
      const challenge=rows[0];
      if (!challenge || challenge.used || Number(challenge.expires_at) <= this.now()) throw new AdminInputError("Challenge expired or already used");
      const message=`RedDragon FLOP application\nDID: ${challenge.did}\nWallet: ${challenge.wallet}\nChallenge: ${challenge.id}`;
      if (!await verifyDid(challenge.did,message,didSignature) || !await verifyWallet(challenge.wallet,message,walletSignature)) throw new AdminInputError("Identity or wallet ownership proof is invalid");
      await client.query("UPDATE rd_admin_challenges SET used=true WHERE id=$1", [challengeId]);
      const id=randomBytes(16).toString("hex");
      await client.query("INSERT INTO rd_admin_applications(id,did,wallet,created_at) VALUES($1,$2,$3,$4)",[id,challenge.did,challenge.wallet,this.now()]);
      await this.audit(client,challenge.did,"application.submitted",id);
      return {id,status:"pending"};
    });
  }
  async reviewApplication({ id, decision, permissions = {}, actor }) {
    if (!['approve','reject'].includes(decision)) throw new AdminInputError("Invalid review decision");
    for(const key of Object.keys(permissions)) if(!new Set(["faucet","inference","faucetLimit","inferenceLimit"]).has(key)) throw new AdminInputError("Unknown permission");
    const faucet=decision==='approve'&&permissions.faucet===true;
    const inference=decision==='approve'&&permissions.inference===true;
    const faucetLimit=faucet?Math.min(Math.max(0,Number(permissions.faucetLimit??CAPS.faucet.daily)),CAPS.faucet.daily):0;
    const inferenceLimit=inference?Math.min(Math.max(0,Number(permissions.inferenceLimit??10)),CAPS.inference.daily):0;
    if(!Number.isInteger(faucetLimit)||!Number.isInteger(inferenceLimit)) throw new AdminInputError("Permission limits must be integers");
    return this.tx(async client=>{
      const {rows}=await client.query("SELECT * FROM rd_admin_applications WHERE id=$1 FOR UPDATE",[id]);
      if(!rows[0]||rows[0].status!=="pending") throw new AdminInputError("Pending application not found");
      const {rows:updated}=await client.query(`UPDATE rd_admin_applications SET status=$1,faucet=$2,inference=$3,faucet_limit=$4,inference_limit=$5,reviewed_at=$6,reviewer=$7 WHERE id=$8 AND status='pending' RETURNING *`,[decision==='approve'?'approved':'rejected',faucet,inference,faucetLimit,inferenceLimit,this.now(),actor,id]);
      if(!updated[0]) throw new AdminInputError("Pending application not found");
      await this.audit(client,actor,`application.${decision}`,id,{faucet,inference,faucetLimit,inferenceLimit});
      return asApp(updated[0]);
    });
  }
  async revoke({id,permission,actor}) {
    if(!TYPES.has(permission)) throw new AdminInputError("Invalid permission");
    return this.tx(async client=>{
      const {rows}=await client.query("SELECT id FROM rd_admin_applications WHERE id=$1 FOR UPDATE",[id]);
      if(!rows[0]) throw new AdminInputError("Application not found");
      const col=permission, cap=`${permission}_limit`;
      const {rows:updated}=await client.query(`UPDATE rd_admin_applications SET ${col}=false,${cap}=0 WHERE id=$1 RETURNING *`,[id]);
      await this.audit(client,actor,`permission.${permission}.revoked`,id);
      return asApp(updated[0]);
    });
  }
  async consumePermission({id,permission,amount=1}) {
    if(!TYPES.has(permission)||!Number.isSafeInteger(amount)||amount<1) throw new AdminInputError("Invalid permission consumption");
    return this.tx(async client=>{
      // Lock the singleton stop flag so an in-flight authorization cannot
      // slip past an emergency-stop operation that is already committing.
      await client.query("INSERT INTO rd_admin_state(key,value) VALUES('emergency_stop','false') ON CONFLICT(key) DO NOTHING");
      const {rows:state}=await client.query("SELECT value FROM rd_admin_state WHERE key='emergency_stop' FOR UPDATE");
      if(state[0]?.value==='true') return {allowed:false,reason:"emergency-stop"};
      const {rows}=await client.query("SELECT * FROM rd_admin_applications WHERE id=$1 AND status='approved' FOR UPDATE",[id]);
      const row=rows[0];
      if(!row||!row[permission]) return {allowed:false,reason:"permission-not-granted"};
      const limit=Number(permission==='faucet'?row.faucet_limit:row.inference_limit);
      if(amount>limit) return {allowed:false,reason:"per-operation-limit"};
      const day=Math.floor(this.now()/86_400_000);
      const {rows:usage}=await client.query(`INSERT INTO rd_admin_usage(application_id,permission,day,hits) VALUES($1,$2,$3,$4)
        ON CONFLICT(application_id,permission,day) DO UPDATE SET hits=rd_admin_usage.hits+EXCLUDED.hits
        WHERE rd_admin_usage.hits+EXCLUDED.hits <= $5 RETURNING hits`,[id,permission,day,amount,limit]);
      if(!usage[0]) return {allowed:false,reason:"daily-limit"};
      await this.audit(client,row.did,`permission.${permission}.consumed`,id,{amount});
      return {allowed:true,remaining:limit-Number(usage[0].hits)};
    });
  }
  async emergencyStop({enabled,actor}) {
    return this.tx(async client=>{
      await client.query("INSERT INTO rd_admin_state(key,value) VALUES('emergency_stop',$1) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",[enabled?'true':'false']);
      await this.audit(client,actor,enabled?'system.emergency_stop.enabled':'system.emergency_stop.disabled',null);
      return !!enabled;
    });
  }
  async isStopped() { const {rows}=await this.pool.query("SELECT value FROM rd_admin_state WHERE key='emergency_stop'");return rows[0]?.value==='true'; }
  async listApplications() { const {rows}=await this.pool.query("SELECT * FROM rd_admin_applications ORDER BY created_at DESC LIMIT 500");return rows.map(asApp); }
  async auditLog() { const {rows}=await this.pool.query("SELECT id,at,actor,action,target,detail FROM rd_admin_audit ORDER BY id DESC LIMIT 500");return rows.map(r=>({...r,id:Number(r.id),at:Number(r.at)})); }
  async allowRate(key,limit,windowMs) {
    const now=this.now(), boundary=now-windowMs;
    const {rows}=await this.pool.query(`INSERT INTO rd_admin_rate_limits(key,window_start,hits) VALUES($1,$2,1)
      ON CONFLICT(key) DO UPDATE SET window_start=CASE WHEN rd_admin_rate_limits.window_start <= $3 THEN EXCLUDED.window_start ELSE rd_admin_rate_limits.window_start END,
      hits=CASE WHEN rd_admin_rate_limits.window_start <= $3 THEN 1 ELSE LEAST(rd_admin_rate_limits.hits+1,$4) END
      RETURNING hits`,[key,now,boundary,limit+1]);
    return Number(rows[0]?.hits)<=limit;
  }
  async createSession(actor,ttlMs=8*60*60_000) {
    if(!this.secret) throw new Error("ADMIN_SESSION_SECRET is required");
    const token=randomBytes(32).toString("base64url"), now=this.now();
    await this.tx(async client=>{await client.query("INSERT INTO rd_admin_sessions(token_hash,actor,created_at,expires_at) VALUES($1,$2,$3,$4)",[hmac(this.secret,token),actor,now,now+ttlMs]);await this.audit(client,actor,"admin.login",null);});
    return token;
  }
  async session(token) {
    if(!token||!this.secret)return null;
    const {rows}=await this.pool.query("SELECT token_hash,created_at,expires_at FROM rd_admin_sessions WHERE token_hash=$1 AND revoked=false AND expires_at>$2",[hmac(this.secret,token),this.now()]);return rows[0]||null;
  }
  async revokeSession(token,actor="admin") {
    if(!token||!this.secret)return;
    await this.tx(async client=>{
      const {rows}=await client.query("UPDATE rd_admin_sessions SET revoked=true WHERE token_hash=$1 AND revoked=false RETURNING token_hash",[hmac(this.secret,token)]);
      if(rows[0]) await this.audit(client,actor,"admin.logout",null);
    });
  }
}

export async function makePostgresAdminStore(options) { return new PostgresAdminStore(options).init(); }
