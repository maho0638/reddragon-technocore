const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,47}$/;
const DID_RE = /^did:key:z6Mk[1-9A-HJ-NP-Za-km-z]+$/;
const SIG_RE = /^[A-Za-z0-9_-]{86}$/;
const NONCE_RE = /^\d{1,19}$/;
const FP_RE = /^[0-9a-f]{16}$/;
const BASE = "https://technocore.chat";
const MAX_JSON_BYTES = 32 * 1024;

function cleanSingleLine(text) {
  return String(text || "")
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function harden(res) {
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("referrer-policy", "no-referrer");
}

function bad(res, status, error) {
  harden(res);
  return res.status(status).json({ error });
}

async function upstream(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
}

async function pass(res, r) {
  const body = await r.text();
  harden(res);
  res.status(r.status).setHeader("content-type", r.headers.get("content-type") || "text/plain; charset=utf-8");
  const retryAfter = r.headers.get("retry-after");
  if (retryAfter) res.setHeader("retry-after", retryAfter);
  return res.send(body);
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

export default async function handler(req, res) {
  harden(res);
  if (req.method !== "POST") return bad(res, 405, "POST only");
  if (!String(req.headers["content-type"] || "").toLowerCase().includes("application/json")) {
    return bad(res, 415, "application/json required");
  }
  if (!bodySizeOk(req.body)) return bad(res, 413, "Request too large");

  try {
    const { action, room = "lobby", did, sig, nonce, text, since, ns, key, value } = req.body || {};

    if (action === "health") {
      const r = await upstream(`${BASE}/healthz`, { headers: { accept: "text/plain" } });
      if (!r.ok) return bad(res, 502, `Technocore health ${r.status}`);
      return res.status(200).json({ ok: true, technocore: true });
    }

    if (action === "read") {
      if (!NAME_RE.test(room)) return bad(res, 400, "Invalid room");
      if (since != null && !/^\d{1,19}$/.test(String(since))) return bad(res, 400, "Invalid since cursor");
      const q = new URLSearchParams({ format: "json", limit: "50" });
      if (since != null && since !== "") q.set("since", String(since));
      const r = await upstream(`${BASE}/r/${encodeURIComponent(room)}?${q.toString()}`, {
        headers: { accept: "application/json" }
      });
      return pass(res, r);
    }

    if (action === "signedPost") {
      if (!NAME_RE.test(room)) return bad(res, 400, "Invalid room");
      const clean = cleanSingleLine(text);
      if (!DID_RE.test(String(did || ""))) return bad(res, 400, "Invalid Ed25519 did:key");
      if (!SIG_RE.test(String(sig || ""))) return bad(res, 400, "Invalid signature");
      if (!NONCE_RE.test(String(nonce || ""))) return bad(res, 400, "Invalid nonce");
      if (!clean || clean.length > 4096) return bad(res, 400, "Message must be 1-4096 chars");
      const r = await upstream(`${BASE}/r/${encodeURIComponent(room)}?format=json`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ did, sig, nonce: String(nonce), text: clean })
      });
      return passSigned(res, r);
    }

    if (action === "kvSet") {
      const path = didNotePath(String(ns || ""), String(key || ""));
      if (!NAME_RE.test(path.ns)) return bad(res, 400, "Invalid namespace");
      if (!NAME_RE.test(path.key)) return bad(res, 400, "Invalid key");
      const v = cleanSingleLine(value);
      if (!v || v.length > 8192) return bad(res, 400, "Value must be 1-8192 chars");
      const r = await upstream(`${BASE}/kv/${encodeURIComponent(path.ns)}/${encodeURIComponent(path.key)}/set/${encodeURIComponent(v)}`, {
        headers: { accept: "text/plain,application/json" }
      });
      return pass(res, r);
    }

    if (action === "kvGet") {
      const path = didNotePath(String(ns || ""), String(key || ""));
      if (!NAME_RE.test(path.ns)) return bad(res, 400, "Invalid namespace");
      if (!NAME_RE.test(path.key)) return bad(res, 400, "Invalid key");
      let r = await upstream(`${BASE}/kv/${encodeURIComponent(path.ns)}/${encodeURIComponent(path.key)}`, {
        headers: { accept: "text/plain,application/json" }
      });
      if (path.legacy && r.status === 404) {
        r = await upstream(`${BASE}/kv/did/${encodeURIComponent(String(key))}`, {
          headers: { accept: "text/plain,application/json" }
        });
      }
      return pass(res, r);
    }

    return bad(res, 400, "Unknown action");
  } catch (e) {
    const timeout = e?.name === "TimeoutError" || e?.name === "AbortError";
    return bad(res, timeout ? 504 : 502, timeout ? "Technocore timeout" : (e?.message || "Relay error"));
  }
}
