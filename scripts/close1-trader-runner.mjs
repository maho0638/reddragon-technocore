import {
  createPrivateKey, createPublicKey, sign as nodeSign, verify as nodeVerify, createHash,
  diffieHellman, hkdfSync, createDecipheriv, createCipheriv, randomBytes
} from "node:crypto";
import { readFile } from "node:fs/promises";

const BASE = "https://technocore.chat";
const ROOM = "close1";
const STATE_PATH = "runtime/close1-state.enc";
const STATE_MARKER = "REDDRAGON_CLOSE1_STATE_V5:";
const SEASON = "close-1";
const OPEN_MS = Date.parse("2026-09-25T12:00:00Z");
const LOCK_MS = Date.parse("2026-10-04T09:00:00Z");
const EXPECTED_DID = "did:key:z6MkuhrsP4tDZjWYdZLPxaur19WvrF1yuLGsGB2S8Q1gwS6K";
const keyB64 = String(process.env.TECHNOCORE_PRIVATE_KEY_PKCS8_B64 || "").trim();
const execute = String(process.env.CLOSE1_EXECUTE || "false").toLowerCase() === "true";
const stateSelftest = String(process.env.CLOSE1_STATE_SELFTEST || "false").toLowerCase() === "true";
const raceSelftest = String(process.env.CLOSE1_RACE_SELFTEST || "false").toLowerCase() === "true";
const ghToken = String(process.env.GITHUB_TOKEN || "").trim();
const ghRepo = String(process.env.GITHUB_REPOSITORY || "maho0638/reddragon-technocore").trim();
if (!keyB64) throw new Error("Missing TECHNOCORE_PRIVATE_KEY_PKCS8_B64");
if (!ghToken) throw new Error("Missing GITHUB_TOKEN for encrypted state persistence");

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
  const raw = spki.subarray(spki.length - 32);
  return `did:key:z${base58(Buffer.concat([Buffer.from([0xed, 0x01]), raw]))}`;
}
function base58Decode(text) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let x = 0n;
  for (const ch of String(text)) {
    const i = alphabet.indexOf(ch);
    if (i < 0) throw new Error("invalid base58");
    x = x * 58n + BigInt(i);
  }
  const bytes = [];
  while (x > 0n) {
    bytes.push(Number(x & 255n));
    x >>= 8n;
  }
  bytes.reverse();
  let leading = 0;
  for (const ch of String(text)) {
    if (ch === "1") leading++;
    else break;
  }
  return Buffer.concat([Buffer.alloc(leading), Buffer.from(bytes)]);
}
function publicKeyFromDid(didText) {
  const value = String(didText || "");
  if (!value.startsWith("did:key:z")) throw new Error("unsupported did");
  const decoded = base58Decode(value.slice("did:key:z".length));
  if (decoded.length !== 34 || decoded[0] !== 0xed || decoded[1] !== 0x01) {
    throw new Error("unsupported did key");
  }
  const raw = decoded.subarray(2);
  const spki = Buffer.concat([
    Buffer.from("302a300506032b6570032100", "hex"),
    raw
  ]);
  return createPublicKey({ key: spki, format: "der", type: "spki" });
}

const privateKey = createPrivateKey({
  key: Buffer.from(keyB64, "base64"),
  format: "der",
  type: "pkcs8"
});
const did = deriveDid(privateKey);
if (did !== EXPECTED_DID) throw new Error("Private key does not match RedDragon DID");

const jwk = privateKey.export({ format: "jwk" });
const secretSeed = Buffer.from(jwk.d, "base64url");
const stateEncKey = Buffer.from(
  hkdfSync(
    "sha256",
    secretSeed,
    Buffer.from("reddragon-close1-state-v5"),
    Buffer.from("encrypted-room-state"),
    32
  )
);

function b64u(s) {
  return Buffer.from(s, "base64url");
}
async function loadDecisionFunction() {
  const blob = JSON.parse(
    await readFile(new URL("./close1-strategy.enc.json", import.meta.url), "utf8")
  );
  if (blob.v !== 2) throw new Error("Unsupported encrypted strategy version");

  const h = createHash("sha512").update(secretSeed).digest();
  const scalar = Buffer.from(h.subarray(0, 32));
  scalar[0] &= 248;
  scalar[31] &= 127;
  scalar[31] |= 64;

  const xPrivDer = Buffer.concat([
    Buffer.from("302e020100300506032b656e04220420", "hex"),
    scalar
  ]);
  const xPriv = createPrivateKey({ key: xPrivDer, format: "der", type: "pkcs8" });
  const xPubDer = Buffer.concat([
    Buffer.from("302a300506032b656e032100", "hex"),
    b64u(blob.epk)
  ]);
  const ephPub = createPublicKey({ key: xPubDer, format: "der", type: "spki" });
  const shared = diffieHellman({ privateKey: xPriv, publicKey: ephPub });
  const key = Buffer.from(
    hkdfSync(
      "sha256",
      shared,
      Buffer.from("reddragon-close1-strategy-v2"),
      Buffer.from("close1-strategy-js"),
      32
    )
  );

  const all = b64u(blob.ct);
  const tag = all.subarray(all.length - 16);
  const ciphertext = all.subarray(0, all.length - 16);
  const dec = createDecipheriv("aes-256-gcm", key, b64u(blob.nonce));
  dec.setAAD(Buffer.from("close1-strategy-v2"));
  dec.setAuthTag(tag);
  const source = Buffer.concat([dec.update(ciphertext), dec.final()]).toString("utf8");
  return new Function("ctx", `${source}\nreturn decide(ctx);`);
}
const decide = await loadDecisionFunction();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function request(url, options = {}, attempts = 3) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    try {
      const r = await fetch(url, { ...options, signal: AbortSignal.timeout(25000) });
      const text = await r.text();
      if (r.ok || (r.status < 500 && r.status !== 429)) return { r, text };
      last = new Error(`HTTP ${r.status}: ${text.slice(0, 300)}`);
    } catch (error) {
      last = error;
    }
    if (i < attempts) await sleep(i * 1500);
  }
  throw last || new Error("request failed");
}
function messagesFrom(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.messages)) return value.messages;
  if (Array.isArray(value?.items)) return value.items;
  return [];
}
function messageText(item) {
  return String(item?.text ?? item?.message ?? item?.body ?? "");
}
function messageDid(item) {
  const from = String(item?.from || "");
  return String(item?.did || (from.startsWith("did:key:") ? from : ""));
}
function parseBody(item) {
  try {
    return JSON.parse(messageText(item));
  } catch {
    return null;
  }
}

async function readRoom(room, limit = 200) {
  const { r, text } = await request(
    `${BASE}/r/${encodeURIComponent(room)}?format=json&limit=${Math.min(200, limit)}`,
    { headers: { accept: "application/json", "cache-control": "no-cache" } }
  );
  if (!r.ok) throw new Error(`read ${room} failed ${r.status}`);
  return messagesFrom(JSON.parse(text));
}
async function readExport(room) {
  const { r, text } = await request(
    `${BASE}/r/${encodeURIComponent(room)}/export`,
    { headers: { accept: "application/x-ndjson,application/json,text/plain", "cache-control": "no-cache" } }
  );
  if (!r.ok) throw new Error(`export ${room} failed ${r.status}`);
  const trimmed = text.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    const m = messagesFrom(parsed);
    if (m.length || Array.isArray(parsed)) return m;
  } catch {}
  const out = [];
  for (const line of trimmed.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {}
  }
  return out;
}

function toB64u(value) {
  return Buffer.from(value).toString("base64url");
}
function encryptState(state) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", stateEncKey, nonce);
  cipher.setAAD(Buffer.from(STATE_MARKER));
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(state), "utf8")),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  return STATE_MARKER + toB64u(nonce) + "." + toB64u(Buffer.concat([ciphertext, tag]));
}
function decryptState(text) {
  if (!String(text || "").startsWith(STATE_MARKER)) return null;
  try {
    const payload = String(text).slice(STATE_MARKER.length);
    const [nonceText, packedText] = payload.split(".");
    const nonce = Buffer.from(nonceText, "base64url");
    const packed = Buffer.from(packedText, "base64url");
    if (nonce.length !== 12 || packed.length <= 16) return null;
    const ciphertext = packed.subarray(0, packed.length - 16);
    const tag = packed.subarray(packed.length - 16);
    const dec = createDecipheriv("aes-256-gcm", stateEncKey, nonce);
    dec.setAAD(Buffer.from(STATE_MARKER));
    dec.setAuthTag(tag);
    const plain = Buffer.concat([dec.update(ciphertext), dec.final()]).toString("utf8");
    const parsed = JSON.parse(plain);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
function stateApiUrl() {
  const safePath = STATE_PATH.split("/").map(encodeURIComponent).join("/");
  return `https://api.github.com/repos/${ghRepo}/contents/${safePath}`;
}
async function fetchStateFile() {
  const { r, text } = await request(
    stateApiUrl() + "?ref=main",
    {
      headers: {
        authorization: `Bearer ${ghToken}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "cache-control": "no-cache"
      }
    },
    1
  );
  if (r.status === 404) return { sha: null, text: null };
  if (!r.ok) throw new Error(`STATE_GITHUB_READ_FAILED ${r.status}: ${text.slice(0, 300)}`);
  const parsed = JSON.parse(text);
  const raw = Buffer.from(String(parsed.content || "").replace(/\n/g, ""), "base64").toString("utf8");
  return { sha: parsed.sha || null, text: raw };
}
async function getState() {
  const file = await fetchStateFile();
  if (!file.text) return { state: "idle" };
  const state = decryptState(file.text.trim());
  if (!state) throw new Error("STATE_GITHUB_DECRYPT_FAILED");
  return state;
}
async function setState(state, force = false) {
  if (!execute && !force) {
    console.log(`DRY_STATE=${state.state}`);
    return;
  }

  const current = await fetchStateFile();
  const payload = {
    message: "chore(close1): persist encrypted trader state",
    content: Buffer.from(encryptState(state), "utf8").toString("base64"),
    branch: "main"
  };
  if (current.sha) payload.sha = current.sha;

  const { r, text } = await request(
    stateApiUrl(),
    {
      method: "PUT",
      headers: {
        authorization: `Bearer ${ghToken}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28"
      },
      body: JSON.stringify(payload)
    },
    1
  );
  if (!r.ok) throw new Error(`STATE_GITHUB_WRITE_FAILED ${r.status}: ${text.slice(0, 300)}`);
  console.log(`STATE=${state.state} store=github`);
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
  if (!r.ok) throw new Error(`post failed ${r.status}: ${body.slice(0, 500)}`);
  let seq = null;
  try {
    const parsed = JSON.parse(body);
    seq = Number(parsed?.posted?.seq || parsed?.seq || 0) || null;
  } catch {}
  return { seq };
}

async function priceSeries() {
  const msgs = await readExport("d-close1-price");
  const out = [];
  for (const m of msgs) {
    const b = parseBody(m);
    if (b?.t === "price" && b?.ref?.px && b?.ref?.time) {
      out.push({
        n: Number(b.n),
        px: Number(b.ref.px),
        time: String(b.ref.time),
        tid: String(b.ref.tid || ""),
        age_s: Number(b.age_s || 0)
      });
    }
  }
  out.sort((a, b) => a.n - b.n);
  return out;
}
function distinctRefs(series) {
  const out = [];
  for (const x of series) {
    const last = out.at(-1);
    if (!last || last.tid !== x.tid || last.time !== x.time || last.px !== x.px) out.push(x);
  }
  return out;
}
async function pnlSnapshots() {
  const msgs = await readRoom("d-close1-pnl", 200);
  const out = [];
  for (const m of msgs) {
    const b = parseBody(m);
    if (b?.t === "pnl" && b?.mark && Array.isArray(b.top)) {
      out.push({ n: Number(b.n), mark: Number(b.mark), top: b.top });
    }
  }
  out.sort((a, b) => a.n - b.n);
  return out;
}
async function positionSnapshots() {
  const msgs = await readRoom("d-close1-positions", 200);
  const out = [];
  for (const m of msgs) {
    const b = parseBody(m);
    if (b?.t === "positions" && Array.isArray(b.top)) {
      out.push({
        n: Number(b.n),
        open: Number(b.open || 0),
        longs: Number(b.longs || 0),
        shorts: Number(b.shorts || 0),
        top: b.top
      });
    }
  }
  out.sort((a, b) => a.n - b.n);
  return out;
}

function currentOwnPosition(posSnapshots) {
  const latest = posSnapshots.at(-1);
  if (!latest) return null;
  const hit = latest.top.find(([key]) => key === did);
  return hit ? Number(hit[1]) : null;
}

function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

function leaderScore(pnlSnapshots) {
  const latest = pnlSnapshots.at(-1);
  if (!latest || !Array.isArray(latest.top) || !latest.top.length) return null;
  const scores = latest.top.map((row) => Number(row?.[1])).filter(Number.isFinite);
  return scores.length ? Math.max(...scores) : null;
}

function ownScoreEstimate(state, latestMark) {
  const realized = Number(state?.realizedScoreEst || 0);
  if (state?.state !== "open" || !Number.isFinite(Number(state.qty)) || !Number.isFinite(Number(state.entryPx))) {
    return realized;
  }
  const qty = Number(state.qty);
  const entry = Number(state.entryPx);
  const mark = Number(latestMark);
  if (!Number.isFinite(mark)) return realized;
  const direction = state.side === "buy" ? 1 : -1;
  const gross = direction * qty * (mark - entry);
  const entryFeeEst = Number(state.entryFeeEst || (0.01 * qty * entry));
  return realized + gross - entryFeeEst;
}

function raceContext({ now, pnlSnapshots, state, latest }) {
  const leader = leaderScore(pnlSnapshots);
  const own = ownScoreEstimate(state, latest?.px);
  const remainingMs = Math.max(0, LOCK_MS - now);
  const totalMs = LOCK_MS - OPEN_MS;
  const timeRemainingFrac = clamp(remainingMs / totalMs, 0, 1);
  const elapsedFrac = 1 - timeRemainingFrac;
  const gap = Number.isFinite(leader) ? leader - own : null;
  return {
    leaderScore: leader,
    ownScoreEst: own,
    leaderGap: gap,
    timeRemainingFrac,
    elapsedFrac,
    hoursRemaining: remainingMs / 3600000
  };
}

// The encrypted strategy decides whether a setup is good enough to trade.
// This overlay only sizes an already-approved entry for the race objective:
// preserve optionality early, scale conviction when behind late, and protect a lead.
function applyRaceSizing(decision, race, latestPx) {
  if (!decision || decision.action !== "enter") return decision;
  let qty = Number(decision.qty);
  if (!Number.isFinite(qty) || qty < 0.1) return null;

  const px = Number(latestPx);
  const maxAffordable = Number.isFinite(px) && px > 0
    ? Math.max(0.1, Math.min(44.5, (10000 / (px * 1.035))))
    : 43;
  const rawConfidence = decision.confidence;
  const confidence = clamp(
    Number.isFinite(Number(rawConfidence))
      ? Number(rawConfidence)
      : ({ very_high: 0.95, high: 0.9, medium: 0.72, low: 0.55 }[
          String(rawConfidence || "").toLowerCase().replace(/\s+/g, "_")
        ] ?? 0.5),
    0,
    1
  );
  const gap = Number(race?.leaderGap);
  const t = clamp(Number(race?.timeRemainingFrac ?? 1), 0, 1);

  // Start from the encrypted strategy's quantity; race pressure may only
  // increase size when confidence is already high.
  let multiplier = 1;

  if (Number.isFinite(gap)) {
    if (gap <= 0) {
      // At/above the current leader: defend the score, do not press without exceptional conviction.
      multiplier *= confidence >= 0.9 ? 0.7 : 0.45;
    } else {
      const normalizedGap = clamp(gap / 500, 0, 1);
      const urgency = clamp((1 - t) * 1.25, 0, 1);
      const pressure = normalizedGap * urgency;

      if (confidence >= 0.82) multiplier *= 1 + 0.75 * pressure;
      else if (confidence < 0.65) multiplier *= 0.75;
    }
  }

  // Early contest: keep capital optional unless the signal is unusually strong.
  if (t > 0.70 && confidence < 0.86) multiplier *= 0.8;

  qty = clamp(qty * multiplier, 0.1, maxAffordable);
  return {
    ...decision,
    qty: Math.floor(qty * 100) / 100,
    race: {
      leaderGap: Number.isFinite(gap) ? Number(gap.toFixed(2)) : null,
      hoursRemaining: Number(race.hoursRemaining.toFixed(2)),
      multiplier: Number(multiplier.toFixed(3))
    }
  };
}

if (raceSelftest) {
  const base = { action: "enter", side: "buy", qty: 20, confidence: 0.9 };
  const behindLate = applyRaceSizing(
    base,
    { leaderGap: 300, timeRemainingFrac: 0.1, hoursRemaining: 20 },
    225
  );
  const ahead = applyRaceSizing(
    base,
    { leaderGap: -50, timeRemainingFrac: 0.4, hoursRemaining: 80 },
    225
  );
  if (!(behindLate?.qty > 20)) throw new Error("RACE_SELFTEST_BEHIND_NOT_AGGRESSIVE");
  if (!(ahead?.qty < 20)) throw new Error("RACE_SELFTEST_AHEAD_NOT_DEFENSIVE");
  console.log("RACE_SIZING_SELFTEST_OK");
  process.exit(0);
}

function controlledFallbackEntry(rawDecision, race, distinct, positionSnapshots, latest) {
  if (rawDecision?.action === "enter") return rawDecision;

  const gap = Number(race?.leaderGap);
  const hLeft = Number(race?.hoursRemaining);
  if (!Number.isFinite(gap) || gap < 125) return rawDecision;
  if (!Number.isFinite(hLeft) || hLeft > 198) return rawDecision;
  if (!Number.isFinite(Number(latest?.px))) return rawDecision;

  // Controlled scout entry only when a sustained price move and the visible
  // top-position consensus point in the same direction. Keep the diagnostics
  // visible so an idle bot can be distinguished from a broken bot.
  const refs = distinct.slice(-72);
  if (refs.length < 18) {
    console.log(`FALLBACK_SCAN blocked=refs refs=${refs.length} gap=${gap.toFixed(2)} hLeft=${hLeft.toFixed(1)}`);
    return rawDecision;
  }

  const ys = refs.map((x) => Number(x.px)).filter(Number.isFinite);
  if (ys.length !== refs.length || ys.length < 18) {
    console.log(`FALLBACK_SCAN blocked=prices refs=${refs.length} valid=${ys.length}`);
    return rawDecision;
  }

  const n = ys.length;
  const xMean = (n - 1) / 2;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - xMean;
    const dy = ys[i] - yMean;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }

  const move = ys.at(-1) - ys[0];
  const absMove = Math.abs(move);
  const r2 = varX > 0 && varY > 0 ? (cov * cov) / (varX * varY) : 0;
  const minMove = hLeft > 144 ? 0.32 : hLeft > 72 ? 0.25 : 0.18;

  const latestPositions = positionSnapshots.at(-1);
  const top = Array.isArray(latestPositions?.top) ? latestPositions.top : [];
  const topNet = top.reduce((sum, row) => {
    const value = Number(row?.[1]);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

  console.log(
    `FALLBACK_SCAN move=${move.toFixed(2)} abs=${absMove.toFixed(2)} min=${minMove.toFixed(2)} r2=${r2.toFixed(2)} topNet=${Number.isFinite(topNet) ? topNet.toFixed(2) : "na"} gap=${gap.toFixed(2)} hLeft=${hLeft.toFixed(1)}`
  );

  if (absMove < minMove || r2 < 0.35) return rawDecision;

  const direction = Math.sign(move);
  if (!direction) return rawDecision;
  if (!Number.isFinite(topNet) || Math.abs(topNet) < 8) return rawDecision;
  if (Math.sign(topNet) !== direction) return rawDecision;

  const qty = hLeft > 144 ? 10 : hLeft > 72 ? 16 : 24;
  const side = direction > 0 ? "buy" : "sell";
  console.log(
    `FALLBACK_SIGNAL side=${side} move=${move.toFixed(2)} r2=${r2.toFixed(2)} topNet=${topNet.toFixed(2)} gap=${gap.toFixed(2)} hLeft=${hLeft.toFixed(1)}`
  );
  return {
    action: "enter",
    side,
    qty,
    confidence: 0.90,
    reason: "race_trend_consensus_fallback"
  };
}

function canonicalTerms(terms) {
  return JSON.stringify({
    id: String(terms.id),
    maker: String(terms.maker),
    px: String(terms.px),
    qty: String(terms.qty),
    side: String(terms.side),
    taker: terms.taker === "any" ? "any" : String(terms.taker),
    until: Number(terms.until)
  });
}
function makeOffer(side, qty, latest, prefix) {
  if (!["buy", "sell"].includes(side)) throw new Error("invalid side");
  if (!Number.isFinite(qty) || qty < 0.1 || qty > 60) throw new Error("invalid qty");
  const id = `${prefix}-${latest.n}-${Date.now().toString(36).slice(-7)}`;
  const until = Number(latest.n) + 3;
  const terms = {
    id,
    maker: did,
    px: Number(latest.px).toFixed(2),
    qty: Number(qty).toFixed(2),
    side,
    taker: "any",
    until
  };
  const maker_sig = signPayload(`${SEASON}|terms|${canonicalTerms(terms)}`);
  return {
    id,
    until,
    terms,
    text: JSON.stringify({ t: "trade", season: SEASON, terms, taker: "any", maker_sig })
  };
}
function validAcceptance(body) {
  try {
    if (!body?.taker_sig || !body?.taker || body.taker === "any" || !body?.terms) return false;
    const payload = `${SEASON}|accept|${canonicalTerms(body.terms)}|${body.taker}`;
    return nodeVerify(
      null,
      Buffer.from(payload, "utf8"),
      publicKeyFromDid(body.taker),
      Buffer.from(String(body.taker_sig), "base64url")
    );
  } catch {
    return false;
  }
}

function validMakerOffer(body) {
  try {
    const terms = body?.terms;
    if (body?.t !== "trade" || body?.season !== SEASON || !terms || !body?.maker_sig) return false;
    if (!terms?.maker || terms.maker === did) return false;
    const payload = `${SEASON}|terms|${canonicalTerms(terms)}`;
    return nodeVerify(
      null,
      Buffer.from(payload, "utf8"),
      publicKeyFromDid(terms.maker),
      Buffer.from(String(body.maker_sig), "base64url")
    );
  } catch {
    return false;
  }
}

async function findReliableOpposingOffer(decision, latest) {
  const desiredSide = String(decision?.side || "");
  const desiredQty = Number(decision?.qty);
  if (!["buy", "sell"].includes(desiredSide) || !Number.isFinite(desiredQty)) return null;

  const [roomMsgs, flowMsgs] = await Promise.all([
    readExport(ROOM),
    readRoom("d-close1-flow", 200)
  ]);

  const settledIds = new Set();
  const voidById = new Map();
  for (const msg of flowMsgs) {
    const b = parseBody(msg);
    if (b?.t !== "flow") continue;
    for (const id of Array.isArray(b.settled) ? b.settled : []) settledIds.add(String(id));
    for (const v of Array.isArray(b.void) ? b.void : []) {
      if (Array.isArray(v) && v.length >= 2) voidById.set(String(v[0]), String(v[1]));
    }
  }

  const tradeById = new Map();
  const acceptedIds = new Set();
  for (const msg of roomMsgs) {
    const b = parseBody(msg);
    const id = b?.terms?.id;
    if (b?.t !== "trade" || !id) continue;
    if (!tradeById.has(String(id)) || !b?.taker_sig) tradeById.set(String(id), b);
    if (b?.taker_sig && validAcceptance(b)) acceptedIds.add(String(id));
  }

  const makerSettled = new Map();
  const makerFundsVoid = new Map();
  for (const [id, b] of tradeById.entries()) {
    const maker = String(b?.terms?.maker || "");
    if (!maker) continue;
    if (settledIds.has(id)) makerSettled.set(maker, (makerSettled.get(maker) || 0) + 1);
    if (voidById.get(id) === "funds") makerFundsVoid.set(maker, (makerFundsVoid.get(maker) || 0) + 1);
  }

  const oppositeMakerSide = desiredSide === "buy" ? "sell" : "buy";
  const minQty = Math.max(0.1, desiredQty * 0.35);
  const maxQty = Math.min(60, desiredQty * 1.35);
  const refPx = Number(latest.px);
  const candidates = [];
  const seenIds = new Set();

  for (let i = roomMsgs.length - 1; i >= 0; i--) {
    const b = parseBody(roomMsgs[i]);
    const terms = b?.terms;
    const id = String(terms?.id || "");
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);

    if (!validMakerOffer(b) || b?.taker_sig) continue;
    if (settledIds.has(id) || voidById.has(id) || acceptedIds.has(id)) continue;
    if (String(terms.side) !== oppositeMakerSide) continue;
    if (!(terms.taker === "any" || terms.taker === did)) continue;
    if (Number(terms.until) < Number(latest.n)) continue;

    const qty = Number(terms.qty);
    const px = Number(terms.px);
    if (!Number.isFinite(qty) || qty < minQty || qty > maxQty) continue;
    if (!Number.isFinite(px) || !Number.isFinite(refPx) || refPx <= 0) continue;
    if (Math.abs(px - refPx) / refPx > 0.045) continue;

    const maker = String(terms.maker);
    const settledCount = makerSettled.get(maker) || 0;
    const fundsFails = makerFundsVoid.get(maker) || 0;
    if (settledCount < 1) continue;

    const reliability = settledCount - 1.5 * fundsFails;
    const sizeFit = -Math.abs(qty - desiredQty) / Math.max(1, desiredQty);
    const priceFit = -Math.abs(px - refPx) / refPx;
    const recency = Number(roomMsgs[i]?.seq || 0);
    candidates.push({ b, qty, px, maker, score: reliability * 10 + sizeFit * 3 + priceFit + recency * 1e-9 });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] || null;
}

async function takeReliableOffer(match, decision, latest, priorState = {}) {
  const terms = match.b.terms;
  const side = String(decision.side);
  const qty = Number(terms.qty);
  const px = Number(terms.px);
  const taker_sig = signPayload(`${SEASON}|accept|${canonicalTerms(terms)}|${did}`);
  const text = JSON.stringify({
    t: "trade",
    season: SEASON,
    terms,
    taker: did,
    maker_sig: match.b.maker_sig,
    taker_sig
  });

  const preflight = {
    state: "entry_preflight",
    id: String(terms.id),
    side,
    qty,
    entryPx: px,
    until: Number(terms.until),
    entrySweep: Number(latest.n),
    realizedScoreEst: Number(priorState.realizedScoreEst || 0),
    liquidityRole: "taker",
    maker: String(terms.maker)
  };
  await setState(preflight);
  const posted = await signedPost(ROOM, text);
  await setState({
    ...preflight,
    state: "entry_accepted",
    postedSeq: posted.seq,
    acceptedSeq: posted.seq,
    acceptedAtSweep: Number(latest.n),
    taker: did
  });
  console.log(
    `ENTRY_TAKE side=${side} qty=${qty.toFixed(2)} px=${px.toFixed(2)} maker=${String(terms.maker).slice(0, 24)} seq=${posted.seq || "?"}`
  );
}

async function findAcceptance(id) {
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
      b.taker !== "any" &&
      validAcceptance(b)
    ) {
      return {
        seq: Number(msgs[i]?.seq || 0) || null,
        taker: String(b.taker),
        body: b
      };
    }
  }
  return null;
}
async function findOutcome(id) {
  const msgs = await readRoom("d-close1-flow", 200);
  for (let i = msgs.length - 1; i >= 0; i--) {
    const b = parseBody(msgs[i]);
    if (b?.t !== "flow") continue;
    if (Array.isArray(b.settled) && b.settled.includes(id)) {
      return { outcome: "settled", n: Number(b.n) };
    }
    if (Array.isArray(b.void)) {
      const hit = b.void.find((v) => Array.isArray(v) && v[0] === id);
      if (hit) return { outcome: "void", reason: String(hit[1]), n: Number(b.n) };
    }
  }
  return null;
}

async function postEntry(decision, latest, priorState = {}) {
  if (execute) {
    const match = await findReliableOpposingOffer(decision, latest);
    if (match) {
      await takeReliableOffer(match, decision, latest, priorState);
      return;
    }
  }

  const offer = makeOffer(decision.side, Number(decision.qty), latest, "rd4e");
  if (!execute) {
    console.log(`DRY_ENTRY side=${decision.side} qty=${Number(decision.qty).toFixed(2)}`);
    return;
  }
  const preflight = {
    state: "entry_preflight",
    id: offer.id,
    side: decision.side,
    qty: Number(decision.qty),
    entryPx: Number(latest.px),
    until: offer.until,
    entrySweep: Number(latest.n),
    realizedScoreEst: Number(priorState.realizedScoreEst || 0)
  };
  await setState(preflight);
  const posted = await signedPost(ROOM, offer.text);
  await setState({ ...preflight, state: "entry_offer", postedSeq: posted.seq });
  console.log(`ENTRY_OFFER side=${decision.side} qty=${Number(decision.qty).toFixed(2)} seq=${posted.seq || "?"}`);
}
async function postExit(openState, latest) {
  const side = openState.side === "buy" ? "sell" : "buy";
  const offer = makeOffer(side, Number(openState.qty), latest, "rd4x");
  if (!execute) {
    console.log(`DRY_EXIT side=${side} qty=${Number(openState.qty).toFixed(2)}`);
    return;
  }
  const preflight = {
    state: "exit_preflight",
    id: offer.id,
    exitSide: side,
    qty: Number(openState.qty),
    entrySide: openState.side,
    entryPx: Number(openState.entryPx),
    entrySweep: Number(openState.entrySweep),
    entryId: openState.entryId || null,
    until: offer.until,
    requestedAtSweep: Number(latest.n),
    realizedScoreEst: Number(openState.realizedScoreEst || 0),
    entryFeeEst: Number(openState.entryFeeEst || (0.01 * Number(openState.qty) * Number(openState.entryPx)))
  };
  await setState(preflight);
  const posted = await signedPost(ROOM, offer.text);
  await setState({ ...preflight, state: "exit_offer", postedSeq: posted.seq });
  console.log(`EXIT_OFFER side=${side} qty=${Number(openState.qty).toFixed(2)} seq=${posted.seq || "?"}`);
}

const now = Date.now();
if (now >= LOCK_MS) {
  console.log("LOCKED");
  process.exit(0);
}

const series = await priceSeries();
const distinct = distinctRefs(series);
const pnl = await pnlSnapshots();
const positions = await positionSnapshots();
const latest = series.at(-1);
if (!latest) throw new Error("No referee price available");

let state = await getState();
if (stateSelftest) {
  const token = "state-selftest-" + Date.now().toString(36);
  await setState({ state: "selftest", token }, true);
  const observed = await getState();
  if (observed?.state !== "selftest" || observed?.token !== token) {
    throw new Error("STATE_MAILBOX_SELFTEST_MISMATCH");
  }
  await setState({ state: "idle", selftestOkAt: new Date().toISOString() }, true);
  console.log("STATE_MAILBOX_SELFTEST_OK");
  process.exit(0);
}
const ownPos = currentOwnPosition(positions);
let race = raceContext({ now, pnlSnapshots: pnl, state, latest });
console.log(
  `STATUS execute=${execute} n=${latest.n} ref=${latest.px} state=${state.state} ownTopPos=${ownPos ?? "na"} leader=${race.leaderScore ?? "na"} ownEst=${race.ownScoreEst.toFixed(2)} gap=${race.leaderGap ?? "na"} hLeft=${race.hoursRemaining.toFixed(1)}`
);

if (state.state === "entry_preflight") {
  const seen = await findAcceptance(state.id);
  if (seen) {
    await setState({
      ...state,
      state: "entry_accepted",
      acceptedSeq: seen.seq,
      acceptedAtSweep: Number(latest.n),
      taker: seen.taker
    });
    console.log("ENTRY_PREFLIGHT_RECOVERED_ACCEPTED");
    process.exit(0);
  }
  const roomMessages = await readExport(ROOM);
  const posted = roomMessages.find((m) => {
    const b = parseBody(m);
    return b?.t === "trade" && b?.season === SEASON &&
      b?.terms?.id === state.id && b?.terms?.maker === did;
  });
  if (posted) {
    await setState({ ...state, state: "entry_offer", postedSeq: Number(posted?.seq || 0) || null });
    console.log("ENTRY_PREFLIGHT_RECOVERED_OFFER");
    process.exit(0);
  }
  if (Number(latest.n) > Number(state.entrySweep || 0) + 1) {
    await setState({ state: "idle", cooldownUntilSweep: Number(latest.n) + 1, lastPreflight: state.id });
    console.log("ENTRY_PREFLIGHT_CLEARED");
    process.exit(0);
  }
  console.log("ENTRY_PREFLIGHT_WAIT");
  process.exit(0);
}

if (state.state === "exit_preflight") {
  const seen = await findAcceptance(state.id);
  if (seen) {
    await setState({
      ...state,
      state: "exit_accepted",
      acceptedSeq: seen.seq,
      acceptedAtSweep: Number(latest.n),
      taker: seen.taker
    });
    console.log("EXIT_PREFLIGHT_RECOVERED_ACCEPTED");
    process.exit(0);
  }
  const roomMessages = await readExport(ROOM);
  const posted = roomMessages.find((m) => {
    const b = parseBody(m);
    return b?.t === "trade" && b?.season === SEASON &&
      b?.terms?.id === state.id && b?.terms?.maker === did;
  });
  if (posted) {
    await setState({ ...state, state: "exit_offer", postedSeq: Number(posted?.seq || 0) || null });
    console.log("EXIT_PREFLIGHT_RECOVERED_OFFER");
    process.exit(0);
  }
  if (Number(latest.n) > Number(state.requestedAtSweep || 0) + 1) {
    const open = {
      state: "open",
      side: state.entrySide,
      qty: Number(state.qty),
      entryPx: Number(state.entryPx),
      entrySweep: Number(state.entrySweep),
      entryId: state.entryId || null,
      lastPreflight: state.id,
      realizedScoreEst: Number(state.realizedScoreEst || 0),
      entryFeeEst: Number(state.entryFeeEst || (0.01 * Number(state.qty) * Number(state.entryPx)))
    };
    await setState(open);
    console.log("EXIT_PREFLIGHT_CLEARED");
    process.exit(0);
  }
  console.log("EXIT_PREFLIGHT_WAIT");
  process.exit(0);
}

if (state.state === "entry_offer") {
  const accepted = await findAcceptance(state.id);
  if (accepted) {
    const next = {
      ...state,
      state: "entry_accepted",
      acceptedSeq: accepted.seq,
      acceptedAtSweep: Number(latest.n),
      taker: accepted.taker
    };
    await setState(next);
    console.log("ENTRY_ACCEPTED");
    process.exit(0);
  }
  if (Number(latest.n) <= Number(state.until || 0)) {
    console.log("ENTRY_OFFER_LIVE");
    process.exit(0);
  }
  await setState({
    state: "idle",
    cooldownUntilSweep: Number(latest.n) + 1,
    lastExpiredId: state.id
  });
  console.log("ENTRY_EXPIRED");
  process.exit(0);
}

if (state.state === "entry_accepted") {
  const outcome = await findOutcome(state.id);
  const expectedSign = state.side === "buy" ? 1 : -1;
  const topEvidence =
    Number.isFinite(ownPos) &&
    Math.sign(ownPos) === expectedSign &&
    Math.abs(ownPos) >= Math.max(0.1, Number(state.qty) * 0.75);

  if (outcome?.outcome === "void") {
    await setState({
      state: "idle",
      cooldownUntilSweep: Number(latest.n) + 1,
      lastVoid: outcome.reason,
      lastVoidId: state.id
    });
    console.log(`ENTRY_VOID reason=${outcome.reason} n=${outcome.n ?? "na"} id=${state.id}`);
    process.exit(0);
  }
  if (outcome?.outcome === "settled" || topEvidence) {
    const open = {
      state: "open",
      side: state.side,
      qty: Number(state.qty),
      entryPx: Number(state.entryPx),
      entrySweep: outcome?.n || Number(state.acceptedAtSweep || latest.n),
      entryId: state.id,
      realizedScoreEst: Number(state.realizedScoreEst || 0),
      entryFeeEst: Number(state.entryFeeEst || (0.01 * Number(state.qty) * Number(state.entryPx)))
    };
    await setState(open);
    console.log("POSITION_OPEN");
    state = open;
  } else if (Number(latest.n) >= Number(state.acceptedAtSweep || latest.n) + 4) {
    await setState({ ...state, state: "entry_unverified", checkedThroughSweep: Number(latest.n) });
    throw new Error("ENTRY_OUTCOME_UNVERIFIED");
  } else {
    console.log("ENTRY_PENDING_SWEEP");
    process.exit(0);
  }
}

if (state.state === "entry_unverified") {
  const outcome = await findOutcome(state.id);
  if (outcome?.outcome === "settled") {
    const open = {
      state: "open",
      side: state.side,
      qty: Number(state.qty),
      entryPx: Number(state.entryPx),
      entrySweep: Number(outcome.n),
      entryId: state.id,
      realizedScoreEst: Number(state.realizedScoreEst || 0),
      entryFeeEst: Number(state.entryFeeEst || (0.01 * Number(state.qty) * Number(state.entryPx)))
    };
    await setState(open);
    console.log("ENTRY_UNVERIFIED_RECOVERED_SETTLED");
    state = open;
  } else if (outcome?.outcome === "void") {
    await setState({
      state: "idle",
      cooldownUntilSweep: Number(latest.n) + 1,
      lastVoid: outcome.reason,
      lastVoidId: state.id
    });
    console.log(`ENTRY_UNVERIFIED_RECOVERED_VOID reason=${outcome.reason} n=${outcome.n ?? "na"} id=${state.id}`);
    process.exit(0);
  } else if (Number(latest.n) > Number(state.until || 0) + 2) {
    await setState({
      state: "idle",
      cooldownUntilSweep: Number(latest.n) + 1,
      lastIgnoredId: state.id
    });
    console.log("ENTRY_UNVERIFIED_CLEARED_NO_FLOW_OUTCOME");
    process.exit(0);
  } else {
    console.log("ENTRY_UNVERIFIED_WAIT");
    process.exit(0);
  }
}

if (state.state === "exit_offer") {
  const accepted = await findAcceptance(state.id);
  if (accepted) {
    const next = {
      ...state,
      state: "exit_accepted",
      acceptedSeq: accepted.seq,
      acceptedAtSweep: Number(latest.n),
      taker: accepted.taker
    };
    await setState(next);
    console.log("EXIT_ACCEPTED");
    process.exit(0);
  }
  if (Number(latest.n) <= Number(state.until || 0)) {
    console.log("EXIT_OFFER_LIVE");
    process.exit(0);
  }
  const open = {
    state: "open",
    side: state.entrySide,
    qty: Number(state.qty),
    entryPx: Number(state.entryPx),
    entrySweep: Number(state.entrySweep),
    entryId: state.entryId || null,
    exitRetryAfterSweep: Number(latest.n),
    realizedScoreEst: Number(state.realizedScoreEst || 0),
    entryFeeEst: Number(state.entryFeeEst || (0.01 * Number(state.qty) * Number(state.entryPx)))
  };
  await setState(open);
  console.log("EXIT_EXPIRED_REEVALUATE");
  state = open;
}

if (state.state === "exit_accepted") {
  const outcome = await findOutcome(state.id);
  const expectedStillOpenSign = state.entrySide === "buy" ? 1 : -1;
  const topStillOpen =
    Number.isFinite(ownPos) &&
    Math.sign(ownPos) === expectedStillOpenSign &&
    Math.abs(ownPos) >= Math.max(0.1, Number(state.qty) * 0.5);

  if (outcome?.outcome === "void") {
    const open = {
      state: "open",
      side: state.entrySide,
      qty: Number(state.qty),
      entryPx: Number(state.entryPx),
      entrySweep: Number(state.entrySweep),
      entryId: state.entryId || null,
      lastExitVoid: outcome.reason,
      realizedScoreEst: Number(state.realizedScoreEst || 0),
      entryFeeEst: Number(state.entryFeeEst || (0.01 * Number(state.qty) * Number(state.entryPx)))
    };
    await setState(open);
    console.log(`EXIT_VOID_REEVALUATE reason=${outcome.reason} n=${outcome.n ?? "na"} id=${state.id}`);
    state = open;
  } else if (outcome?.outcome === "settled" || (!topStillOpen && Number(latest.n) >= Number(state.acceptedAtSweep || latest.n) + 1)) {
    const direction = state.entrySide === "buy" ? 1 : -1;
    const gross = direction * Number(state.qty) * (Number(latest.px) - Number(state.entryPx));
    const fees = Number(state.entryFeeEst || (0.01 * Number(state.qty) * Number(state.entryPx))) +
      (0.01 * Number(state.qty) * Number(latest.px));
    await setState({
      state: "idle",
      cooldownUntilSweep: Number(latest.n) + 2,
      lastClosedId: state.id,
      realizedScoreEst: Number(state.realizedScoreEst || 0) + gross - fees
    });
    console.log("POSITION_CLOSED");
    process.exit(0);
  } else if (Number(latest.n) >= Number(state.acceptedAtSweep || latest.n) + 4) {
    await setState({ ...state, state: "exit_unverified", checkedThroughSweep: Number(latest.n) });
    throw new Error("EXIT_OUTCOME_UNVERIFIED");
  } else {
    console.log("EXIT_PENDING_SWEEP");
    process.exit(0);
  }
}

if (state.state === "exit_unverified") {
  throw new Error("EXIT_OUTCOME_UNVERIFIED");
}

if (state.state === "open") {
  const decision = decide({
    now,
    mode: "manage",
    series,
    distinct,
    pnlSnapshots: pnl,
    positionSnapshots: positions,
    state,
    latest,
    race
  });
  if (decision?.action === "exit") {
    await postExit(state, latest);
  } else {
    console.log("HOLD");
  }
  process.exit(0);
}

if (state.state !== "idle") {
  throw new Error(`Unknown state ${state.state}`);
}
if (Number(state.cooldownUntilSweep || 0) > Number(latest.n)) {
  console.log("COOLDOWN");
  process.exit(0);
}

race = raceContext({ now, pnlSnapshots: pnl, state, latest });
const rawDecision = decide({
  now,
  mode: "entry",
  series,
  distinct,
  pnlSnapshots: pnl,
  positionSnapshots: positions,
  state,
  latest,
  race
});
const entryDecision = controlledFallbackEntry(
  rawDecision,
  race,
  distinct,
  positions,
  latest
);
const decision = applyRaceSizing(entryDecision, race, latest.px);
if (decision?.action === "enter") {
  console.log(
    `RACE_SIZE leaderGap=${decision.race?.leaderGap ?? "na"} hLeft=${decision.race?.hoursRemaining ?? "na"} mult=${decision.race?.multiplier ?? "na"} qty=${Number(decision.qty).toFixed(2)}`
  );
  await postEntry(decision, latest, state);
} else {
  console.log("NO_TRADE");
}
