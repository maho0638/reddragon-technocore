import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";
import { isPublicEd25519Did } from "../public/flop-did-utils.js";

const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,47}$/;
const SIG_RE = /^[A-Za-z0-9_-]{85}[AQgw]$/;
const NONCE_RE = /^\d{1,19}$/;
const FP_RE = /^[0-9a-f]{16}$/;
// Only the namespaces used by this client may be written through its public relay.
// This is a surface reduction, NOT authenticated ownership protection for topics/profiles.
const WRITABLE_KV_NAMESPACES = new Set(["did", "topic", "profile"]);
const BASE = "https://technocore.chat";
const MAX_JSON_BYTES = 32 * 1024;
const READ_STAGGER_ROOMS = ["lobby", "technocore", "flop-network", "kibble", "validators", "gpu-miners"];
// Best-effort per-instance limits for the public serverless relay. Durable,
// cross-instance quotas would require shared storage, which this project does not use.
const RATE_WINDOW_MS = 60_000;
const RATE_LIMITS = Object.freeze({ read: 60, write: 10 });
const rateBuckets = new Map();

function cleanSingleLine(text) {
  return String(text || "")
    .replace(/[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readStaggerMs(room) {
  const index = READ_STAGGER_ROOMS.indexOf(String(room || ""));
  if (index >= 0) return index * 180;
  let hash = 0;
  for (const ch of String(room || "")) hash = (Math.imul(hash, 31) + ch.charCodeAt(0)) >>> 0;
  return hash % 720;
}

function harden(res) {
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("referrer-policy", "no-referrer");
}

function clientKey(req) {
  // Vercel supplies the client address. Prefer its normalized address header,
  // then the final platform-added address in the forwarding chain.
  const real = String(req.headers["x-real-ip"] || "").trim();
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",").map((part) => part.trim()).filter(Boolean);
  const address = real || forwarded.at(-1) || req.socket?.remoteAddress || req.ip || "unknown";
  return address.slice(0, 96);
}

function rateLimit(req, res, action) {
  const category = action === "signedPost" || action === "kvSet" ? "write" : "read";
  const key = `${clientKey(req)}:${category}`;
  const now = Date.now();
  let bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.startedAt >= RATE_WINDOW_MS) {
    bucket = { startedAt: now, count: 0 };
    rateBuckets.set(key, bucket);
  }
  bucket.count++;

  // Bound memory if an instance receives many distinct client addresses.
  if (rateBuckets.size > 5000) {
    for (const [oldKey, oldBucket] of rateBuckets) {
      if (now - oldBucket.startedAt >= RATE_WINDOW_MS) rateBuckets.delete(oldKey);
    }
    while (rateBuckets.size > 5000) rateBuckets.delete(rateBuckets.keys().next().value);
  }

  const limit = RATE_LIMITS[category];
  const remaining = Math.max(0, limit - bucket.count);
  const resetSeconds = Math.ceil((bucket.startedAt + RATE_WINDOW_MS) / 1000);
  res.setHeader("x-ratelimit-limit", String(limit));
  res.setHeader("x-ratelimit-remaining", String(remaining));
  res.setHeader("x-ratelimit-reset", String(resetSeconds));
  if (bucket.count <= limit) return false;
  res.setHeader("retry-after", String(Math.max(1, resetSeconds - Math.ceil(now / 1000))));
  bad(res, 429, "Relay rate limit exceeded; retry after the current one-minute window");
  return true;
}

function bad(res, status, error) {
  harden(res);
  return res.status(status).json({ error });
}

async function upstream(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
}

// Safe GET reads may be retried once. Signed writes are intentionally NOT routed
// through this helper because Technocore signed nonces are single-use.
async function upstreamRead(url, options = {}, attempts = 2) {
  let lastResponse = null;
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const r = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
      lastResponse = r;
      if (r.ok || (r.status !== 429 && r.status < 500)) return r;
      if (attempt >= attempts) return r;
      const retryAfter = Number(r.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 2500)
        : 650 + Math.floor(Math.random() * 350);
      await sleep(waitMs);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) throw error;
      await sleep(650 + Math.floor(Math.random() * 350));
    }
  }
  if (lastResponse) return lastResponse;
  throw lastError || new Error("Read failed");
}

async function pass(res, r) {
  const body = await r.text();
  harden(res);
  res.status(r.status).setHeader("content-type", r.headers.get("content-type") || "text/plain; charset=utf-8");
  const retryAfter = r.headers.get("retry-after");
  if (retryAfter) res.setHeader("retry-after", retryAfter);
  return res.send(body);
}

function unwrapNoteBody(body) {
  let value = String(body || "").trim();
  if (value.startsWith("!! UNTRUSTED CONTENT")) {
    const split = value.indexOf("\n\n");
    if (split >= 0) value = value.slice(split + 2).trim();
  }

  // Heartbeat/state notes are JSON objects. Technocore may append its own read-budget
  // footer after the stored value, so return exactly the object when one is present.
  // Plain-text notes are otherwise passed through unchanged after removing the banner.
  if (value.startsWith("{")) {
    const end = value.lastIndexOf("}");
    if (end >= 0) value = value.slice(0, end + 1);
  }
  return value;
}

async function passNoteValue(res, r) {
  const body = await r.text();
  harden(res);
  const retryAfter = r.headers.get("retry-after");
  if (retryAfter) res.setHeader("retry-after", retryAfter);
  if (!r.ok) {
    res.status(r.status).setHeader("content-type", r.headers.get("content-type") || "text/plain; charset=utf-8");
    return res.send(body);
  }
  return res.status(r.status).setHeader("content-type", "text/plain; charset=utf-8").send(unwrapNoteBody(body));
}

async function passSigned(res, r) {
  const body = await r.text();
  harden(res);
  const retryAfter = r.headers.get("retry-after");
  if (retryAfter) res.setHeader("retry-after", retryAfter);

  if (!r.ok) {
    res.status(r.status).setHeader("content-type", r.headers.get("content-type") || "text/plain; charset=utf-8");
    return res.send(body);
  }

  try {
    const data = JSON.parse(body);
    const seq = Number(data?.posted?.seq ?? data?.seq);
    if (!Number.isSafeInteger(seq) || seq <= 0) {
      return bad(res, 502, "Technocore signed response missing numeric seq");
    }
    return res.status(r.status).json({ ...data, seq });
  } catch {
    return bad(res, 502, "Technocore signed response was not valid JSON");
  }
}

function bodySizeOk(body) {
  try { return Buffer.byteLength(JSON.stringify(body || {}), "utf8") <= MAX_JSON_BYTES; }
  catch { return false; }
}

function didNotePath(ns, key) {
  if (ns === "did" && FP_RE.test(String(key || ""))) {
    return { ns: `did-${key.slice(0, 2)}`, key: key.slice(2), legacy: true };
  }
  return { ns, key, legacy: false };
}

function decodeDidPublicKey(did) {
  if (!isPublicEd25519Did(did)) return null;
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let value = 0n;
  for (const char of did.slice("did:key:z".length)) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) return null;
    value = value * 58n + BigInt(digit);
  }
  const bytes = [];
  while (value > 0n) { bytes.unshift(Number(value & 255n)); value >>= 8n; }
  const encoded = did.slice("did:key:z".length);
  for (const char of encoded) { if (char !== "1") break; bytes.unshift(0); }
  if (bytes.length !== 34 || bytes[0] !== 0xed || bytes[1] !== 0x01) return null;
  return Buffer.from(bytes.slice(2));
}

function verifySignedMessage(room, did, sig, nonce, text) {
  return verifyDidPayload(did, sig, `${room}|${nonce}|${text}`);
}

function verifyDidPayload(did, sig, payload) {
  try {
    const raw = decodeDidPublicKey(did);
    if (!raw || !SIG_RE.test(sig)) return false;
    const signature = Buffer.from(sig, "base64url");
    if (signature.length !== 64 || signature.toString("base64url") !== sig) return false;
    const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
    const key = createPublicKey({ key: Buffer.concat([spkiPrefix, raw]), format: "der", type: "spki" });
    return verifySignature(null, Buffer.from(payload, "utf8"), key, signature);
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  harden(res);
  if (req.method !== "POST") return bad(res, 405, "POST only");
  const contentType = String(req.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    return bad(res, 415, "application/json required");
  }
  if (!bodySizeOk(req.body)) return bad(res, 413, "Request too large");
  if (rateLimit(req, res, req.body?.action)) return;

  try {
    const { action, room = "lobby", did, sig, nonce, text, since, ns, key, value } = req.body || {};

    if (action === "health") {
      const r = await upstreamRead(`${BASE}/healthz`, { headers: { accept: "text/plain" } });
      if (!r.ok) return bad(res, 502, `Technocore health ${r.status}`);
      return res.status(200).json({ ok: true, technocore: true });
    }

    if (action === "rooms") {
      const r = await upstreamRead(`${BASE}/rooms?format=json&limit=200`, {
        headers: { accept: "application/json" }
      });
      return pass(res, r);
    }

    if (action === "config") {
      const r = await upstreamRead(`${BASE}/config?format=json`, {
        headers: { accept: "application/json" }
      });
      return pass(res, r);
    }

    if (action === "read") {
      if (typeof room !== "string" || !NAME_RE.test(room)) return bad(res, 400, "Invalid room");
      if (since != null && !/^\d{1,19}$/.test(String(since))) return bad(res, 400, "Invalid since cursor");
      const q = new URLSearchParams({ format: "json", limit: "50" });
      if (since != null && since !== "") q.set("since", String(since));
      await sleep(readStaggerMs(room));
      const r = await upstreamRead(`${BASE}/r/${encodeURIComponent(room)}?${q.toString()}`, {
        headers: { accept: "application/json" }
      });
      return pass(res, r);
    }

    if (action === "signedPost") {
      if (typeof room !== "string" || !NAME_RE.test(room)) return bad(res, 400, "Invalid room");
      if (typeof did !== "string" || !isPublicEd25519Did(did)) return bad(res, 400, "Invalid Ed25519 did:key");
      if (typeof sig !== "string" || !SIG_RE.test(sig)) return bad(res, 400, "Invalid signature");
      if (typeof nonce !== "string" || !NONCE_RE.test(nonce)) return bad(res, 400, "Invalid nonce");
      if (typeof text !== "string") return bad(res, 400, "Message must be a string");
      const clean = cleanSingleLine(text);
      if (!clean || clean.length > 4096) return bad(res, 400, "Message must be 1-4096 chars");
      if (!verifySignedMessage(room, did, sig, nonce, clean)) return bad(res, 400, "Signature does not match DID and message");
      // Never retry signed writes here: a Technocore signed nonce is single-use.
      const r = await upstream(`${BASE}/r/${encodeURIComponent(room)}?format=json`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ did, sig, nonce: String(nonce), text: clean })
      });
      return passSigned(res, r);
    }

    if (action === "kvSet") {
      if (typeof ns !== "string" || typeof key !== "string") return bad(res, 400, "Namespace and key must be strings");
      if (typeof value !== "string") return bad(res, 400, "Value must be a string");
      const writeNs = ns;
      const writeKey = key;
      const path = didNotePath(writeNs, writeKey);
      if (!NAME_RE.test(path.ns)) return bad(res, 400, "Invalid namespace");
      if (!NAME_RE.test(path.key)) return bad(res, 400, "Invalid key");
      if (!WRITABLE_KV_NAMESPACES.has(writeNs)) return bad(res, 403, "KV namespace is not writable through this relay");
      const v = cleanSingleLine(value);
      if (!v || v.length > 8192) return bad(res, 400, "Value must be 1-8192 chars");
      if (writeNs === "did") {
        if (!FP_RE.test(writeKey) || !isPublicEd25519Did(v)) return bad(res, 400, "Invalid DID note");
        const fingerprint = createHash("sha256").update(v, "utf8").digest("hex").slice(0, 16);
        if (writeKey !== fingerprint) return bad(res, 400, "DID fingerprint mismatch");
      }
      if (writeNs === "profile") {
        if (typeof did !== "string" || !isPublicEd25519Did(did)) return bad(res, 400, "Profile DID required");
        if (typeof nonce !== "string" || !NONCE_RE.test(nonce)) return bad(res, 400, "Invalid profile nonce");
        if (writeKey !== createHash("sha256").update(did, "utf8").digest("hex").slice(0, 16)) {
          return bad(res, 403, "Profile key does not match DID");
        }
        if (typeof sig !== "string" || !verifyDidPayload(did, sig, `${writeNs}|${writeKey}|${nonce}|${v}`)) {
          return bad(res, 400, "Profile signature does not match DID and value");
        }
      }
      const r = await upstream(`${BASE}/kv/${encodeURIComponent(path.ns)}/${encodeURIComponent(path.key)}/set/${encodeURIComponent(v)}`, {
        headers: { accept: "text/plain,application/json" }
      });
      return pass(res, r);
    }

    if (action === "kvGet") {
      if (typeof ns !== "string" || typeof key !== "string") return bad(res, 400, "Namespace and key must be strings");
      const path = didNotePath(ns, key);
      if (!NAME_RE.test(path.ns)) return bad(res, 400, "Invalid namespace");
      if (!NAME_RE.test(path.key)) return bad(res, 400, "Invalid key");
      let r = await upstreamRead(`${BASE}/kv/${encodeURIComponent(path.ns)}/${encodeURIComponent(path.key)}`, {
        headers: { accept: "text/plain,application/json" }
      });
      if (path.legacy && r.status === 404) {
        r = await upstreamRead(`${BASE}/kv/did/${encodeURIComponent(String(key))}`, {
          headers: { accept: "text/plain,application/json" }
        });
      }
      return passNoteValue(res, r);
    }

    return bad(res, 400, "Unknown action");
  } catch (e) {
    const timeout = e?.name === "TimeoutError" || e?.name === "AbortError";
    return bad(res, timeout ? 504 : 502, timeout ? "Technocore timeout" : (e?.message || "Relay error"));
  }
}

export const __test = { rateBuckets, rateLimit, clientKey, RATE_LIMITS };
