import { DatabaseSync } from "node:sqlite";
import { randomBytes, scryptSync, pbkdf2Sync, timingSafeEqual, createHmac } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SECRET = process.env.ADMIN_SESSION_SECRET || "";
const DB_PATH = process.env.ADMIN_DB_PATH || "./.data/admin.sqlite";
const TYPES = new Set(["faucet", "inference"]);
const LIMITS = Object.freeze({ faucet: { amount: 10_000, daily: 1 }, inference: { requests: 100, daily: 100 } });
export class AdminInputError extends Error { constructor(message) { super(message); this.name = "AdminInputError"; } }

function safeEqual(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export function hashAdminPassword(password, salt = randomBytes(16).toString("hex")) {
  if (typeof password !== "string" || password.length < 16 || password.length > 256) throw new AdminInputError("Admin password must contain 16–256 characters");
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyAdminPassword(password, encoded) {
  const parts = String(encoded || "").split("$");
  if (parts[0] === "scrypt") {
    const [, salt, digest] = parts;
    if (!/^[a-f0-9]{32}$/.test(salt || "") || !/^[a-f0-9]{128}$/.test(digest || "")) return false;
    return safeEqual(scryptSync(String(password || ""), salt, 64).toString("hex"), digest);
  }
  if (parts[0] === "pbkdf2-sha256") {
    const [, iterationText, saltHex, digestHex] = parts;
    // Keep work bounded and format strict; the offline browser helper emits exactly 600,000 rounds.
    if (iterationText !== "600000" || !/^[a-f0-9]{32}$/.test(saltHex || "") || !/^[a-f0-9]{64}$/.test(digestHex || "")) return false;
    const actual = pbkdf2Sync(String(password || ""), Buffer.from(saltHex, "hex"), 600_000, 32, "sha256");
    return timingSafeEqual(actual, Buffer.from(digestHex, "hex"));
  }
  return false;
}

export class AdminStore {
  constructor({ filename = DB_PATH, now = () => Date.now() } = {}) {
    if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(filename);
    this.now = now;
    this.db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS applications(id TEXT PRIMARY KEY, did TEXT NOT NULL, wallet TEXT NOT NULL, faucet INTEGER NOT NULL DEFAULT 0, inference INTEGER NOT NULL DEFAULT 0, faucet_limit INTEGER NOT NULL DEFAULT 0, inference_limit INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL, reviewed_at INTEGER, reviewer TEXT);
      CREATE INDEX IF NOT EXISTS applications_status_created ON applications(status, created_at DESC);
      CREATE TABLE IF NOT EXISTS challenges(id TEXT PRIMARY KEY, did TEXT NOT NULL, wallet TEXT NOT NULL, expires_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT, detail TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS system_state(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, hits INTEGER NOT NULL);`);
  }
  close() { this.db.close(); }
  transaction(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = fn(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  audit(actor, action, target, detail = {}) {
    this.db.prepare("INSERT INTO audit(at,actor,action,target,detail) VALUES(?,?,?,?,?)").run(this.now(), actor, action, target, JSON.stringify(detail));
  }
  issueChallenge({ did, wallet }) {
    if (!/^did:key:z[1-9A-HJ-NP-Za-km-z]{40,60}$/.test(did || "") || typeof wallet !== "string" || wallet.length < 32 || wallet.length > 64) throw new AdminInputError("Valid DID and wallet address required");
    const id = randomBytes(32).toString("base64url"); const expires = this.now() + 5 * 60_000;
    this.db.prepare("INSERT INTO challenges(id,did,wallet,expires_at) VALUES(?,?,?,?)").run(id, did, wallet, expires);
    return { challengeId: id, message: `RedDragon FLOP application\nDID: ${did}\nWallet: ${wallet}\nChallenge: ${id}`, expiresAt: expires };
  }
  submitApplication({ challengeId, didSignature, walletSignature, verifyDid, verifyWallet }) {
    return this.transaction(() => {
      const challenge = this.db.prepare("SELECT * FROM challenges WHERE id=?").get(challengeId);
      if (!challenge || challenge.used || challenge.expires_at <= this.now()) throw new AdminInputError("Challenge expired or already used");
      const message = `RedDragon FLOP application\nDID: ${challenge.did}\nWallet: ${challenge.wallet}\nChallenge: ${challenge.id}`;
      if (!verifyDid(challenge.did, message, didSignature) || !verifyWallet(challenge.wallet, message, walletSignature)) throw new AdminInputError("Identity or wallet ownership proof is invalid");
      this.db.prepare("UPDATE challenges SET used=1 WHERE id=? AND used=0").run(challengeId);
      const id = randomBytes(16).toString("hex");
      this.db.prepare("INSERT INTO applications(id,did,wallet,created_at) VALUES(?,?,?,?)").run(id, challenge.did, challenge.wallet, this.now());
      this.audit(challenge.did, "application.submitted", id);
      return { id, status: "pending" };
    });
  }
  reviewApplication({ id, decision, permissions = {}, actor }) {
    if (!['approve', 'reject'].includes(decision)) throw new AdminInputError("Invalid review decision");
    for (const key of Object.keys(permissions)) if (!new Set(["faucet", "inference", "faucetLimit", "inferenceLimit"]).has(key)) throw new AdminInputError("Unknown permission");
    return this.transaction(() => {
      const row = this.db.prepare("SELECT * FROM applications WHERE id=?").get(id);
      if (!row || row.status !== "pending") throw new AdminInputError("Pending application not found");
      const faucet = decision === "approve" && permissions.faucet === true ? 1 : 0;
      const inference = decision === "approve" && permissions.inference === true ? 1 : 0;
      const requestedFaucetLimit = Number(permissions.faucetLimit ?? 1);
      const requestedInferenceLimit = Number(permissions.inferenceLimit ?? 10);
      if (!Number.isSafeInteger(requestedFaucetLimit) || !Number.isSafeInteger(requestedInferenceLimit)) throw new AdminInputError("Permission limits must be integers");
      const faucetLimit = faucet ? Math.min(Math.max(0, requestedFaucetLimit), LIMITS.faucet.daily) : 0;
      const inferenceLimit = inference ? Math.min(Math.max(0, requestedInferenceLimit), LIMITS.inference.daily) : 0;
      this.db.prepare("UPDATE applications SET status=?,faucet=?,inference=?,faucet_limit=?,inference_limit=?,reviewed_at=?,reviewer=? WHERE id=? AND status='pending'").run(decision === "approve" ? "approved" : "rejected", faucet, inference, faucetLimit, inferenceLimit, this.now(), actor, id);
      this.audit(actor, `application.${decision}`, id, { faucet: !!faucet, inference: !!inference, faucetLimit, inferenceLimit });
      return this.db.prepare("SELECT * FROM applications WHERE id=?").get(id);
    });
  }
  revoke({ id, permission, actor }) {
    if (!TYPES.has(permission)) throw new AdminInputError("Invalid permission");
    return this.transaction(() => {
      const row = this.db.prepare("SELECT * FROM applications WHERE id=?").get(id);
      if (!row) throw new AdminInputError("Application not found");
      const column = permission;
      this.db.prepare(`UPDATE applications SET ${column}=0, ${column}_limit=0 WHERE id=?`).run(id);
      this.audit(actor, `permission.${permission}.revoked`, id);
      return this.db.prepare("SELECT * FROM applications WHERE id=?").get(id);
    });
  }
  consumePermission({ id, permission, amount = 1 }) {
    if (!TYPES.has(permission) || !Number.isSafeInteger(amount) || amount < 1) throw new AdminInputError("Invalid permission consumption");
    return this.transaction(() => {
      if (this.isStopped()) return { allowed: false, reason: "emergency-stop" };
      const row = this.db.prepare("SELECT * FROM applications WHERE id=? AND status='approved'").get(id);
      if (!row || !row[permission]) return { allowed: false, reason: "permission-not-granted" };
      const limit = permission === "faucet" ? row.faucet_limit : row.inference_limit;
      if (amount > limit) return { allowed: false, reason: "per-operation-limit" };
      const day = Math.floor(this.now() / 86_400_000);
      const key = `use:${id}:${permission}:${day}`;
      const old = this.db.prepare("SELECT * FROM rate_limits WHERE key=?").get(key);
      if (old && old.hits + amount > limit) return { allowed: false, reason: "daily-limit" };
      this.db.prepare("INSERT INTO rate_limits(key,window_start,hits) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET hits=hits+excluded.hits").run(key, day * 86_400_000, amount);
      this.audit(row.did, `permission.${permission}.consumed`, id, { amount });
      return { allowed: true, remaining: limit - (old?.hits || 0) - amount };
    });
  }
  emergencyStop({ enabled, actor }) {
    return this.transaction(() => {
      this.db.prepare("INSERT INTO system_state(key,value) VALUES('emergency_stop',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(enabled ? "true" : "false");
      this.audit(actor, enabled ? "system.emergency_stop.enabled" : "system.emergency_stop.disabled", null);
      return !!enabled;
    });
  }
  isStopped() { return this.db.prepare("SELECT value FROM system_state WHERE key='emergency_stop'").get()?.value === "true"; }
  listApplications() { return this.db.prepare("SELECT * FROM applications ORDER BY created_at DESC LIMIT 500").all(); }
  auditLog() { return this.db.prepare("SELECT * FROM audit ORDER BY id DESC LIMIT 500").all(); }
  allowRate(key, limit, windowMs) {
    return this.transaction(() => {
      const now = this.now(); const old = this.db.prepare("SELECT * FROM rate_limits WHERE key=?").get(key);
      if (!old || now - old.window_start >= windowMs) {
        this.db.prepare("INSERT INTO rate_limits(key,window_start,hits) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET window_start=excluded.window_start,hits=1").run(key, now);
        return true;
      }
      if (old.hits >= limit) return false;
      this.db.prepare("UPDATE rate_limits SET hits=hits+1 WHERE key=?").run(key); return true;
    });
  }
  createSession(actor, ttlMs = 8 * 60 * 60_000) {
    const token = randomBytes(32).toString("base64url");
    const hash = createHmac("sha256", SECRET || "unconfigured").update(token).digest("hex");
    this.db.prepare("INSERT INTO sessions(token_hash,created_at,expires_at) VALUES(?,?,?)").run(hash, this.now(), this.now() + ttlMs);
    this.audit(actor, "admin.login", null);
    return token;
  }
  session(token) {
    if (!token || !SECRET) return null;
    const hash = createHmac("sha256", SECRET).update(token).digest("hex");
    return this.db.prepare("SELECT token_hash,created_at,expires_at FROM sessions WHERE token_hash=? AND revoked=0 AND expires_at>?").get(hash, this.now()) || null;
  }
  revokeSession(token, actor = "admin") {
    if (!token || !SECRET) return;
    const hash = createHmac("sha256", SECRET).update(token).digest("hex");
    this.transaction(() => {
      const session = this.db.prepare("SELECT token_hash FROM sessions WHERE token_hash=?").get(hash);
      if (!session) return;
      this.db.prepare("UPDATE sessions SET revoked=1 WHERE token_hash=?").run(hash);
      this.audit(actor, "admin.logout", null);
    });
  }
}

export function makeAdminStore(options) { return new AdminStore(options); }
export const __adminLimits = LIMITS;
