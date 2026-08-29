import { createHash, createPrivateKey, createPublicKey, sign as nodeSign } from "node:crypto";

const BASE = "https://technocore.chat";
const configuredDid = (process.env.TECHNOCORE_DID || "").trim();
const keyB64 = (process.env.TECHNOCORE_PRIVATE_KEY_PKCS8_B64 || "").trim();
const room = (process.env.TECHNOCORE_AGENT_ROOM || "lobby").trim();
const message = clean(process.env.TECHNOCORE_AGENT_MESSAGE || "RedDragon agent check-in");
const postEnabled = String(process.env.TECHNOCORE_POST_ENABLED || "false").toLowerCase() === "true";
const minPostHours = Math.max(0.5, Number(process.env.TECHNOCORE_MIN_POST_HOURS || "12"));

if (!keyB64) throw new Error("Missing TECHNOCORE_PRIVATE_KEY_PKCS8_B64");
if (!/^[a-z0-9][a-z0-9_-]{0,47}$/.test(room)) throw new Error("Invalid TECHNOCORE_AGENT_ROOM");
if (!message) throw new Error("Missing TECHNOCORE_AGENT_MESSAGE");
if (message.length > 4096) throw new Error("TECHNOCORE_AGENT_MESSAGE is too long");

const privateKey = createPrivateKey({ key: Buffer.from(keyB64, "base64"), format: "der", type: "pkcs8" });
const did = deriveDid(privateKey);
if (configuredDid && configuredDid !== did) {
  throw new Error("Configured TECHNOCORE_DID does not match the private key");
}
const fingerprint = createHash("sha256").update(did, "utf8").digest("hex").slice(0, 16);
const heartbeatKey = `hb-${fingerprint}`;
console.log(`Agent identity: ${did} (${fingerprint})`);

function clean(text) {
  return String(text || "")
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function base58(bytes) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let x = 0n;
  for (const b of bytes) x = (x << 8n) + BigInt(b);
  let out = "";
  while (x > 0n) {
    out = alphabet[Number(x % 58n)] + out;
    x /= 58n;
  }
  for (const b of bytes) {
    if (b === 0) out = "1" + out;
    else break;
  }
  return out || "1";
}

function deriveDid(key) {
  const spki = createPublicKey(key).export({ format: "der", type: "spki" });
  if (!Buffer.isBuffer(spki) || spki.length < 32) throw new Error("Could not derive Ed25519 public key");
  const raw = spki.subarray(spki.length - 32);
  const prefixed = Buffer.concat([Buffer.from([0xed, 0x01]), raw]);
  return `did:key:z${base58(prefixed)}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(url, options = {}, attempts = 5) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const r = await fetch(url, { ...options, signal: AbortSignal.timeout(20_000) });
      const text = await r.text();
      if (r.ok || (r.status < 500 && r.status !== 429)) return { r, text };

      const retryAfter = Number(r.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 60_000)
        : attempt * 2000;
      lastError = new Error(`HTTP ${r.status}: ${text.slice(0, 300)}`);
      if (attempt < attempts) await sleep(waitMs);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(attempt * 2000);
    }
  }
  throw lastError || new Error("Request failed");
}

async function getRoom() {
  const { r, text } = await request(`${BASE}/r/${encodeURIComponent(room)}?format=json&limit=200`, {
    headers: { accept: "application/json" }
  });
  if (!r.ok) throw new Error(`Read failed ${r.status}: ${text}`);
  try { return JSON.parse(text); } catch { throw new Error("Technocore returned invalid room JSON"); }
}

function messagesFrom(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.messages)) return data.messages;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function lastSeq(messages) {
  return messages.reduce((max, m) => Math.max(max, Number(m?.seq || 0)), 0);
}

function recentOwnMessage(messages) {
  const own = messages.filter((m) => m?.from === did || m?.did === did);
  if (!own.length) return null;
  const latest = own[own.length - 1];
  const rawTs = latest?.ts || latest?.timestamp || latest?.createdAt || latest?.time || "";
  const ts = Date.parse(rawTs);
  return Number.isFinite(ts) ? { ...latest, tsMs: ts } : latest;
}

function unwrapTechnocoreNote(value) {
  if (typeof value !== "string") return value;
  let text = value.trim();

  // Official Technocore note reads are plain text and intentionally prepend the
  // UNTRUSTED CONTENT banner before the stored value. The value itself is our JSON.
  if (text.startsWith("!! UNTRUSTED CONTENT")) {
    const split = text.indexOf("\n\n");
    if (split >= 0) text = text.slice(split + 2).trim();
  }

  // A low read budget can append a caller-specific pacing footer after the note.
  // Our stored heartbeat JSON is one object, so keep only that object when present.
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }
  return text;
}

function parseMaybeJson(value) {
  if (typeof value !== "string") return value;
  const trimmed = String(unwrapTechnocoreNote(value) || "").trim();
  if (!trimmed) return null;
  try { return JSON.parse(trimmed); } catch { return trimmed; }
}

function normalizeHeartbeatState(raw) {
  let value = parseMaybeJson(raw);
  if (value && typeof value === "object" && !Array.isArray(value) && "value" in value) {
    value = parseMaybeJson(value.value);
  }
  value = parseMaybeJson(value);

  if (typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value))) {
    return { version: 2, lastRoomSeq: Number(value) || 0 };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { version: 2, lastRoomSeq: 0 };
  }

  return {
    version: 2,
    lastRoomSeq: Number(value.lastRoomSeq || value.seq || 0) || 0,
    lastHeartbeatAt: typeof value.lastHeartbeatAt === "string" ? value.lastHeartbeatAt : null,
    lastSignedAt: typeof value.lastSignedAt === "string" ? value.lastSignedAt : null,
    lastSignedSeq: Number(value.lastSignedSeq || 0) || null,
    postLockUntil: typeof value.postLockUntil === "string" ? value.postLockUntil : null
  };
}

async function readHeartbeatState() {
  const { r, text } = await request(`${BASE}/kv/${encodeURIComponent(room)}/${encodeURIComponent(heartbeatKey)}`, {
    headers: { accept: "application/json,text/plain" }
  });
  if (r.status === 404) return { version: 2, lastRoomSeq: 0 };
  if (!r.ok) throw new Error(`Heartbeat state read failed ${r.status}: ${text}`);
  return normalizeHeartbeatState(text);
}

async function writeHeartbeatState(state) {
  const safeState = {
    version: 2,
    lastRoomSeq: Number(state.lastRoomSeq || 0) || 0,
    lastHeartbeatAt: state.lastHeartbeatAt || new Date().toISOString(),
    lastSignedAt: state.lastSignedAt || null,
    lastSignedSeq: Number(state.lastSignedSeq || 0) || null,
    postLockUntil: state.postLockUntil || null
  };
  const { r, text } = await request(`${BASE}/kv/${encodeURIComponent(room)}/${encodeURIComponent(heartbeatKey)}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/plain,application/json" },
    body: JSON.stringify({ value: JSON.stringify(safeState) })
  });
  if (!r.ok) throw new Error(`Heartbeat note failed ${r.status}: ${text}`);
  return safeState;
}

function ageHours(iso) {
  const ts = Date.parse(String(iso || ""));
  if (!Number.isFinite(ts)) return Infinity;
  return (Date.now() - ts) / 3_600_000;
}

function futureMs(iso) {
  const ts = Date.parse(String(iso || ""));
  return Number.isFinite(ts) ? ts - Date.now() : -1;
}

async function signedPost(text) {
  const normalized = clean(text);
  const nonce = String(Date.now());
  const payload = Buffer.from(`${room}|${nonce}|${normalized}`, "utf8");
  const sig = nodeSign(null, payload, privateKey).toString("base64url");
  const { r, text: body } = await request(`${BASE}/r/${encodeURIComponent(room)}?format=json`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json,text/plain" },
    body: JSON.stringify({ did, sig, nonce, text: normalized })
  });
  if (!r.ok) throw new Error(`Signed post failed ${r.status}: ${body}`);

  let acceptedSeq = null;
  try {
    const parsed = JSON.parse(body);
    acceptedSeq = Number(parsed?.posted?.seq || parsed?.seq || 0) || null;
  } catch {
    const match = body.match(/\bseq\D+(\d+)\b/i);
    acceptedSeq = match ? Number(match[1]) : null;
  }
  console.log(`Signed post accepted${acceptedSeq ? `: seq ${acceptedSeq}` : ""}.`);
  return { seq: acceptedSeq, nonce };
}

const data = await getRoom();
const messages = messagesFrom(data);
const seq = lastSeq(messages);
let state = await readHeartbeatState();
state.lastRoomSeq = seq;
state.lastHeartbeatAt = new Date().toISOString();
state = await writeHeartbeatState(state);
console.log(`Heartbeat updated: ${room}/${heartbeatKey} -> ${seq || 0}`);

if (!postEnabled) {
  console.log("Read/heartbeat run complete; signed posting disabled for this run.");
  process.exit(0);
}

const lockMs = futureMs(state.postLockUntil);
if (lockMs > 0) {
  console.log(`Skip signed post: durable post lock remains for ${(lockMs / 3_600_000).toFixed(2)}h.`);
  process.exit(0);
}

const durableAge = ageHours(state.lastSignedAt);
if (durableAge < minPostHours) {
  console.log(`Skip signed post: durable last-signed state is ${durableAge.toFixed(2)}h old; minimum is ${minPostHours}h.`);
  process.exit(0);
}

// Secondary guard: if a recent message is still visible in the room tail, use it to
// repair durable state and prevent a duplicate even if an earlier state write failed.
const last = recentOwnMessage(messages);
if (last?.tsMs) {
  const visibleAge = (Date.now() - last.tsMs) / 3_600_000;
  if (visibleAge < minPostHours) {
    state.lastSignedAt = new Date(last.tsMs).toISOString();
    state.postLockUntil = new Date(last.tsMs + minPostHours * 3_600_000).toISOString();
    await writeHeartbeatState(state);
    console.log(`Skip signed post: last visible DID message is ${visibleAge.toFixed(2)}h old; minimum is ${minPostHours}h.`);
    process.exit(0);
  }
}

// Acquire a durable public lock before posting. If the post succeeds but the final
// state write fails, the lock still prevents an immediate duplicate on the next run.
const now = Date.now();
state.postLockUntil = new Date(now + minPostHours * 3_600_000).toISOString();
state = await writeHeartbeatState(state);
console.log(`Signed-post lock acquired until ${state.postLockUntil}.`);

try {
  const posted = await signedPost(message);
  state.lastSignedAt = new Date(now).toISOString();
  state.lastSignedSeq = posted.seq;
  state.lastHeartbeatAt = new Date().toISOString();
  try {
    await writeHeartbeatState(state);
    console.log(`Durable signed state saved${posted.seq ? `: seq ${posted.seq}` : ""}.`);
  } catch (error) {
    // Do not fail/retry the workflow after a successful signed post: the pre-post
    // durable lock is already in place and is safer than risking a duplicate.
    console.warn(`Signed post succeeded but final state update failed: ${error?.message || error}`);
  }
} catch (error) {
  // A failed post may be retried later. Shorten the lock to 30 minutes when possible;
  // if this cleanup itself fails, the original 12h lock fails safely by suppressing spam.
  state.postLockUntil = new Date(Date.now() + 30 * 60_000).toISOString();
  try { await writeHeartbeatState(state); } catch {}
  throw error;
}
