import { createPrivateKey, createPublicKey, sign as nodeSign } from "node:crypto";

const BASE = "https://technocore.chat";
const ROOM = "close1";
const STATE_ROOM = "mb-reddragon-agent";
const SEASON = "close-1";
const MARKER = "REDDRAGON_CLOSE1_TRADER_V2";
const LOCK_MS = Date.parse("2026-10-04T09:00:00Z");
const FORCE_TREND_MS = Date.parse("2026-10-02T12:00:00Z");
const LATE_RISK_MS = Date.parse("2026-10-03T12:00:00Z");
const EXPECTED_DID = "did:key:z6MkuhrsP4tDZjWYdZLPxaur19WvrF1yuLGsGB2S8Q1gwS6K";
const keyB64 = String(process.env.TECHNOCORE_PRIVATE_KEY_PKCS8_B64 || "").trim();
const execute = String(process.env.CLOSE1_EXECUTE || "false").toLowerCase() === "true";

if (!keyB64) throw new Error("Missing TECHNOCORE_PRIVATE_KEY_PKCS8_B64");

function base58(bytes) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let x = 0n;
  for (const b of bytes) x = (x << 8n) + BigInt(b);
  let out = "";
  while (x > 0n) { out = alphabet[Number(x % 58n)] + out; x /= 58n; }
  for (const b of bytes) { if (b === 0) out = "1" + out; else break; }
  return out || "1";
}
function deriveDid(key) {
  const spki = createPublicKey(key).export({ format: "der", type: "spki" });
  const raw = spki.subarray(spki.length - 32);
  return `did:key:z${base58(Buffer.concat([Buffer.from([0xed, 0x01]), raw]))}`;
}
const privateKey = createPrivateKey({ key: Buffer.from(keyB64, "base64"), format: "der", type: "pkcs8" });
const did = deriveDid(privateKey);
if (did !== EXPECTED_DID) throw new Error("Private key does not match RedDragon DID");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function request(url, options = {}, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const r = await fetch(url, { ...options, signal: AbortSignal.timeout(25_000) });
      const text = await r.text();
      if (r.ok || (r.status < 500 && r.status !== 429)) return { r, text };
      lastError = new Error(`HTTP ${r.status}: ${text.slice(0, 300)}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await sleep(attempt * 1500);
  }
  throw lastError || new Error("request failed");
}
function messagesFrom(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.messages)) return value.messages;
  if (Array.isArray(value?.items)) return value.items;
  return [];
}
function messageText(item) { return String(item?.text ?? item?.message ?? item?.body ?? ""); }
function messageDid(item) {
  const from = String(item?.from || "");
  return String(item?.did || (from.startsWith("did:key:") ? from : ""));
}
function parseBody(item) { try { return JSON.parse(messageText(item)); } catch { return null; } }

async function readRoom(room, limit = 200) {
  const { r, text } = await request(
    `${BASE}/r/${encodeURIComponent(room)}?format=json&limit=${Math.min(200, limit)}`,
    { headers: { accept: "application/json", "cache-control": "no-cache" } }
  );
  if (!r.ok) throw new Error(`read ${room} failed ${r.status}: ${text.slice(0, 200)}`);
  return messagesFrom(JSON.parse(text));
}
async function readExport(room) {
  const { r, text } = await request(
    `${BASE}/r/${encodeURIComponent(room)}/export`,
    { headers: { accept: "application/x-ndjson,application/json,text/plain", "cache-control": "no-cache" } }
  );
  if (!r.ok) throw new Error(`export ${room} failed ${r.status}: ${text.slice(0, 200)}`);
  const trimmed = text.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    const messages = messagesFrom(parsed);
    if (messages.length || Array.isArray(parsed)) return messages;
  } catch {}
  const out = [];
  for (const raw of trimmed.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    try { out.push(JSON.parse(raw)); } catch {}
  }
  return out;
}

let lastNonce = 0;
function nextNonce() {
  lastNonce = Math.max(Date.now(), lastNonce + 1);
  return String(lastNonce);
}
function signPayload(value) {
  return nodeSign(null, Buffer.from(value, "utf8"), privateKey).toString("base64url");
}
async function signedPost(room, text) {
  const nonce = nextNonce();
  const sig = signPayload(`${room}|${nonce}|${text}`);
  const { r, text: body } = await request(
    `${BASE}/r/${encodeURIComponent(room)}?format=json`,
    {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json,text/plain" },
      body: JSON.stringify({ did, sig, nonce, text })
    },
    1
  );
  if (!r.ok) throw new Error(`signed post failed ${r.status}: ${body.slice(0, 500)}`);
  let seq = null;
  try {
    const parsed = JSON.parse(body);
    seq = Number(parsed?.posted?.seq || parsed?.seq || 0) || null;
  } catch {}
  return { seq, nonce };
}

async function latestState() {
  const msgs = await readRoom(STATE_ROOM, 200);
  const own = msgs.filter((m) => messageDid(m) === did && messageText(m).startsWith(MARKER + " "));
  if (!own.length) return { state: "idle" };
  const raw = messageText(own.at(-1)).slice(MARKER.length + 1);
  try { return JSON.parse(raw); } catch { return { state: "idle" }; }
}
async function saveState(state) {
  const text = MARKER + " " + JSON.stringify(state);
  if (!execute) {
    console.log("DRY_STATE=" + text);
    return;
  }
  const posted = await signedPost(STATE_ROOM, text);
  console.log("STATE_SAVED seq=" + (posted.seq || "?") + " " + JSON.stringify(state));
}

async function priceSeries() {
  const msgs = await readRoom("d-close1-price", 200);
  const out = [];
  for (const m of msgs) {
    const b = parseBody(m);
    if (b?.t === "price" && b?.ref?.px && b?.ref?.time) {
      out.push({
        n: Number(b.n),
        px: Number(b.ref.px),
        time: String(b.ref.time),
        tid: String(b.ref.tid || ""),
        limits: b.limits
      });
    }
  }
  out.sort((a, b) => a.n - b.n);
  return out;
}
function distinctRefs(series) {
  const out = [];
  for (const item of series) {
    const last = out.at(-1);
    if (!last || last.tid !== item.tid || last.time !== item.time || last.px !== item.px) out.push(item);
  }
  return out;
}
function ageMs(item, now) {
  const ts = Date.parse(String(item?.time || ""));
  return Number.isFinite(ts) ? now - ts : Infinity;
}
function signalFor(distinct, now) {
  const last = distinct.at(-1);
  const prev = distinct.at(-2);
  if (!last || !prev || ageMs(last, now) > 10 * 60_000) return null;

  // External chart research gives the same broad map repeatedly:
  // ~229-230 is the major resistance zone; ~220-223 is the important lower support/reclaim area.
  // Require fresh Hyperliquid xyz:NVDA confirmation because that is the contest's actual oracle.
  const prevFresh = ageMs(prev, now) <= 35 * 60_000;
  const recent60 = distinct.filter((x) => ageMs(x, now) <= 60 * 60_000).slice(-8);
  const recentPx = recent60.map((x) => x.px);

  if (prevFresh && last.px >= 230.00 && prev.px >= 229.50 && last.px >= prev.px) {
    return { side: "buy", reason: "confirmed_breakout_230", confidence: "high" };
  }
  if (recentPx.length >= 2 && Math.min(...recentPx) <= 222.50 && last.px >= 223.50 && last.px > prev.px) {
    return { side: "buy", reason: "support_reclaim_223", confidence: "medium" };
  }
  if (prevFresh && last.px <= 220.50 && prev.px <= 221.00 && last.px <= prev.px) {
    return { side: "sell", reason: "confirmed_breakdown_221", confidence: "high" };
  }
  if (recentPx.length >= 2 && Math.max(...recentPx) >= 229.50 && last.px <= 228.00 && last.px < prev.px) {
    return { side: "sell", reason: "rejection_from_230", confidence: "medium" };
  }

  if (now >= FORCE_TREND_MS && recentPx.length >= 3) {
    const base = recentPx[0];
    const move = last.px / base - 1;
    if (move >= 0.012) return { side: "buy", reason: "late_contest_uptrend", confidence: "high" };
    if (move <= -0.012) return { side: "sell", reason: "late_contest_downtrend", confidence: "high" };
  }

  if (now >= LATE_RISK_MS && distinct.length >= 2) {
    const opening = distinct[0].px;
    const move = last.px / opening - 1;
    if (move >= 0.003) return { side: "buy", reason: "final_day_positive_bias", confidence: "medium" };
    if (move <= -0.003) return { side: "sell", reason: "final_day_negative_bias", confidence: "medium" };
  }
  return null;
}

function safeQty(px, confidence) {
  // Leave room for the 1% base fee and a modest same-sweep clawback move.
  // The contest has no leverage; a void is worse than being a little smaller.
  const reserve = confidence === "high" ? 1.025 : 1.035;
  const max = Math.floor((10000 / (px * reserve)) * 100) / 100;
  const target = confidence === "high" ? 43.20 : 40.00;
  return Math.max(0.1, Math.min(target, max));
}
function makeOffer(side, px, qty, until, id) {
  const terms = {
    id,
    maker: did,
    px: px.toFixed(2),
    qty: qty.toFixed(2),
    side,
    taker: "any",
    until
  };
  const termsJson = JSON.stringify(terms);
  const maker_sig = signPayload(`${SEASON}|terms|${termsJson}`);
  return {
    terms,
    text: JSON.stringify({ t: "trade", season: SEASON, terms, taker: "any", maker_sig })
  };
}

async function findFinalizedTrade(id) {
  // close1 is extremely busy: a tail read can move past our offer in one sweep.
  // The retained export is bounded by Technocore's room ring and is the reliable short-horizon lookup.
  const msgs = await readExport(ROOM);
  for (let i = msgs.length - 1; i >= 0; i--) {
    const b = parseBody(msgs[i]);
    if (
      b?.t === "trade" &&
      b?.season === SEASON &&
      b?.terms?.id === id &&
      b?.terms?.maker === did &&
      b?.taker_sig &&
      b?.taker &&
      b.taker !== "any"
    ) {
      return { seq: Number(msgs[i]?.seq || 0) || null, body: b };
    }
  }
  return null;
}
async function findFlowOutcome(id) {
  const msgs = await readRoom("d-close1-flow", 80);
  for (let i = msgs.length - 1; i >= 0; i--) {
    const b = parseBody(msgs[i]);
    if (b?.t !== "flow") continue;
    if (Array.isArray(b.settled) && b.settled.includes(id)) {
      return { outcome: "settled", n: Number(b.n) };
    }
    if (Array.isArray(b.void)) {
      const hit = b.void.find((v) => Array.isArray(v) && v[0] === id);
      if (hit) return { outcome: "void", reason: hit[1], n: Number(b.n) };
    }
  }
  return null;
}

const now = Date.now();
if (now >= LOCK_MS) {
  console.log("LOCKED: contest trading window ended.");
  process.exit(0);
}

const series = await priceSeries();
const distinct = distinctRefs(series);
const latest = series.at(-1);
if (!latest) throw new Error("No referee price available");
console.log(
  "DID=" + did +
  " execute=" + execute +
  " currentN=" + latest.n +
  " ref=" + latest.px +
  " distinctRefs=" + distinct.length
);
console.log("RECENT_DISTINCT=" + JSON.stringify(distinct.slice(-8)));

let state = await latestState();
console.log("STATE=" + JSON.stringify(state));

// One-bet contest strategy: once a real trade settles (or settles but is omitted from the
// public flow list), never stack another blind position. Fees and uncertain public flow
// reconciliation make repeated churn a worse risk than holding one strong directional bet.
if (["settled", "accepted_unverified"].includes(state.state)) {
  console.log("HOLD_ONE_BET: " + JSON.stringify(state));
  process.exit(0);
}

if (state.state === "accepted") {
  const outcome = await findFlowOutcome(state.id);
  if (outcome?.outcome === "settled") {
    const next = { ...state, state: "settled", settledSweep: outcome.n, settledAt: new Date().toISOString() };
    await saveState(next);
    console.log("TRADE_SETTLED=" + JSON.stringify(next));
    process.exit(0);
  }
  if (outcome?.outcome === "void") {
    const next = {
      state: "idle",
      lastId: state.id,
      lastVoid: outcome.reason,
      lastVoidSweep: outcome.n,
      at: new Date().toISOString()
    };
    await saveState(next);
    console.log("TRADE_VOID=" + JSON.stringify(next));
    state = next;
  } else if (Number(latest.n) >= Number(state.acceptedAtSweep || latest.n) + 3) {
    // Public flow can omit individual settled IDs. Do not risk a second position when the
    // first finalized trade cannot be reconciled publicly.
    const next = { ...state, state: "accepted_unverified", checkedThroughSweep: latest.n };
    await saveState(next);
    console.log("ACCEPTED_OUTCOME_OMITTED: stop further trading for safety.");
    process.exit(0);
  } else {
    console.log("ACCEPTED_PENDING_SWEEP: no duplicate position.");
    process.exit(0);
  }
}

if (state.state === "offer") {
  const finalized = await findFinalizedTrade(state.id);
  if (finalized) {
    const next = {
      ...state,
      state: "accepted",
      acceptedSeq: finalized.seq,
      acceptedAtSweep: latest.n,
      acceptedAt: new Date().toISOString(),
      taker: finalized.body.taker
    };
    await saveState(next);
    console.log("OFFER_ACCEPTED=" + JSON.stringify(next));
    process.exit(0);
  }
  if (Number(latest.n) <= Number(state.until || 0)) {
    console.log("OFFER_LIVE: waiting for taker; no duplicate.");
    process.exit(0);
  }
  const next = { state: "idle", reason: "offer_expired", lastId: state.id, at: new Date().toISOString() };
  await saveState(next);
  console.log("OFFER_EXPIRED");
  state = next;
}

const signal = signalFor(distinct, now);
if (!signal) {
  console.log("NO_TRADE: no high-quality signal; fee-aware wait.");
  process.exit(0);
}

const qty = safeQty(latest.px, signal.confidence);
const id = "rd1-" + String(latest.n) + "-" + Date.now().toString(36).slice(-7);
const until = Number(latest.n) + 3;
const offer = makeOffer(signal.side, latest.px, qty, until, id);
console.log("SIGNAL=" + JSON.stringify(signal) + " QTY=" + qty.toFixed(2) + " OFFER=" + offer.text);

if (!execute) {
  console.log("DRY_RUN_ONLY");
  process.exit(0);
}

const posted = await signedPost(ROOM, offer.text);
const next = {
  state: "offer",
  id,
  side: signal.side,
  qty,
  px: latest.px,
  until,
  postedSeq: posted.seq,
  reason: signal.reason,
  confidence: signal.confidence,
  postedAt: new Date().toISOString()
};
await saveState(next);
console.log("OFFER_POSTED seq=" + (posted.seq || "?") + " " + JSON.stringify(next));
