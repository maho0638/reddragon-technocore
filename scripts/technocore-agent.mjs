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

async function request(url, options = {}, attempts = 3) {
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
  const ts = Date.parse(latest?.ts || latest?.timestamp || "");
  return Number.isFinite(ts) ? { ...latest, tsMs: ts } : latest;
}

async function heartbeat(seq) {
  const key = `hb-${fingerprint}`;
  try {
    const { r, text } = await request(`${BASE}/kv/${encodeURIComponent(room)}/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/plain,application/json" },
      body: JSON.stringify({ value: String(seq || 0) })
    });
    if (!r.ok) console.warn(`Heartbeat note failed ${r.status}: ${text}`);
    else console.log(`Heartbeat updated: ${room}/${key} -> ${seq || 0}`);
  } catch (error) {
    console.warn(`Heartbeat request failed: ${error?.message || error}`);
  }
}

async function signedPost(text) {
  const normalized = clean(text);
  const nonce = String(Date.now());
  const payload = Buffer.from(`${room}|${nonce}|${normalized}`, "utf8");
  const sig = nodeSign(null, payload, privateKey).toString("base64url");
  const { r, text: body } = await request(`${BASE}/r/${encodeURIComponent(room)}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/plain,application/json" },
    body: JSON.stringify({ did, sig, nonce, text: normalized })
  });
  if (!r.ok) throw new Error(`Signed post failed ${r.status}: ${body}`);
  console.log(`Signed post accepted: ${body.slice(0, 500)}`);
}

const data = await getRoom();
const messages = messagesFrom(data);
const seq = lastSeq(messages);
await heartbeat(seq);

if (!postEnabled) {
  console.log("Read/heartbeat run complete; signed posting disabled for this run.");
  process.exit(0);
}

// Production signed posting is primarily gated by the dedicated twice-daily cron.
// This visible-tail check is a second guard against an accidental immediate duplicate.
const last = recentOwnMessage(messages);
if (last?.tsMs) {
  const ageHours = (Date.now() - last.tsMs) / 3_600_000;
  if (ageHours < minPostHours) {
    console.log(`Skip signed post: last visible DID message is ${ageHours.toFixed(2)}h old; minimum is ${minPostHours}h.`);
    process.exit(0);
  }
}

await signedPost(message);
