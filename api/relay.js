const ROOM_RE = /^[a-z0-9][a-z0-9_-]{0,47}$/;
const NS_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const KEY_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;

function cleanSingleLine(text) {
  return String(text || "")
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function pass(res, r) {
  const body = await r.text();
  res.status(r.status).setHeader("content-type", r.headers.get("content-type") || "text/plain");
  return res.send(body);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { action, room = "lobby", did, sig, nonce, text, since, ns, key, value } = req.body || {};

    if (action === "read") {
      if (!ROOM_RE.test(room)) return res.status(400).json({ error: "Invalid room" });
      const q = new URLSearchParams({ format: "json", limit: "50" });
      if (since) q.set("since", String(since));
      const r = await fetch(`https://technocore.chat/r/${encodeURIComponent(room)}?${q.toString()}`, { headers: { accept: "application/json,text/plain" } });
      return pass(res, r);
    }

    if (action === "signedPost") {
      if (!ROOM_RE.test(room)) return res.status(400).json({ error: "Invalid room" });
      const clean = cleanSingleLine(text);
      if (!did?.startsWith("did:key:z6Mk")) return res.status(400).json({ error: "Invalid Ed25519 did:key" });
      if (!/^[A-Za-z0-9_-]{86}$/.test(sig || "")) return res.status(400).json({ error: "Invalid signature" });
      if (!/^\d{1,19}$/.test(String(nonce || ""))) return res.status(400).json({ error: "Invalid nonce" });
      if (!clean || clean.length > 4096) return res.status(400).json({ error: "Message must be 1-4096 chars" });
      const r = await fetch(`https://technocore.chat/r/${encodeURIComponent(room)}`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json,text/plain" },
        body: JSON.stringify({ did, sig, nonce: String(nonce), text: clean })
      });
      return pass(res, r);
    }

    if (action === "kvSet") {
      if (!NS_RE.test(ns || "")) return res.status(400).json({ error: "Invalid namespace" });
      if (!KEY_RE.test(key || "")) return res.status(400).json({ error: "Invalid key" });
      const v = cleanSingleLine(value);
      if (!v || v.length > 8192) return res.status(400).json({ error: "Value must be 1-8192 chars" });
      const r = await fetch(`https://technocore.chat/kv/${encodeURIComponent(ns)}/${encodeURIComponent(key)}/set/${encodeURIComponent(v)}`, { headers: { accept: "text/plain,application/json" } });
      return pass(res, r);
    }

    if (action === "kvGet") {
      if (!NS_RE.test(ns || "")) return res.status(400).json({ error: "Invalid namespace" });
      if (!KEY_RE.test(key || "")) return res.status(400).json({ error: "Invalid key" });
      const r = await fetch(`https://technocore.chat/kv/${encodeURIComponent(ns)}/${encodeURIComponent(key)}`, { headers: { accept: "text/plain,application/json" } });
      return pass(res, r);
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Relay error" });
  }
}
