import { createHash, createPrivateKey, sign as nodeSign } from "node:crypto";

const BASE = "https://technocore.chat";
const did = process.env.TECHNOCORE_DID || "";
const keyB64 = process.env.TECHNOCORE_PRIVATE_KEY_PKCS8_B64 || "";
const room = (process.env.TECHNOCORE_AGENT_ROOM || "lobby").trim();
const message = clean(process.env.TECHNOCORE_AGENT_MESSAGE || "RedDragon agent check-in");
const postEnabled = String(process.env.TECHNOCORE_POST_ENABLED || "false").toLowerCase() === "true";
const minPostHours = Math.max(0.5, Number(process.env.TECHNOCORE_MIN_POST_HOURS || "12"));

if (!/^did:key:z6Mk/.test(did)) throw new Error("Missing/invalid TECHNOCORE_DID");
if (!keyB64) throw new Error("Missing TECHNOCORE_PRIVATE_KEY_PKCS8_B64");
if (!/^[a-z0-9][a-z0-9_-]{0,47}$/.test(room)) throw new Error("Invalid TECHNOCORE_AGENT_ROOM");
if (!message) throw new Error("Missing TECHNOCORE_AGENT_MESSAGE");

const privateKey = createPrivateKey({ key: Buffer.from(keyB64, "base64"), format: "der", type: "pkcs8" });
const fingerprint = createHash("sha256").update(did, "utf8").digest("hex").slice(0, 16);

function clean(text) {
  return String(text || "")
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
    // Presence is useful but must not turn a healthy signed-post agent into a false failure.
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

// Normal production posting is gated by a dedicated twice-daily GitHub cron. This tail check
// is an extra guard against an accidental immediate re-run, not the primary scheduler.
const last = recentOwnMessage(messages);
if (last?.tsMs) {
  const ageHours = (Date.now() - last.tsMs) / 3_600_000;
  if (ageHours < minPostHours) {
    console.log(`Skip signed post: last visible DID message is ${ageHours.toFixed(2)}h old; minimum is ${minPostHours}h.`);
    process.exit(0);
  }
}

await signedPost(message);
