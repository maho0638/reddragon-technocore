import {
  createPrivateKey, createPublicKey, sign as nodeSign, verify as nodeVerify, createHash,
  diffieHellman, hkdfSync, createDecipheriv, createCipheriv, randomBytes
} from "node:crypto";
import { readFile } from "node:fs/promises";

const BASE = "https://technocore.chat";
const ARCHIVE_BASE = "https://challenges.technocore.chat/close-1";
const ARCHIVE_SCAN_SWEEPS = 8;
const ROOM = "close1";
const STATE_PATH = "runtime/close1-state.enc";
const STATE_MARKER = "REDDRAGON_CLOSE1_STATE_V5:";
const SEASON = "close-1";
const OPEN_MS = Date.parse("2026-09-25T12:00:00Z");
const LOCK_MS = Date.parse("2026-10-04T09:00:00Z");
const UNCERTAIN_RELEASE_SWEEPS = 1;
const UNCERTAIN_MAX_ABS_QTY = 43;
const CONFIRMED_SHADOW_EXIT_MIN_NET = 10;
const CONFIRMED_SHADOW_HARD_TAKE_NET = 20;
const FINAL_DEFENSIVE_HOURS = 36;
const FINAL_NO_NEW_ENTRY_HOURS = 12;
const CORE_RANGE_LOW = 221;
const CORE_RANGE_HIGH = 233;
const RANGE_BREAK_LOW = 220.5;
const RANGE_BREAK_HIGH = 234.5;
const MAJOR_CATALYSTS = [
  { name: "PCE_GDP", at: Date.parse("2026-09-30T12:30:00Z"), preMin: 90, postMin: 45 },
  { name: "MICRON_EARNINGS", at: Date.parse("2026-09-30T20:30:00Z"), preMin: 90, postMin: 180 },
  { name: "FED_WALLER", at: Date.parse("2026-10-01T14:00:00Z"), preMin: 30, postMin: 45 },
  { name: "FED_JEFFERSON", at: Date.parse("2026-10-01T17:30:00Z"), preMin: 30, postMin: 45 },
  { name: "FED_BOWMAN", at: Date.parse("2026-10-01T19:00:00Z"), preMin: 30, postMin: 45 },
  { name: "FED_COOK", at: Date.parse("2026-10-01T19:30:00Z"), preMin: 30, postMin: 45 },
  { name: "US_JOBS", at: Date.parse("2026-10-02T12:30:00Z"), preMin: 90, postMin: 60 }
];
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

let archiveIndexCache = null;
let archiveIndexFetchedAt = 0;
const archiveRecordCache = new Map();

async function close1ArchiveIndex() {
  const nowMs = Date.now();
  if (archiveIndexCache && nowMs - archiveIndexFetchedAt < 15_000) return archiveIndexCache;
  const { r, text } = await request(
    `${ARCHIVE_BASE}/index.json`,
    { headers: { accept: "application/json", "cache-control": "no-cache" } },
    2
  );
  if (!r.ok) return null;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (parsed?.contest !== SEASON || !Array.isArray(parsed?.sweeps)) return null;

  const byN = new Map();
  let maxN = 0;
  for (const row of parsed.sweeps) {
    const n = Number(row?.n);
    const path = String(row?.path || "");
    const file = String(row?.file || "");
    const status = String(row?.status || "");
    if (
      !Number.isInteger(n) || n < 1 ||
      !/^(?:sweeps|redacted)\/[0-9a-f]{64}\.json$/.test(path) ||
      !/^[0-9a-f]{64}$/.test(file) ||
      !["full", "redacted"].includes(status)
    ) continue;
    byN.set(n, row);
    maxN = Math.max(maxN, n);
  }
  archiveIndexCache = { byN, maxN };
  archiveIndexFetchedAt = nowMs;
  return archiveIndexCache;
}

async function close1ArchiveRecord(meta) {
  const n = Number(meta?.n);
  const path = String(meta?.path || "");
  if (!/^(?:sweeps|redacted)\/[0-9a-f]{64}\.json$/.test(path)) return null;
  const expected =
    meta.status === "full" ? String(meta.file || "") : String(meta.sha256 || "");
  if (!/^[0-9a-f]{64}$/.test(expected)) return null;
  const cacheKey = `${n}:${path}:${expected}`;
  if (archiveRecordCache.has(cacheKey)) return archiveRecordCache.get(cacheKey);

  const { r, text } = await request(
    `${ARCHIVE_BASE}/${path}`,
    { headers: { accept: "application/json", "cache-control": "no-cache" } },
    2
  );
  if (!r.ok || text.length > 12_000_000) return null;

  const actual = createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
  if (actual !== expected) {
    console.log(`ARCHIVE_HASH_MISMATCH n=${n} expected=${expected} actual=${actual}`);
    return null;
  }

  let record;
  try {
    record = JSON.parse(text);
  } catch {
    return null;
  }
  if (Number(record?.input?.n) !== n || Number(record?.output?.sweep) !== n) return null;
  archiveRecordCache.set(cacheKey, record);
  return record;
}

function archiveTradeBelongsToUs(input, ourDid = did) {
  if (!input || !ourDid) return false;
  return String(input.maker || "") === String(ourDid) ||
    String(input.countersigner || "") === String(ourDid);
}

function archiveFeeForUs(match, ourDid = did) {
  const input = match?.input;
  const output = match?.output;
  if (!input || !output || output.outcome !== "settled") return null;
  let fee = 0;
  let found = false;
  if (String(input.maker || "") === String(ourDid)) {
    const v = Number(output.maker_fee);
    if (Number.isFinite(v)) { fee += v; found = true; }
  }
  if (String(input.countersigner || "") === String(ourDid)) {
    const v = Number(output.taker_fee);
    if (Number.isFinite(v)) { fee += v; found = true; }
  }
  return found ? fee : null;
}

function classifyArchiveMatches(matches, coveredThrough) {
  if (!Array.isArray(matches) || !matches.length) return null;
  const settled = matches.find((x) =>
    x?.output?.outcome === "settled" ||
    (x?.output?.outcome === "void" && x?.output?.reason === "settled")
  );
  if (settled) {
    return {
      outcome: "settled",
      n: Number(settled.n),
      px: Number.isFinite(Number(settled?.input?.px)) ? Number(settled.input.px) : null,
      qty: Number.isFinite(Number(settled?.input?.qty)) ? Number(settled.input.qty) : null,
      fee: archiveFeeForUs(settled),
      inferredFrom: "official_archive"
    };
  }

  const voids = matches.filter((x) => x?.output?.outcome === "void");
  if (!voids.length) return null;
  const maxUntil = Math.max(
    ...voids
      .map((x) => Number(x?.input?.until))
      .filter(Number.isFinite),
    0
  );
  if (maxUntil > 0 && Number(coveredThrough) < maxUntil + 1) return null;

  const reasons = [...new Set(voids.map((x) => String(x?.output?.reason || "void")))];
  return {
    outcome: "void",
    reason: reasons.join("/") || "void",
    n: Number(voids.at(-1)?.n),
    inferredFrom: "official_archive"
  };
}

async function findArchiveOutcome(id, fromSweep = 0) {
  const start = Number(fromSweep);
  if (!id || !Number.isFinite(start) || start <= 0) return null;

  const index = await close1ArchiveIndex();
  if (!index || index.maxN < start + 1) return null;
  const end = Math.min(index.maxN, start + ARCHIVE_SCAN_SWEEPS);
  const matches = [];

  for (let n = start; n <= end; n++) {
    const meta = index.byN.get(n);
    if (!meta) continue;
    const record = await close1ArchiveRecord(meta);
    if (!record) continue;
    const inputTrades = Array.isArray(record?.input?.trades) ? record.input.trades : [];
    const outputTrades = Array.isArray(record?.output?.trades) ? record.output.trades : [];
    const count = Math.max(inputTrades.length, outputTrades.length);
    for (let i = 0; i < count; i++) {
      const input = inputTrades[i];
      const output = outputTrades[i];
      const tradeId = String(input?.id || output?.id || "");
      if (tradeId !== id) continue;
      if (!archiveTradeBelongsToUs(input)) continue;
      matches.push({ n, input, output });
    }
  }

  const result = classifyArchiveMatches(matches, end);
  if (result) {
    console.log(
      `ARCHIVE_OUTCOME id=${id} outcome=${result.outcome} reason=${result.reason || "na"} n=${result.n ?? "na"}`
    );
  }
  return result;
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

function visiblePositionAt(posSnapshots, key, sweep) {
  if (!key || !Number.isFinite(Number(sweep))) return null;
  for (let i = posSnapshots.length - 1; i >= 0; i--) {
    const snap = posSnapshots[i];
    if (Number(snap.n) > Number(sweep)) continue;
    const hit = Array.isArray(snap.top) ? snap.top.find(([k]) => k === key) : null;
    if (hit) return { n: Number(snap.n), pos: Number(hit[1]) };
    if (Number(snap.n) === Number(sweep)) return null;
  }
  return null;
}

function peerSettlementEvidence(posSnapshots, state, latestSweep) {
  const peer = String(state?.taker || "");
  const acceptedAt = Number(state?.acceptedAtSweep || 0);
  const qty = Number(state?.qty);
  if (!peer || !acceptedAt || !Number.isFinite(qty) || qty <= 0) return null;
  if (Number(latestSweep) <= acceptedAt) return null;

  const before = visiblePositionAt(posSnapshots, peer, acceptedAt);
  const after = visiblePositionAt(posSnapshots, peer, Number(latestSweep));
  if (!before || !after) return null;

  // Maker side is RedDragon's side; the taker receives the opposite delta.
  const expectedDelta = state.side === "sell" ? qty : -qty;
  const observedDelta = Number(after.pos) - Number(before.pos);
  const tolerance = Math.max(0.02, qty * 0.002);
  return {
    peer,
    before,
    after,
    expectedDelta,
    observedDelta,
    settled: Math.abs(observedDelta - expectedDelta) <= tolerance
  };
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

function uncertainEntries(state) {
  return Array.isArray(state?.uncertainEntries)
    ? state.uncertainEntries.filter((x) =>
        x && ["buy", "sell"].includes(String(x.side)) &&
        Number.isFinite(Number(x.qty)) && Number(x.qty) > 0)
    : [];
}

function uncertaintyEnvelope(state) {
  let lo = 0;
  let hi = 0;
  for (const x of uncertainEntries(state)) {
    const delta = (x.side === "buy" ? 1 : -1) * Number(x.qty);
    lo += Math.min(0, delta);
    hi += Math.max(0, delta);
  }
  return { lo, hi, worst: Math.max(Math.abs(lo), Math.abs(hi)) };
}

function confirmedShadowCloseNet(entry, mark) {
  const qty = Number(entry?.qty);
  const entryPx = Number(entry?.entryPx);
  const current = Number(mark);
  if (
    entry?.confirmedOutcome !== "settled" ||
    !["buy", "sell"].includes(String(entry?.side)) ||
    !Number.isFinite(qty) || qty <= 0 ||
    !Number.isFinite(entryPx) || entryPx <= 0 ||
    !Number.isFinite(current) || current <= 0
  ) return null;
  const direction = entry.side === "buy" ? 1 : -1;
  const gross = direction * qty * (current - entryPx);
  const entryFee = Number.isFinite(Number(entry?.entryFeeEst))
    ? Number(entry.entryFeeEst)
    : 0.01 * qty * entryPx;
  const exitFee = 0.01 * qty * current;
  return gross - entryFee - exitFee;
}

function removeUncertainEntry(state, id) {
  return uncertainEntries(state).filter((x) => String(x.id || "") !== String(id || ""));
}

function uncertainConfirmedMark(state, latestMark) {
  const mark = Number(latestMark);
  if (!Number.isFinite(mark)) return 0;
  let score = 0;
  for (const x of uncertainEntries(state)) {
    if (x.confirmedOutcome !== "settled") continue;
    const qty = Number(x.qty);
    const entry = Number(x.entryPx);
    if (!Number.isFinite(entry)) continue;
    const direction = x.side === "buy" ? 1 : -1;
    const entryFee = Number.isFinite(Number(x.entryFeeEst)) ? Number(x.entryFeeEst) : (0.01 * qty * entry);
    score += direction * qty * (mark - entry) - entryFee;
  }
  return score;
}

function uncertainDownsideFloor(state, latestMark) {
  const mark = Number(latestMark);
  if (!Number.isFinite(mark)) return 0;
  let floor = 0;
  for (const x of uncertainEntries(state)) {
    const qty = Number(x.qty);
    const entry = Number(x.entryPx);
    if (!Number.isFinite(entry)) continue;
    const direction = x.side === "buy" ? 1 : -1;
    const entryFee = Number.isFinite(Number(x.entryFeeEst)) ? Number(x.entryFeeEst) : (0.01 * qty * entry);
    const settledEstimate = direction * qty * (mark - entry) - entryFee;
    floor += x.confirmedOutcome === "settled" ? settledEstimate : Math.min(0, settledEstimate);
  }
  return floor;
}

function applyUncertainRiskCap(decision, state, latestPx) {
  if (!decision || decision.action !== "enter") return decision;
  if (!uncertainEntries(state).length) return decision;

  const px = Number(latestPx);
  const realizedCapital = Math.max(1000, 10000 + Number(state?.realizedScoreEst || 0));
  const cashCap = Number.isFinite(px) && px > 0
    ? Math.max(0.1, realizedCapital / (px * 1.035))
    : UNCERTAIN_MAX_ABS_QTY;
  const cap = Math.min(UNCERTAIN_MAX_ABS_QTY, cashCap);
  const env = uncertaintyEnvelope(state);
  const side = String(decision.side);
  const capacity = side === "buy" ? cap - env.hi : side === "sell" ? cap + env.lo : 0;
  const requested = Number(decision.qty);
  const qty = Math.min(requested, capacity);
  if (!Number.isFinite(qty) || qty < 0.1) {
    console.log(`UNCERTAIN_RISK_BLOCK side=${side} lo=${env.lo.toFixed(2)} hi=${env.hi.toFixed(2)} cap=${cap.toFixed(2)}`);
    return null;
  }
  const clipped = Math.floor(qty * 100) / 100;
  if (clipped < requested) {
    console.log(`UNCERTAIN_RISK_CAP side=${side} requested=${requested.toFixed(2)} allowed=${clipped.toFixed(2)} lo=${env.lo.toFixed(2)} hi=${env.hi.toFixed(2)} cap=${cap.toFixed(2)}`);
  }
  return { ...decision, qty: clipped };
}

function ownScoreEstimate(state, latestMark) {
  const realized = Number(state?.realizedScoreEst || 0);
  const confirmedShadow = uncertainConfirmedMark(state, latestMark);
  if (state?.state !== "open" || !Number.isFinite(Number(state.qty)) || !Number.isFinite(Number(state.entryPx))) {
    return realized + confirmedShadow;
  }
  const qty = Number(state.qty);
  const entry = Number(state.entryPx);
  const mark = Number(latestMark);
  if (!Number.isFinite(mark)) return realized + confirmedShadow;
  const direction = state.side === "buy" ? 1 : -1;
  const gross = direction * qty * (mark - entry);
  const entryFeeEst = Number(state.entryFeeEst || (0.01 * qty * entry));
  return realized + confirmedShadow + gross - entryFeeEst;
}

function raceContext({ now, pnlSnapshots, state, latest }) {
  const leader = leaderScore(pnlSnapshots);
  const own = ownScoreEstimate(state, latest?.px);
  const downsideFloor =
    own + uncertainDownsideFloor(state, latest?.px) - uncertainConfirmedMark(state, latest?.px);
  const remainingMs = Math.max(0, LOCK_MS - now);
  const totalMs = LOCK_MS - OPEN_MS;
  const timeRemainingFrac = clamp(remainingMs / totalMs, 0, 1);
  const elapsedFrac = 1 - timeRemainingFrac;
  const gap = Number.isFinite(leader) ? leader - own : null;
  const realizedCapital = Math.max(1000, 10000 + Number(state?.realizedScoreEst || 0));
  return {
    leaderScore: leader,
    realizedCapital,
    ownScoreEst: own,
    ownDownsideFloor: downsideFloor,
    leaderGap: gap,
    timeRemainingFrac,
    elapsedFrac,
    hoursRemaining: remainingMs / 3600000
  };
}

// The encrypted strategy decides whether a setup is good enough to trade.
// This overlay only sizes an already-approved entry for the race objective:
// preserve optionality early, scale conviction when behind late, and protect a lead.

function catalystContext(nowMs = Date.now()) {
  let active = null;
  let next = null;
  for (const event of MAJOR_CATALYSTS) {
    const deltaMin = (nowMs - event.at) / 60000;
    if (deltaMin >= -event.preMin && deltaMin < 0) {
      active = { ...event, phase: "pre", deltaMin };
      break;
    }
    if (deltaMin >= 0 && deltaMin <= event.postMin) {
      active = { ...event, phase: "post", deltaMin };
      break;
    }
    if (event.at > nowMs && (!next || event.at < next.at)) next = event;
  }
  return {
    active,
    next,
    blockNewEntries: active?.phase === "pre",
    requireVeryStrong: active?.phase === "post"
  };
}

function multiTimeframeTrend(signal) {
  const frames = [
    ["move5", 0.12, 1],
    ["move15", 0.25, 2],
    ["move30", 0.40, 3],
    ["move60", 0.65, 4],
    ["move240", 1.20, 5]
  ];
  let score = 0;
  let weight = 0;
  const votes = {};
  for (const [key, threshold, w] of frames) {
    const value = Number(signal?.[key]);
    if (!Number.isFinite(value)) continue;
    const vote = Math.abs(value) >= threshold ? Math.sign(value) : 0;
    votes[key] = vote;
    score += vote * w;
    weight += w;
  }
  const ratio = weight > 0 ? score / weight : 0;
  const m30 = Number(signal?.move30);
  const m60 = Number(signal?.move60);
  const m240 = Number(signal?.move240);
  const strongUp = ratio >= 0.55 && (!Number.isFinite(m30) || m30 > 0) && (!Number.isFinite(m60) || m60 > 0);
  const strongDown = ratio <= -0.55 && (!Number.isFinite(m30) || m30 < 0) && (!Number.isFinite(m60) || m60 < 0);
  const veryStrongUp = ratio >= 0.72 && (!Number.isFinite(m60) || m60 > 0) && (!Number.isFinite(m240) || m240 > 0);
  const veryStrongDown = ratio <= -0.72 && (!Number.isFinite(m60) || m60 < 0) && (!Number.isFinite(m240) || m240 < 0);
  return {
    score,
    weight,
    ratio,
    votes,
    strongUp,
    strongDown,
    veryStrongUp,
    veryStrongDown,
    label: veryStrongUp ? "very_up" : strongUp ? "up" : veryStrongDown ? "very_down" : strongDown ? "down" : "mixed"
  };
}

function directionalShape(signal) {
  const m5 = Number(signal?.move5);
  const m15 = Number(signal?.move15);
  const m30 = Number(signal?.move30);
  const m60 = Number(signal?.move60);
  const m240 = Number(signal?.move240);
  const finiteFast = Number.isFinite(m5) && Number.isFinite(m15);
  const fastUp = finiteFast && m5 >= 0.12 && m15 >= 0.35;
  const fastDown = finiteFast && m5 <= -0.12 && m15 <= -0.35;
  const midUp = Number.isFinite(m30) && Number.isFinite(m60) && m30 >= 0.55 && m60 >= 0.35;
  const midDown = Number.isFinite(m30) && Number.isFinite(m60) && m30 <= -0.55 && m60 <= -0.35;
  const continuationUp = fastUp && (midUp || (Number.isFinite(m30) && m30 >= 0.35 && (!Number.isFinite(m60) || m60 >= -0.25)));
  const continuationDown = fastDown && (midDown || (Number.isFinite(m30) && m30 <= -0.35 && (!Number.isFinite(m60) || m60 <= 0.25)));
  const earlyTurnUp = fastUp && (!Number.isFinite(m30) || m30 >= -0.25) && (!Number.isFinite(m60) || m60 >= -0.80);
  const earlyTurnDown = fastDown && (!Number.isFinite(m30) || m30 <= 0.25) && (!Number.isFinite(m60) || m60 <= 0.80);
  const slowUp = Number.isFinite(m240) && m240 >= 0.80;
  const slowDown = Number.isFinite(m240) && m240 <= -0.80;
  return {
    m5, m15, m30, m60, m240,
    fastUp, fastDown, midUp, midDown,
    continuationUp, continuationDown,
    earlyTurnUp, earlyTurnDown,
    slowUp, slowDown
  };
}

function directionalFeeRoom(side, px) {
  const p = Number(px);
  if (!Number.isFinite(p) || p <= 0 || !["buy", "sell"].includes(String(side))) return false;
  const target = side === "buy"
    ? (p <= RANGE_BREAK_HIGH ? 234.5 : 242)
    : (p >= RANGE_BREAK_LOW ? 220.5 : 212.5);
  return Math.abs(target - p) >= 0.02 * p + 0.55;
}

function activeContestEntry(signal, latest, race, catalyst) {
  if (!signal?.fresh || catalyst?.blockNewEntries) return null;
  const hours = Number(race?.hoursRemaining);
  if (!Number.isFinite(hours) || hours <= FINAL_NO_NEW_ENTRY_HOURS) return null;
  const px = Number(latest?.px);
  const gap = Number(race?.leaderGap);
  if (!Number.isFinite(px) || px <= 0) return null;

  const m5 = Number(signal.move5);
  const m15 = Number(signal.move15);
  const m30 = Number(signal.move30);
  const m60 = Number(signal.move60);
  if (![m5, m15].every(Number.isFinite)) return null;

  const up = m5 >= 0.08 && m15 >= 0.20;
  const down = m5 <= -0.08 && m15 <= -0.20;
  if (!up && !down) return null;

  const notOpposed = up
    ? (!Number.isFinite(m30) || m30 >= -0.25) && (!Number.isFinite(m60) || m60 >= -0.50)
    : (!Number.isFinite(m30) || m30 <= 0.25) && (!Number.isFinite(m60) || m60 <= 0.50);
  if (!notOpposed) return null;

  const supported = up
    ? (!Number.isFinite(m30) || m30 >= 0.15) && (!Number.isFinite(m60) || m60 >= -0.10)
    : (!Number.isFinite(m30) || m30 <= -0.15) && (!Number.isFinite(m60) || m60 <= 0.10);

  const side = up ? "buy" : "sell";
  if (!directionalFeeRoom(side, px)) return null;

  const highPressure = Number.isFinite(gap) && gap >= 750;
  const qty = highPressure ? (supported ? 40 : 34) : (supported ? 30 : 24);
  const confidence = highPressure ? 0.97 : supported ? 0.96 : 0.94;
  return {
    action: "enter",
    side,
    qty,
    confidence,
    reason: supported ? "active_direction_supported" : "active_direction_early"
  };
}

function aggressiveDirectionalEntry(signal, latest, race, catalyst) {
  if (!signal?.fresh) return null;
  if (catalyst?.blockNewEntries) return null;
  const hours = Number(race?.hoursRemaining);
  if (!Number.isFinite(hours) || hours <= FINAL_NO_NEW_ENTRY_HOURS) return null;
  const px = Number(latest?.px);
  const gap = Number(race?.leaderGap);
  if (!Number.isFinite(px) || px <= 0) return null;

  const s = directionalShape(signal);
  const roundTripFeeMove = 0.02 * px;
  const viable = (target) => Math.abs(Number(target) - px) >= roundTripFeeMove + 0.55;
  const highPressure = Number.isFinite(gap) && gap >= 750;
  const qtyStrong = highPressure ? 38 : Number.isFinite(gap) && gap >= 350 ? 30 : 22;
  const qtyTurn = highPressure ? 30 : 20;

  // After a major event, require continuation rather than a one-bar reversal.
  if (catalyst?.requireVeryStrong && !(s.continuationUp || s.continuationDown)) return null;

  // Upper/lower band reversals: enter on the fast turn before 4h has fully flipped.
  if (px >= 230.5 && px <= 234.5 && s.earlyTurnDown && viable(223.5)) {
    return {
      action: "enter", side: "sell", qty: s.continuationDown ? qtyStrong : qtyTurn,
      confidence: s.continuationDown ? 0.98 : 0.96,
      reason: s.continuationDown ? "aggr_upper_continuation_short" : "aggr_upper_turn_short"
    };
  }
  if (px >= 219 && px <= 223.5 && s.earlyTurnUp && viable(230.5)) {
    return {
      action: "enter", side: "buy", qty: s.continuationUp ? qtyStrong : qtyTurn,
      confidence: s.continuationUp ? 0.98 : 0.96,
      reason: s.continuationUp ? "aggr_lower_continuation_long" : "aggr_lower_turn_long"
    };
  }

  // Middle of the range: only trade a continuation with enough room to clear both fees.
  if (px > 223.5 && px < 231.5 && s.continuationUp && viable(234.5)) {
    return { action: "enter", side: "buy", qty: qtyStrong, confidence: 0.97, reason: "aggr_mid_momentum_long" };
  }
  if (px > 223.5 && px < 231.5 && s.continuationDown && viable(220.5)) {
    return { action: "enter", side: "sell", qty: qtyStrong, confidence: 0.97, reason: "aggr_mid_momentum_short" };
  }

  // Breakouts: 4h may still lag; 5/15 trigger plus 30/60 continuation is enough.
  if (px > RANGE_BREAK_HIGH && px <= 239.5 && s.continuationUp && viable(242)) {
    return { action: "enter", side: "buy", qty: highPressure ? 40 : 30, confidence: 0.98, reason: "aggr_breakout_long" };
  }
  if (px < RANGE_BREAK_LOW && px >= 213 && s.continuationDown && viable(212.5)) {
    return { action: "enter", side: "sell", qty: highPressure ? 40 : 30, confidence: 0.98, reason: "aggr_breakdown_short" };
  }
  return null;
}

function openPositionCloseNet(openState, mark) {
  const qty = Number(openState?.qty);
  const entry = Number(openState?.entryPx);
  const current = Number(mark);
  if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(entry) || !Number.isFinite(current)) return null;
  const direction = openState.side === "buy" ? 1 : -1;
  const gross = direction * qty * (current - entry);
  const entryFee = Number(openState.entryFeeEst || (0.01 * qty * entry));
  const exitFee = 0.01 * qty * current;
  return gross - entryFee - exitFee;
}

function profitThresholds(qty, entryPx, markPx) {
  const q = Number(qty);
  const entry = Number(entryPx);
  const mark = Number(markPx);
  if (![q, entry, mark].every(Number.isFinite) || q <= 0 || entry <= 0 || mark <= 0) {
    return { bank: 25, protect: 12 };
  }
  const avgNotional = q * ((entry + mark) / 2);
  // Net PnL already subtracts the estimated 1% entry + 1% exit fees.
  // Keep extra room for clawback / execution mismatch instead of banking dust.
  const bank = Math.max(20, 0.0030 * avgNotional);
  const protect = Math.max(10, 0.0015 * avgNotional);
  return { bank, protect };
}

function tacticalExitDecision(openState, signal, latest, race, catalyst) {
  const net = openPositionCloseNet(openState, latest?.px);
  if (!Number.isFinite(net)) return null;
  const trend = multiTimeframeTrend(signal);
  const shape = directionalShape(signal);
  const px = Number(latest?.px);
  const entryPx = Number(openState?.entryPx);
  const short = openState.side === "sell";
  const direction = short ? -1 : 1;
  const favorableMove = Number.isFinite(entryPx) ? direction * (px - entryPx) : 0;
  const fastAdverse = short ? shape.fastUp : shape.fastDown;
  const continuationAdverse = short ? shape.continuationUp : shape.continuationDown;
  const favorableContinuation = short ? shape.continuationDown : shape.continuationUp;

  const profit = profitThresholds(openState.qty, openState.entryPx, px);
  // Bank only meaningful fee-adjusted profit. If momentum fades after reaching
  // a smaller but still worthwhile cushion, protect it instead of gambling it back.
  if (net >= profit.bank) return { exit: true, reason: "bank_meaningful_profit", net, trend, profit };
  if (
    net >= profit.protect &&
    (fastAdverse || !favorableContinuation || catalyst?.active?.phase === "pre")
  ) {
    return { exit: true, reason: "protect_meaningful_profit", net, trend, profit };
  }

  // Cut a wrong directional thesis by price movement, not by fee-distorted net PnL.
  if (favorableMove <= -0.80 && fastAdverse && continuationAdverse) {
    return { exit: true, reason: "fast_directional_stop", net, trend };
  }
  if (favorableMove <= -1.50 && continuationAdverse) {
    return { exit: true, reason: "directional_stop", net, trend };
  }
  if (short && px >= RANGE_BREAK_HIGH && fastAdverse) return { exit: true, reason: "short_breakout_stop", net, trend };
  if (!short && px <= RANGE_BREAK_LOW && fastAdverse) return { exit: true, reason: "long_breakdown_stop", net, trend };
  return { exit: false, reason: "hold", net, trend };
}

function confirmedShadowExitDecision(entry, signal, latest, race, catalyst) {
  const net = confirmedShadowCloseNet(entry, latest?.px);
  if (!Number.isFinite(net)) return null;
  const trend = multiTimeframeTrend(signal);
  const px = Number(latest?.px);
  const short = entry.side === "sell";
  const favorableStrong = short ? trend.strongDown : trend.strongUp;
  const adverseStrong = short ? trend.strongUp : trend.strongDown;
  const shape = directionalShape(signal);
  const direction = short ? -1 : 1;
  const favorableMove = direction * (px - Number(entry.entryPx));
  const fastAdverse = short ? shape.fastUp : shape.fastDown;
  const continuationAdverse = short ? shape.continuationUp : shape.continuationDown;
  const profit = profitThresholds(entry.qty, entry.entryPx, px);
  if (favorableMove <= -0.80 && fastAdverse && continuationAdverse) {
    return { exit: true, reason: "shadow_fast_directional_stop", net, trend };
  }
  if (favorableMove <= -1.50 && continuationAdverse) {
    return { exit: true, reason: "shadow_directional_stop", net, trend };
  }
  if (net <= -120 && !favorableStrong) {
    return { exit: true, reason: "shadow_capital_release_stop", net, trend };
  }
  if (net >= profit.bank) {
    return { exit: true, reason: "shadow_bank_meaningful_profit", net, trend, profit };
  }
  if (net >= profit.protect && !favorableStrong) {
    return { exit: true, reason: "shadow_protect_meaningful_profit", net, trend, profit };
  }
  if (catalyst?.active?.phase === "pre" && net >= 0) {
    return { exit: true, reason: "shadow_event_protect", net, trend };
  }
  if (Number(race?.hoursRemaining) <= FINAL_NO_NEW_ENTRY_HOURS && net >= 0) {
    return { exit: true, reason: "shadow_final_protect", net, trend };
  }
  if (short && px <= 223 && adverseStrong) return { exit: true, reason: "shadow_lower_band_reversal", net, trend };
  if (short && px >= RANGE_BREAK_HIGH && adverseStrong) return { exit: true, reason: "shadow_breakout_stop", net, trend };
  if (!short && px >= 231 && adverseStrong) return { exit: true, reason: "shadow_upper_band_reversal", net, trend };
  if (!short && px <= RANGE_BREAK_LOW && adverseStrong) return { exit: true, reason: "shadow_breakdown_stop", net, trend };
  return { exit: false, reason: "shadow_hold", net, trend };
}

function tacticalRangeEntry(signal, latest, race, catalyst) {
  if (!signal?.fresh) return null;
  if (catalyst?.blockNewEntries) return null;
  const hours = Number(race?.hoursRemaining);
  if (Number.isFinite(hours) && hours <= FINAL_NO_NEW_ENTRY_HOURS) return null;
  const trend = multiTimeframeTrend(signal);
  if (catalyst?.requireVeryStrong && !(trend.veryStrongUp || trend.veryStrongDown)) return null;
  if (Number.isFinite(hours) && hours <= FINAL_DEFENSIVE_HOURS && !(trend.veryStrongUp || trend.veryStrongDown)) return null;

  const px = Number(latest?.px);
  if (!Number.isFinite(px) || px <= 0) return null;
  const roundTripFeeMove = 0.02 * px;
  const viable = (target) => Math.abs(Number(target) - px) >= roundTripFeeMove + 0.75;

  if (px >= 231.5 && px <= 234.5 && trend.strongDown && viable(223)) {
    return { action: "enter", side: "sell", qty: trend.veryStrongDown ? 20 : 12, confidence: trend.veryStrongDown ? 0.97 : 0.94, reason: "upper_band_reversal" };
  }
  if (px >= 219 && px <= 222.5 && trend.strongUp && viable(230)) {
    return { action: "enter", side: "buy", qty: trend.veryStrongUp ? 20 : 12, confidence: trend.veryStrongUp ? 0.97 : 0.94, reason: "lower_band_reversal" };
  }
  if (px > RANGE_BREAK_HIGH && px <= 239 && trend.veryStrongUp && viable(241)) {
    return { action: "enter", side: "buy", qty: 18, confidence: 0.97, reason: "range_breakout_up" };
  }
  if (px < RANGE_BREAK_LOW && px >= 213.5 && trend.veryStrongDown && viable(214)) {
    return { action: "enter", side: "sell", qty: 18, confidence: 0.97, reason: "range_breakdown_down" };
  }
  return null;
}

function applyCalendarRiskGate(decision, signal, race, catalyst) {
  if (!decision || decision.action !== "enter") return decision;
  const trend = multiTimeframeTrend(signal);
  if (catalyst?.blockNewEntries) {
    console.log(`CATALYST_ENTRY_BLOCK name=${catalyst.active?.name || "unknown"} phase=pre`);
    return null;
  }
  const shape = directionalShape(signal);
  if (catalyst?.requireVeryStrong && !(shape.continuationUp || shape.continuationDown)) {
    console.log(`CATALYST_POST_WAIT name=${catalyst.active?.name || "unknown"} trend=${trend.label} ratio=${trend.ratio.toFixed(2)}`);
    return null;
  }
  if (Number(race?.hoursRemaining) <= FINAL_NO_NEW_ENTRY_HOURS) {
    console.log(`FINAL_ENTRY_BLOCK hLeft=${Number(race.hoursRemaining).toFixed(1)}`);
    return null;
  }
  if (Number(race?.hoursRemaining) <= FINAL_DEFENSIVE_HOURS && !(shape.continuationUp || shape.continuationDown)) {
    console.log(`FINAL_STRONG_ONLY hLeft=${Number(race.hoursRemaining).toFixed(1)} trend=${trend.label}`);
    return null;
  }
  return decision;
}

async function fetchRealNvdaSignal(nowMs = Date.now()) {
  try {
    const { r, text } = await request(
      "https://query1.finance.yahoo.com/v8/finance/chart/NVDA?interval=5m&range=5d&includePrePost=true",
      {
        headers: {
          accept: "application/json",
          "cache-control": "no-cache",
          "user-agent": "Mozilla/5.0 close1-reddragon"
        }
      },
      2
    );
    if (!r.ok) return { fresh: false, reason: "http_" + r.status };

    const parsed = JSON.parse(text);
    const q = parsed?.chart?.result?.[0];
    const ts = Array.isArray(q?.timestamp) ? q.timestamp : [];
    const closes = Array.isArray(q?.indicators?.quote?.[0]?.close)
      ? q.indicators.quote[0].close
      : [];
    const pts = [];
    for (let i = 0; i < Math.min(ts.length, closes.length); i++) {
      const t = Number(ts[i]);
      const px = Number(closes[i]);
      if (Number.isFinite(t) && Number.isFinite(px) && px > 0) pts.push({ t, px });
    }
    if (pts.length < 2) return { fresh: false, reason: "no_points" };

    const last = pts.at(-1);
    const ageSec = Math.floor(nowMs / 1000) - last.t;
    const atMinutesAgo = (minutes) => {
      const target = last.t - minutes * 60;
      for (let i = pts.length - 1; i >= 0; i--) {
        if (pts[i].t <= target) return pts[i].px;
      }
      return null;
    };
    const p5 = atMinutesAgo(5);
    const p15 = atMinutesAgo(15);
    const p30 = atMinutesAgo(30);
    const p60 = atMinutesAgo(60);
    const p240 = atMinutesAgo(240);
    const move = (p) => Number.isFinite(p) ? last.px - p : null;
    const signal = {
      fresh: ageSec >= -30 && ageSec <= 600,
      px: last.px,
      ageSec,
      move5: move(p5),
      move15: move(p15),
      move30: move(p30),
      move60: move(p60),
      move240: move(p240),
      previousClose: Number(q?.meta?.previousClose),
      regularMarketPrice: Number(q?.meta?.regularMarketPrice)
    };
    console.log(
      `REAL_NVDA fresh=${signal.fresh} px=${signal.px.toFixed(2)} age_s=${signal.ageSec} m5=${Number.isFinite(signal.move5) ? signal.move5.toFixed(2) : "na"} m15=${Number.isFinite(signal.move15) ? signal.move15.toFixed(2) : "na"} m30=${Number.isFinite(signal.move30) ? signal.move30.toFixed(2) : "na"} m60=${Number.isFinite(signal.move60) ? signal.move60.toFixed(2) : "na"} m240=${Number.isFinite(signal.move240) ? signal.move240.toFixed(2) : "na"}`
    );
    return signal;
  } catch (error) {
    console.log(`REAL_NVDA_UNAVAILABLE error=${String(error).slice(0,180)}`);
    return { fresh: false, reason: "fetch_error" };
  }
}

function applyRealNvdaSignal(decision, signal, race, distinct, latest) {
  if (!signal?.fresh) return decision;

  const m15 = Number(signal.move15);
  const m30 = Number(signal.move30);
  const trend = multiTimeframeTrend(signal);
  if (!Number.isFinite(m15) || !Number.isFinite(m30)) return decision;
  if (!(trend.strongUp || trend.strongDown)) return decision;

  const d30 = trend.strongUp ? 1 : -1;

  const refs = Array.isArray(distinct) ? distinct : [];
  const lookback = refs.length >= 4 ? Number(refs.at(-4)?.px) : null;
  const xyzMove15 =
    Number.isFinite(lookback) && Number.isFinite(Number(latest?.px))
      ? Number(latest.px) - lookback
      : 0;
  const xyzDirection = Math.sign(xyzMove15);
  const alignedOrLagging =
    xyzDirection === 0 ||
    xyzDirection === d30 ||
    Math.abs(xyzMove15) <= 0.25;

  const side = trend.strongUp ? "buy" : "sell";
  const gap = Number(race?.leaderGap);

  if (decision?.action === "enter") {
    if (String(decision.side) === side) {
      const boostedQty = Number.isFinite(Number(decision.qty))
        ? Number(decision.qty) * (trend.veryStrongUp || trend.veryStrongDown ? 1.35 : 1.15)
        : decision.qty;
      console.log(
        `REAL_NVDA_CONFIRM side=${side} trend=${trend.label} ratio=${trend.ratio.toFixed(2)} m15=${m15.toFixed(2)} m30=${m30.toFixed(2)} xyz15=${xyzMove15.toFixed(2)}`
      );
      return {
        ...decision,
        qty: boostedQty,
        confidence: Math.max(trend.veryStrongUp || trend.veryStrongDown ? 0.97 : 0.94, Number(decision.confidence) || 0),
        reason: String(decision.reason || "entry") + "+real_nvda"
      };
    }

    const confidence = Number(decision.confidence);
    if (!Number.isFinite(confidence) || confidence < 0.95) {
      console.log(
        `REAL_NVDA_VETO decision=${decision.side} real=${side} trend=${trend.label} ratio=${trend.ratio.toFixed(2)} m15=${m15.toFixed(2)} m30=${m30.toFixed(2)}`
      );
      return null;
    }
    return decision;
  }

  if (!Number.isFinite(gap) || gap < 175 || !alignedOrLagging) return decision;
  if (!directionalFeeRoom(side, Number(latest?.px))) {
    console.log(`REAL_NVDA_FEE_ROOM_BLOCK side=${side} px=${Number(latest?.px).toFixed(2)}`);
    return decision;
  }

  const veryStrong = trend.veryStrongUp || trend.veryStrongDown;
  const qty = veryStrong && gap >= 750 ? 40 : veryStrong && gap >= 300 ? 32 : gap >= 300 ? 22 : 16;
  const confidence = veryStrong && gap >= 750 ? 0.97 : veryStrong ? 0.96 : 0.93;
  console.log(
    `REAL_NVDA_SCOUT side=${side} qty=${qty.toFixed(2)} trend=${trend.label} ratio=${trend.ratio.toFixed(2)} m15=${m15.toFixed(2)} m30=${m30.toFixed(2)} xyz15=${xyzMove15.toFixed(2)} gap=${gap.toFixed(2)}`
  );
  return {
    action: "enter",
    side,
    qty,
    confidence,
    reason: "real_nvda_lead_confirmation"
  };
}

function applyRaceSizing(decision, race, latestPx) {
  if (!decision || decision.action !== "enter") return decision;
  let qty = Number(decision.qty);
  if (!Number.isFinite(qty) || qty < 0.1) return null;

  const px = Number(latestPx);
  const capital = Math.max(1000, Number(race?.realizedCapital || 10000));
  const cashAffordable = Number.isFinite(px) && px > 0
    ? Math.max(0.1, Math.min(60, (capital / (px * 1.035))))
    : Math.max(0.1, capital / (230 * 1.035));
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

  // The venue charges 1% of notional on entry. A large position in a slow-moving
  // single-stock contest can lose tens of POLF before direction matters. Bound the
  // fee paid per new position; loosen only for exceptional conviction / late catch-up.
  let maxEntryFee = 25;
  if (Number.isFinite(gap) && gap <= 0) maxEntryFee = 15;
  if (confidence >= 0.95 && Number.isFinite(gap) && gap >= 250) maxEntryFee = Math.max(maxEntryFee, 45);
  if (
    confidence >= 0.95 &&
    Number.isFinite(gap) && gap >= 750 &&
    Number(race?.hoursRemaining) <= 144
  ) {
    maxEntryFee = Math.max(maxEntryFee, 100);
  }
  if (
    confidence >= 0.97 &&
    Number.isFinite(gap) && gap >= 1000 &&
    Number(race?.hoursRemaining) <= 72
  ) {
    maxEntryFee = Math.max(maxEntryFee, 105);
  }
  if (t < 0.25 && Number.isFinite(gap) && gap >= 200) maxEntryFee = Math.max(maxEntryFee, 45);
  const feeQtyCap =
    Number.isFinite(px) && px > 0
      ? Math.max(0.1, maxEntryFee / (0.01 * px))
      : cashAffordable;
  const maxAffordable = Math.min(cashAffordable, feeQtyCap);

  const requestedAfterRace = qty * multiplier;
  qty = clamp(requestedAfterRace, 0.1, maxAffordable);
  if (qty + 0.005 < requestedAfterRace) {
    console.log(
      `FEE_SIZE_CAP requested=${requestedAfterRace.toFixed(2)} allowed=${qty.toFixed(2)} maxEntryFee=${maxEntryFee.toFixed(2)} px=${Number.isFinite(px) ? px.toFixed(2) : "na"}`
    );
  }
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
  const feeProbe = archiveFeeForUs({
    input: { maker: did, countersigner: "did:key:z6MkOther" },
    output: { outcome: "settled", maker_fee: "2.50", taker_fee: "3.50" }
  }, did);
  const takerFeeProbe = archiveFeeForUs({
    input: { maker: "did:key:z6MkOther", countersigner: did },
    output: { outcome: "settled", maker_fee: "2.50", taker_fee: "3.50" }
  }, did);
  const closeProbe = realizedCloseDelta(
    { entrySide: "buy", qty: 10, entryPx: 220, entryFeeEst: 22, exitPx: 225 },
    { outcome: "settled", px: 224, fee: 24 },
    230
  );
  if (!(Math.abs(feeProbe - 2.5) < 1e-9 && Math.abs(takerFeeProbe - 3.5) < 1e-9)) throw new Error("RACE_SELFTEST_ARCHIVE_SIDE_FEE");
  if (!(closeProbe && Math.abs(closeProbe.exitPx - 224) < 1e-9 && Math.abs(closeProbe.delta - (-6)) < 1e-9)) throw new Error("RACE_SELFTEST_REALIZED_USES_TRADE_PX");
  if (!archiveTradeBelongsToUs({ maker: did, countersigner: "did:key:z6MkOther" }, did)) throw new Error("RACE_SELFTEST_ARCHIVE_MAKER_OWNERSHIP");
  if (!archiveTradeBelongsToUs({ maker: "did:key:z6MkOther", countersigner: did }, did)) throw new Error("RACE_SELFTEST_ARCHIVE_TAKER_OWNERSHIP");
  if (archiveTradeBelongsToUs({ maker: "did:key:z6MkOther", countersigner: "did:key:z6MkThird" }, did)) throw new Error("RACE_SELFTEST_ARCHIVE_FOREIGN_MATCH");
  const ttlProbe = makeOffer("buy", 1, { n: 100, px: 225 }, "test");
  if (ttlProbe.until !== 101) throw new Error("RACE_SELFTEST_FAST_REPRICE_TTL");
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
  if (!(behindLate?.qty >= 19.99)) throw new Error("RACE_SELFTEST_BEHIND_NOT_AGGRESSIVE");
  if (!(ahead?.qty < 20)) throw new Error("RACE_SELFTEST_AHEAD_NOT_DEFENSIVE");
  const feeCapped = applyRaceSizing(
    { action: "enter", side: "sell", qty: 40, confidence: 0.90 },
    { leaderGap: 180, timeRemainingFrac: 0.60, hoursRemaining: 120 },
    225
  );
  if (!(feeCapped?.qty <= 11.12)) throw new Error("RACE_SELFTEST_ENTRY_FEE_CAP");
  const highConvictionCatchUp = applyRaceSizing(
    { action: "enter", side: "buy", qty: 24, confidence: 0.97 },
    { leaderGap: 1200, timeRemainingFrac: 0.56, hoursRemaining: 120, realizedCapital: 10000 },
    230
  );
  if (!(highConvictionCatchUp?.qty >= 30 && highConvictionCatchUp?.qty <= 34.79)) {
    throw new Error("RACE_SELFTEST_HIGH_CONVICTION_CATCHUP_SIZE");
  }
  const compoundedCatchUp = applyRaceSizing(
    { action: "enter", side: "buy", qty: 50, confidence: 0.99 },
    { leaderGap: 1200, timeRemainingFrac: 0.30, hoursRemaining: 60, realizedCapital: 11200 },
    230
  );
  if (!(compoundedCatchUp?.qty > highConvictionCatchUp.qty)) {
    throw new Error("RACE_SELFTEST_COMPOUND_CAPITAL_NOT_USED");
  }
  const uncertain = { state: "idle", uncertainEntries: [{ id: "u1", side: "sell", qty: 31.53, entryPx: 224.26 }] };
  const cappedSame = applyUncertainRiskCap({ action: "enter", side: "sell", qty: 30, confidence: 0.9 }, uncertain, 224.5);
  const allowedOpposite = applyUncertainRiskCap({ action: "enter", side: "buy", qty: 30, confidence: 0.9 }, uncertain, 224.5);
  const env = uncertaintyEnvelope(uncertain);
  if (!(cappedSame?.qty > 0.1 && cappedSame.qty < 12)) throw new Error("RACE_SELFTEST_UNCERTAIN_SAME_SIDE_CAP");
  if (!(allowedOpposite?.qty === 30)) throw new Error("RACE_SELFTEST_UNCERTAIN_OPPOSITE_BLOCKED");
  if (!(env.lo === -31.53 && env.hi === 0)) throw new Error("RACE_SELFTEST_UNCERTAIN_ENVELOPE");
  const confirmedShadow = { id: "legacy-short", side: "sell", qty: 31.53, entryPx: 224.26, confirmedOutcome: "settled" };
  const shadowProfitNet = confirmedShadowCloseNet(confirmedShadow, 219.30);
  const shadowLossNet = confirmedShadowCloseNet(confirmedShadow, 230.00);
  if (!(shadowProfitNet >= CONFIRMED_SHADOW_EXIT_MIN_NET)) throw new Error("RACE_SELFTEST_SHADOW_PROFIT_EXIT");
  if (!(shadowLossNet < CONFIRMED_SHADOW_EXIT_MIN_NET)) throw new Error("RACE_SELFTEST_SHADOW_LOSS_HOLD");
  const shadowRemoved = removeUncertainEntry({ uncertainEntries: [confirmedShadow, { id: "keep", side: "buy", qty: 1, entryPx: 220 }] }, "legacy-short");
  if (!(shadowRemoved.length === 1 && shadowRemoved[0].id === "keep")) throw new Error("RACE_SELFTEST_SHADOW_REMOVE");
  const strongDownSignal = { fresh: true, move5: -0.30, move15: -0.60, move30: -1.00, move60: -1.60, move240: -3.20 };
  const strongUpSignal = { fresh: true, move5: 0.30, move15: 0.60, move30: 1.00, move60: 1.60, move240: 3.20 };
  const downTrend = multiTimeframeTrend(strongDownSignal);
  const upTrend = multiTimeframeTrend(strongUpSignal);
  if (!(downTrend.veryStrongDown && upTrend.veryStrongUp)) throw new Error("RACE_SELFTEST_MTF_DIRECTION");
  if (!directionalFeeRoom("sell", 227.5)) throw new Error("RACE_SELFTEST_FEE_ROOM_VALID");
  if (directionalFeeRoom("sell", 222.0)) throw new Error("RACE_SELFTEST_FEE_ROOM_BLOCK_NEAR_TARGET");
  const activeLong = activeContestEntry(
    { fresh: true, move5: 0.10, move15: 0.24, move30: 0.18, move60: 0.00, move240: -0.60 },
    { px: 231.0 },
    { leaderGap: 1200, hoursRemaining: 100 },
    { blockNewEntries: false }
  );
  const activeBlocked = activeContestEntry(
    { fresh: true, move5: 0.10, move15: 0.24, move30: -0.60, move60: -0.80, move240: -1.20 },
    { px: 231.0 },
    { leaderGap: 1200, hoursRemaining: 100 },
    { blockNewEntries: false }
  );
  if (!(activeLong?.side === "buy" && activeLong.qty >= 34 && activeLong.confidence >= 0.97)) {
    throw new Error("RACE_SELFTEST_ACTIVE_CONTEST_ENTRY");
  }
  if (activeBlocked !== null) throw new Error("RACE_SELFTEST_ACTIVE_OPPOSITION_BLOCK");
  const earlyUpSignal = { fresh: true, move5: 0.22, move15: 0.48, move30: 0.62, move60: 0.20, move240: -1.40 };
  const earlyDownSignal = { fresh: true, move5: -0.22, move15: -0.48, move30: -0.62, move60: -0.20, move240: 1.40 };
  const earlyLong = aggressiveDirectionalEntry(earlyUpSignal, { px: 226.0 }, { leaderGap: 1200, hoursRemaining: 100 }, { blockNewEntries: false, requireVeryStrong: false });
  const earlyShort = aggressiveDirectionalEntry(earlyDownSignal, { px: 230.8 }, { leaderGap: 1200, hoursRemaining: 100 }, { blockNewEntries: false, requireVeryStrong: false });
  if (!(earlyLong?.side === "buy" && earlyLong.qty >= 38)) throw new Error("RACE_SELFTEST_EARLY_LONG");
  if (!(earlyShort?.side === "sell" && earlyShort.qty >= 30)) throw new Error("RACE_SELFTEST_EARLY_SHORT");
  const profitLock = tacticalExitDecision(
    { state: "open", side: "buy", qty: 30, entryPx: 220, entryFeeEst: 66 },
    { fresh: true, move5: -0.25, move15: -0.45, move30: 0.10, move60: 0.40, move240: 1.20 },
    { px: 225.2 },
    { hoursRemaining: 100 },
    { active: null }
  );
  if (!(profitLock?.exit === true && ["bank_meaningful_profit","protect_meaningful_profit"].includes(profitLock.reason))) {
    throw new Error("RACE_SELFTEST_FAST_PROFIT_LOCK");
  }
  const meaningfulProfit = tacticalExitDecision(
    { state: "open", side: "buy", qty: 30, entryPx: 220, entryFeeEst: 66 },
    { fresh: true, move5: 0.25, move15: 0.55, move30: 0.80, move60: 0.60, move240: 1.10 },
    { px: 225.7 },
    { hoursRemaining: 100 },
    { active: null }
  );
  if (!(meaningfulProfit?.exit === true && meaningfulProfit.reason === "bank_meaningful_profit")) {
    throw new Error("RACE_SELFTEST_BANK_MEANINGFUL_PROFIT");
  }
  const feeDust = tacticalExitDecision(
    { state: "open", side: "buy", qty: 30, entryPx: 220, entryFeeEst: 66 },
    { fresh: true, move5: 0.20, move15: 0.40, move30: 0.50, move60: 0.40, move240: 1.10 },
    { px: 224.55 },
    { hoursRemaining: 100 },
    { active: null }
  );
  if (feeDust?.exit === true) {
    throw new Error("RACE_SELFTEST_DONT_BANK_FEE_DUST");
  }
  const protectMeaningful = tacticalExitDecision(
    { state: "open", side: "buy", qty: 30, entryPx: 220, entryFeeEst: 66 },
    { fresh: true, move5: -0.25, move15: -0.45, move30: 0.05, move60: 0.30, move240: 1.10 },
    { px: 224.85 },
    { hoursRemaining: 100 },
    { active: null }
  );
  if (!(protectMeaningful?.exit === true && protectMeaningful.reason === "protect_meaningful_profit")) {
    throw new Error("RACE_SELFTEST_PROTECT_MEANINGFUL_PROFIT");
  }
  const fastStop = tacticalExitDecision(
    { state: "open", side: "buy", qty: 30, entryPx: 230, entryFeeEst: 69 },
    { fresh: true, move5: -0.30, move15: -0.55, move30: -0.80, move60: -0.60, move240: 0.50 },
    { px: 229.0 },
    { hoursRemaining: 100 },
    { active: null }
  );
  if (!(fastStop?.exit === true && fastStop.reason === "fast_directional_stop")) throw new Error("RACE_SELFTEST_FAST_DIRECTIONAL_STOP");
  const scaleWinner = scaleInDecision(
    { state: "open", side: "buy", qty: 24, entryPx: 225, addCount: 0, uncertainEntries: [] },
    { fresh: true, move5: 0.25, move15: 0.55, move30: 0.80, move60: 0.60, move240: -0.40 },
    { px: 226.2, n: 1000 },
    { leaderGap: 1200, hoursRemaining: 100 },
    { blockNewEntries: false }
  );
  const noAverageDown = scaleInDecision(
    { state: "open", side: "buy", qty: 24, entryPx: 225, addCount: 0, uncertainEntries: [] },
    { fresh: true, move5: 0.25, move15: 0.55, move30: 0.80, move60: 0.60, move240: -0.40 },
    { px: 224.2, n: 1000 },
    { leaderGap: 1200, hoursRemaining: 100 },
    { blockNewEntries: false }
  );
  if (!(scaleWinner?.side === "buy" && scaleWinner.qty >= 3)) throw new Error("RACE_SELFTEST_SCALE_WINNER");
  if (noAverageDown !== null) throw new Error("RACE_SELFTEST_NO_AVERAGE_DOWN");
  const mergedAdd = mergeOpenPosition(
    { state: "open", side: "buy", qty: 20, entryPx: 225, entryFeeEst: 45, addCount: 0, uncertainEntries: [] },
    { state: "entry_accepted", side: "buy", qty: 5, entryPx: 227, entryFeeEst: 11.35, realizedScoreEst: 0, uncertainEntries: [] },
    1001
  );
  if (!(Math.abs(mergedAdd.qty - 25) < 1e-9 && mergedAdd.entryPx > 225 && mergedAdd.entryPx < 227 && mergedAdd.addCount === 1)) throw new Error("RACE_SELFTEST_MERGE_ADD");
  const prePce = catalystContext(Date.parse("2026-09-30T12:00:00Z"));
  const postPce = catalystContext(Date.parse("2026-09-30T12:45:00Z"));
  if (!(prePce.blockNewEntries && prePce.active?.name === "PCE_GDP")) throw new Error("RACE_SELFTEST_CATALYST_PRE");
  if (!(postPce.requireVeryStrong && postPce.active?.name === "PCE_GDP")) throw new Error("RACE_SELFTEST_CATALYST_POST");
  const upperSell = tacticalRangeEntry(strongDownSignal, { px: 232.20 }, { hoursRemaining: 100 }, { active: null, blockNewEntries: false, requireVeryStrong: false });
  const lowerBuy = tacticalRangeEntry(strongUpSignal, { px: 221.80 }, { hoursRemaining: 100 }, { active: null, blockNewEntries: false, requireVeryStrong: false });
  if (!(upperSell?.side === "sell" && upperSell.reason === "upper_band_reversal")) throw new Error("RACE_SELFTEST_UPPER_BAND_SELL");
  if (!(lowerBuy?.side === "buy" && lowerBuy.reason === "lower_band_reversal")) throw new Error("RACE_SELFTEST_LOWER_BAND_BUY");
  const preBlocked = applyCalendarRiskGate({ action: "enter", side: "buy", qty: 10, confidence: 0.99 }, strongUpSignal, { hoursRemaining: 100 }, prePce);
  if (preBlocked !== null) throw new Error("RACE_SELFTEST_EVENT_ENTRY_BLOCK");
  const finalBlocked = applyCalendarRiskGate({ action: "enter", side: "buy", qty: 10, confidence: 0.99 }, strongUpSignal, { hoursRemaining: 10 }, { active: null, blockNewEntries: false, requireVeryStrong: false });
  if (finalBlocked !== null) throw new Error("RACE_SELFTEST_FINAL_ENTRY_BLOCK");
  const shadowRun = confirmedShadowExitDecision(confirmedShadow, strongDownSignal, { px: 219.30 }, { hoursRemaining: 100 }, { active: null });
  const shadowFastStop = confirmedShadowExitDecision(
    confirmedShadow,
    { fresh: true, move5: 0.30, move15: 0.60, move30: 0.90, move60: 0.70, move240: -0.20 },
    { px: 225.20 },
    { hoursRemaining: 100 },
    { active: null }
  );
  const shadowRescue = confirmedShadowExitDecision(confirmedShadow, strongUpSignal, { px: 222.00 }, { hoursRemaining: 100 }, { active: null });
  const shadowHardTake = confirmedShadowExitDecision(confirmedShadow, strongDownSignal, { px: 218.00 }, { hoursRemaining: 100 }, { active: null });
  const shadowRelease = confirmedShadowExitDecision(
    confirmedShadow,
    { fresh: true, move5: 0.00, move15: 0.00, move30: 0.10, move60: 0.20, move240: 0.50 },
    { px: 231.0 },
    { hoursRemaining: 100 },
    { active: null }
  );
  if (!(shadowRun?.exit === false && shadowRun.reason === "shadow_hold")) throw new Error("RACE_SELFTEST_SHADOW_PROFIT_RUN");
  if (!(shadowFastStop?.exit === true && shadowFastStop.reason === "shadow_fast_directional_stop")) throw new Error("RACE_SELFTEST_SHADOW_FAST_STOP");
  if (!(shadowRescue?.exit === true && shadowRescue.reason === "shadow_lower_band_reversal")) throw new Error("RACE_SELFTEST_SHADOW_RESCUE");
  if (!(shadowHardTake?.exit === true && shadowHardTake.reason === "shadow_bank_meaningful_profit")) throw new Error("RACE_SELFTEST_SHADOW_HARD_TAKE");
  if (!(shadowRelease?.exit === true && shadowRelease.reason === "shadow_capital_release_stop")) throw new Error("RACE_SELFTEST_SHADOW_CAPITAL_RELEASE");
  const openStop = tacticalExitDecision({ state: "open", side: "sell", qty: 10, entryPx: 232, entryFeeEst: 23.2 }, strongUpSignal, { px: 235 }, { hoursRemaining: 100 }, { active: null });
  if (!(openStop?.exit === true && ["fast_directional_stop", "directional_stop"].includes(openStop.reason))) throw new Error("RACE_SELFTEST_OPEN_STOP");
  const catchUpRefs = Array.from({ length: 24 }, (_, i) => ({ px: 224.50 + i * 0.001 }));
  const catchUpDecision = controlledFallbackEntry(
    null,
    { leaderGap: 190, hoursRemaining: 170 },
    catchUpRefs,
    [{ top: [["did:key:z6MkLeader", -420]] }],
    { px: 224.52 }
  );
  if (catchUpDecision?.action === "enter") {
    throw new Error("RACE_SELFTEST_FEE_NOISE_NOT_BLOCKED");
  }
  const fadingOppositeRefs = Array.from({ length: 24 }, (_, i) => ({
    px: 224.50 + i * (0.11 / 23) + (i % 2 ? 0.10 : -0.10)
  }));
  const fadingOppositeDecision = controlledFallbackEntry(
    null,
    { leaderGap: 190, hoursRemaining: 165 },
    fadingOppositeRefs,
    [{ top: [["did:key:z6MkLeader", -420]] }],
    { px: 224.81 }
  );
  if (fadingOppositeDecision?.action === "enter") {
    throw new Error("RACE_SELFTEST_STALE_CONSENSUS_REVERSAL");
  }
  const liveStyleFadingRefs = Array.from({ length: 24 }, (_, i) => {
    const base = 224.58 + i * (0.31 / 23);
    const wobble = 0.10 * Math.sin((2 * Math.PI * 3 * i) / 23);
    return { px: base + wobble };
  });
  const liveStyleFadingDecision = controlledFallbackEntry(
    null,
    { leaderGap: 180, hoursRemaining: 165 },
    liveStyleFadingRefs,
    [{ top: [["did:key:z6MkLeader", -448.7]] }],
    { px: 224.89 }
  );
  if (liveStyleFadingDecision?.action === "enter") {
    throw new Error("RACE_SELFTEST_LIVE_STYLE_STALE_CONSENSUS");
  }
  const squeezeRefs = Array.from({ length: 24 }, (_, i) => ({ px: 224.20 + i * (1.25 / 23) }));
  const squeezeDecision = controlledFallbackEntry(
    null,
    { leaderGap: 190, hoursRemaining: 166 },
    squeezeRefs,
    [{ top: [["did:key:z6MkCrowdedShort", -420]] }],
    { px: 225.00 }
  );
  if (
    squeezeDecision?.action !== "enter" ||
    squeezeDecision.side !== "buy" ||
    squeezeDecision.reason !== "race_squeeze_breakout_scout"
  ) {
    throw new Error("RACE_SELFTEST_SQUEEZE_BREAKOUT");
  }
  const veryStrongRealScout = applyRealNvdaSignal(
    null,
    { fresh: true, move5: -0.05, move15: -0.55, move30: -0.75, move60: -0.90, move240: -2.50 },
    { leaderGap: 1200 },
    [{ px: 229.0 }, { px: 228.8 }, { px: 228.5 }, { px: 228.3 }],
    { px: 228.3 }
  );
  if (!(veryStrongRealScout?.side === "sell" && veryStrongRealScout.qty >= 40 && veryStrongRealScout.confidence >= 0.97)) {
    throw new Error("RACE_SELFTEST_VERY_STRONG_REAL_SCOUT_SIZE");
  }
  const realFreshBuy = applyRealNvdaSignal(
    null,
    { fresh: true, move15: 0.90, move30: 1.50 },
    { leaderGap: 250 },
    [{ px: 224.00 }, { px: 224.04 }, { px: 224.08 }, { px: 224.10 }],
    { px: 224.10 }
  );
  if (
    realFreshBuy?.action !== "enter" ||
    realFreshBuy.side !== "buy" ||
    realFreshBuy.reason !== "real_nvda_lead_confirmation"
  ) {
    throw new Error("RACE_SELFTEST_REAL_NVDA_SCOUT");
  }
  const realStaleIgnored = applyRealNvdaSignal(
    null,
    { fresh: false, move15: 1.00, move30: 1.50 },
    { leaderGap: 400 },
    [{ px: 224 }, { px: 224 }, { px: 224 }, { px: 224 }],
    { px: 224 }
  );
  if (realStaleIgnored !== null) throw new Error("RACE_SELFTEST_REAL_NVDA_STALE");
  const realVeto = applyRealNvdaSignal(
    { action: "enter", side: "sell", qty: 20, confidence: 0.90, reason: "test" },
    { fresh: true, move15: 0.90, move30: 1.50 },
    { leaderGap: 220 },
    [{ px: 224 }, { px: 224.05 }, { px: 224.10 }, { px: 224.15 }],
    { px: 224.15 }
  );
  if (realVeto !== null) throw new Error("RACE_SELFTEST_REAL_NVDA_VETO");
  const archivedSettled = classifyArchiveMatches([
    { n: 306, input: { id: "a", maker: did, until: 308 }, output: { id: "a", outcome: "settled" } },
    { n: 306, input: { id: "a", maker: did, until: 308 }, output: { id: "a", outcome: "void", reason: "settled" } }
  ], 310);
  if (archivedSettled?.outcome !== "settled" || archivedSettled?.n !== 306) {
    throw new Error("RACE_SELFTEST_ARCHIVE_SETTLED");
  }
  const archivedVoidPending = classifyArchiveMatches([
    { n: 577, input: { id: "b", maker: did, until: 579 }, output: { id: "b", outcome: "void", reason: "funds" } }
  ], 579);
  if (archivedVoidPending !== null) throw new Error("RACE_SELFTEST_ARCHIVE_VOID_EARLY");
  const archivedVoid = classifyArchiveMatches([
    { n: 577, input: { id: "b", maker: did, until: 579 }, output: { id: "b", outcome: "void", reason: "not_owner" } },
    { n: 577, input: { id: "b", maker: did, until: 579 }, output: { id: "b", outcome: "void", reason: "funds" } }
  ], 580);
  if (archivedVoid?.outcome !== "void" || archivedVoid?.reason !== "not_owner/funds") {
    throw new Error("RACE_SELFTEST_ARCHIVE_VOID");
  }
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
  const feePerContract = Math.abs(Number(latest.px)) * 0.01;
  const feeSignalFloor = feePerContract * (hLeft > 72 ? 0.35 : 0.25);

  const latestPositions = positionSnapshots.at(-1);
  const top = Array.isArray(latestPositions?.top) ? latestPositions.top : [];
  const topNet = top.reduce((sum, row) => {
    const value = Number(row?.[1]);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

  const strongConsensus = Number.isFinite(topNet) && Math.abs(topNet) >= 100;
  const catchUpConsensus = Number.isFinite(topNet) && Math.abs(topNet) >= 300 && gap >= 175;
  const gapPressure = clamp((gap - 125) / 175, 0, 1);
  const requiredR2 = strongConsensus ? Math.max(0.12, 0.20 - 0.08 * gapPressure) : 0.35;
  const technicalMoveFloor = strongConsensus
    ? Math.max(0.14, Math.max(0.25, minMove - 0.07) - 0.11 * gapPressure)
    : minMove;
  const requiredMove = Math.max(technicalMoveFloor, feeSignalFloor);

  console.log(
    `FALLBACK_SCAN move=${move.toFixed(2)} abs=${absMove.toFixed(2)} min=${requiredMove.toFixed(2)} feeFloor=${feeSignalFloor.toFixed(2)} r2=${r2.toFixed(2)} needR2=${requiredR2.toFixed(2)} topNet=${Number.isFinite(topNet) ? topNet.toFixed(2) : "na"} strong=${strongConsensus} catchUp=${catchUpConsensus} gap=${gap.toFixed(2)} hLeft=${hLeft.toFixed(1)}`
  );

  let direction = Math.sign(move);
  let reason = "race_trend_consensus_fallback";
  let confidence = 0.90;

  if (absMove < requiredMove || r2 < requiredR2) {
    // Visible top positions are stale holdings, not an entry oracle. Never flip the
    // trade direction just to copy them when the current move is weak or opposite.
    return rawDecision;
  }

  if (!direction) return rawDecision;
  if (!Number.isFinite(topNet) || Math.abs(topNet) < 8) return rawDecision;

  // A persistent high-quality move against a crowded visible top position can be
  // a squeeze/breakout rather than a reason to stay idle forever. When the race
  // gap is already material, take a deliberately smaller scout in price direction.
  // If the old uncertain position exists, an opposite scout also reduces its
  // directional exposure; if it was void, the scout remains bounded on its own.
  if (reason === "race_trend_consensus_fallback" && Math.sign(topNet) !== direction) {
    const squeezeBreakout =
      gap >= 175 &&
      strongConsensus &&
      absMove >= Math.max(requiredMove, feePerContract * 0.45) &&
      r2 >= 0.72;

    if (squeezeBreakout) {
      reason = "race_squeeze_breakout_scout";
      confidence = 0.84;
    } else {
      return rawDecision;
    }
  }

  let qty;
  if (reason === "race_gap_consensus_scout") {
    qty = hLeft > 144 ? 18 : hLeft > 72 ? 24 : 30;
  } else if (reason === "race_squeeze_breakout_scout") {
    qty = hLeft > 144 ? 12 : hLeft > 72 ? 16 : 22;
  } else if (hLeft > 144) {
    qty = strongConsensus && gap >= 150 ? 30 : strongConsensus ? 22 : 10;
  } else if (hLeft > 72) {
    qty = strongConsensus ? 34 : 20;
  } else {
    qty = strongConsensus ? 40 : 28;
  }
  const side = direction > 0 ? "buy" : "sell";
  console.log(
    `FALLBACK_SIGNAL side=${side} move=${move.toFixed(2)} r2=${r2.toFixed(2)} topNet=${topNet.toFixed(2)} strong=${strongConsensus} catchUp=${catchUpConsensus} gap=${gap.toFixed(2)} hLeft=${hLeft.toFixed(1)} qty=${qty.toFixed(2)} reason=${reason}`
  );
  return {
    action: "enter",
    side,
    qty,
    confidence,
    reason
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
  const until = Number(latest.n) + 1;
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
      if (!Array.isArray(v) || v.length < 2) continue;
      const id = String(v[0]);
      const reason = String(v[1]);
      if (reason === "settled") {
        // A later duplicate copy was rejected because this id had already
        // settled. Count that as positive historical maker reliability.
        settledIds.add(id);
      } else {
        voidById.set(id, reason);
      }
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
  const minQty = Math.max(0.1, desiredQty * 0.40);
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
    const confidence = Number(decision?.confidence || 0);
    const pristineHighConviction =
      settledCount === 0 &&
      fundsFails === 0 &&
      confidence >= 0.97 &&
      Math.abs(px - refPx) / refPx <= 0.015 &&
      qty <= desiredQty * 1.10;
    if (settledCount < 1 && !pristineHighConviction) continue;

    const reliability = settledCount - 1.5 * fundsFails + (pristineHighConviction ? 0.25 : 0);
    const sizeFit = -Math.abs(qty - desiredQty) / Math.max(1, desiredQty);
    const priceFit = -Math.abs(px - refPx) / refPx;
    const recency = Number(roomMsgs[i]?.seq || 0);
    candidates.push({ b, qty, px, maker, score: reliability * 10 + sizeFit * 3 + priceFit + recency * 1e-9 });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] || null;
}

function mergeOpenPosition(priorOpen, addState, settledSweep) {
  const oldQty = Number(priorOpen?.qty);
  const addQty = Number(addState?.qty);
  const oldPx = Number(priorOpen?.entryPx);
  const addPx = Number(addState?.entryPx);
  if (![oldQty, addQty, oldPx, addPx].every(Number.isFinite) || oldQty <= 0 || addQty <= 0) throw new Error("INVALID_ADD_POSITION_STATE");
  if (String(priorOpen?.side) !== String(addState?.side)) throw new Error("ADD_POSITION_SIDE_MISMATCH");
  const totalQty = oldQty + addQty;
  return {
    ...priorOpen,
    state: "open",
    qty: totalQty,
    entryPx: (oldQty * oldPx + addQty * addPx) / totalQty,
    entryFeeEst: Number(priorOpen.entryFeeEst || (0.01 * oldQty * oldPx)) + Number(addState.entryFeeEst || (0.01 * addQty * addPx)),
    realizedScoreEst: Number(addState.realizedScoreEst ?? priorOpen.realizedScoreEst ?? 0),
    uncertainEntries: uncertainEntries(addState),
    addCount: Number(priorOpen.addCount || 0) + 1,
    lastAddQty: addQty,
    lastAddPx: addPx,
    lastAddSweep: Number(settledSweep || addState.acceptedAtSweep || addState.entrySweep || priorOpen.entrySweep)
  };
}

function restorePriorOpen(state, latestSweep, reason) {
  const prior = state?.priorOpen;
  if (!prior || prior.state !== "open") return null;
  return {
    ...prior,
    state: "open",
    realizedScoreEst: Number(state.realizedScoreEst ?? prior.realizedScoreEst ?? 0),
    uncertainEntries: uncertainEntries(state),
    lastAddFailure: reason || "unknown",
    addRetryAfterSweep: Number(latestSweep || 0) + 1
  };
}

function scaleInDecision(openState, signal, latest, race, catalyst) {
  if (!signal?.fresh || catalyst?.blockNewEntries) return null;
  const hours = Number(race?.hoursRemaining);
  if (!Number.isFinite(hours) || hours <= FINAL_NO_NEW_ENTRY_HOURS) return null;
  const px = Number(latest?.px), entryPx = Number(openState?.entryPx), qty = Number(openState?.qty);
  if (![px, entryPx, qty].every(Number.isFinite) || qty <= 0) return null;
  if (Number(openState.addRetryAfterSweep || 0) > Number(latest?.n || 0)) return null;
  if (Number(openState.addCount || 0) >= 2) return null;
  if (uncertainEntries(openState).length) return null;

  const shape = directionalShape(signal);
  const long = openState.side === "buy";
  const favorableMove = long ? px - entryPx : entryPx - px;
  const continuation = long ? shape.continuationUp : shape.continuationDown;
  const fastAdverse = long ? shape.fastDown : shape.fastUp;
  if (!continuation || fastAdverse) return null;

  const trigger = Number(openState.addCount || 0) === 0 ? 0.80 : 1.60;
  if (favorableMove < trigger) return null;

  const realizedCapital = Math.max(1000, 10000 + Number(openState.realizedScoreEst || 0));
  const totalCap = Math.max(0, Math.min(60, realizedCapital / (px * 1.04)));
  const remainingCap = Math.max(0, totalCap - qty);
  if (remainingCap < 3) return null;

  const gap = Number(race?.leaderGap);
  const desired = Number(openState.addCount || 0) === 0
    ? (Number.isFinite(gap) && gap >= 750 ? 10 : 7)
    : (Number.isFinite(gap) && gap >= 750 ? 7 : 5);
  const addQty = Math.floor(Math.min(desired, remainingCap) * 100) / 100;
  if (addQty < 3) return null;
  return { action: "enter", side: openState.side, qty: addQty, confidence: 0.98, reason: Number(openState.addCount || 0) === 0 ? "scale_in_winner_1" : "scale_in_winner_2" };
}

async function takeReliableOffer(match, decision, latest, priorState = {}, priorOpen = null) {
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
    maker: String(terms.maker),
    priorOpen: priorOpen ? { ...priorOpen } : null,
    entryPurpose: priorOpen ? "add" : "new"
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

async function postScaleIn(decision, latest, openState) {
  if (!execute) {
    console.log(`DRY_SCALE_IN side=${decision.side} qty=${Number(decision.qty).toFixed(2)}`);
    return true;
  }
  const match = await findReliableOpposingOffer(decision, latest);
  if (!match) {
    console.log(`SCALE_IN_NO_LIQUIDITY side=${decision.side} qty=${Number(decision.qty).toFixed(2)}`);
    return false;
  }
  await takeReliableOffer(match, decision, latest, openState, openState);
  return true;
}

async function findOwnTakerAcceptance(id) {
  const msgs = await readExport(ROOM);
  const candidates = [];
  for (const msg of msgs) {
    const b = parseBody(msg);
    if (
      b?.t === "trade" &&
      b?.season === SEASON &&
      b?.terms?.id === id &&
      b?.taker === did &&
      b?.taker_sig &&
      validAcceptance(b)
    ) {
      candidates.push({
        seq: Number(msg?.seq || 0) || Number.MAX_SAFE_INTEGER,
        taker: did,
        body: b
      });
    }
  }
  candidates.sort((a, b) => a.seq - b.seq);
  return candidates[0] || null;
}

async function findAcceptance(id) {
  const msgs = await readExport(ROOM);
  const candidates = [];
  for (const msg of msgs) {
    const b = parseBody(msg);
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
      candidates.push({
        seq: Number(msg?.seq || 0) || Number.MAX_SAFE_INTEGER,
        taker: String(b.taker),
        body: b
      });
    }
  }
  candidates.sort((a, b) => a.seq - b.seq);
  return candidates[0] || null;
}
async function logRecentRedDragonVoids() {
  const msgs = await readRoom("d-close1-flow", 200);
  const hits = [];
  for (const msg of msgs) {
    const b = parseBody(msg);
    if (b?.t !== "flow" || !Array.isArray(b.void)) continue;
    for (const row of b.void) {
      if (!Array.isArray(row) || row.length < 2) continue;
      const id = String(row[0] || "");
      if (!id.startsWith("rd4e-") && !id.startsWith("rd4x-")) continue;
      hits.push({ n: Number(b.n), id, reason: String(row[1]) });
    }
  }
  if (hits.length) {
    console.log(
      "REDDRAGON_VOID_HISTORY " +
      hits.slice(-8).map((x) => `n=${x.n} id=${x.id} reason=${x.reason}`).join(" | ")
    );
  } else {
    console.log("REDDRAGON_VOID_HISTORY none_visible");
  }
}
async function logPeerRecentHistory(peerDid) {
  const peer = String(peerDid || "");
  if (!peer) {
    console.log("PEER_HISTORY none");
    return;
  }
  const [roomMsgs, flowMsgs] = await Promise.all([
    readExport(ROOM),
    readRoom("d-close1-flow", 200)
  ]);
  const ids = new Set();
  let offers = 0;
  let accepts = 0;
  for (const msg of roomMsgs) {
    const b = parseBody(msg);
    if (b?.t !== "trade" || !b?.terms?.id) continue;
    if (String(b.terms.maker || "") === peer || String(b.taker || "") === peer) {
      ids.add(String(b.terms.id));
      if (String(b.terms.maker || "") === peer && !b.taker_sig) offers++;
      if (String(b.taker || "") === peer && b.taker_sig) accepts++;
    }
  }

  let settled = 0;
  const voids = new Map();
  for (const msg of flowMsgs) {
    const b = parseBody(msg);
    if (b?.t !== "flow") continue;
    for (const id of Array.isArray(b.settled) ? b.settled : []) {
      if (ids.has(String(id))) settled++;
    }
    for (const row of Array.isArray(b.void) ? b.void : []) {
      if (!Array.isArray(row) || row.length < 2 || !ids.has(String(row[0]))) continue;
      const reason = String(row[1]);
      voids.set(reason, (voids.get(reason) || 0) + 1);
    }
  }
  const voidText = [...voids.entries()].map(([k, v]) => `${k}:${v}`).join(",") || "none";
  console.log(
    `PEER_HISTORY did=${peer.slice(0, 24)} ids=${ids.size} offers=${offers} accepts=${accepts} listedSettled=${settled} listedVoids=${voidText}`
  );
}


async function findOutcome(id, fromSweep = 0, flowMessages = null) {
  const msgs = flowMessages || await readRoom("d-close1-flow", 200);
  let omittedSettled = 0;
  let omittedVoid = 0;
  let firstOmittedSweep = null;
  let lastOmittedSweep = null;

  for (let i = msgs.length - 1; i >= 0; i--) {
    const b = parseBody(msgs[i]);
    if (b?.t !== "flow") continue;
    const n = Number(b.n);
    if (Number.isFinite(Number(fromSweep)) && Number(fromSweep) > 0 && n < Number(fromSweep)) continue;

    if (Array.isArray(b.settled) && b.settled.includes(id)) {
      return { outcome: "settled", n };
    }
    if (Array.isArray(b.void)) {
      const hit = b.void.find((v) => Array.isArray(v) && v[0] === id);
      if (hit) {
        const reason = String(hit[1]);
        // "settled" is emitted for a later duplicate of an id that already
        // settled earlier. For the maker's economic state this is positive
        // evidence that the trade id did settle.
        if (reason === "settled") {
          return { outcome: "settled", n, inferredFrom: "void:settled" };
        }
        return { outcome: "void", reason, n };
      }
    }

    const os = Number(b?.omitted?.settled || 0);
    const ov = Number(b?.omitted?.void || 0);
    if (os > 0 || ov > 0) {
      omittedSettled += Math.max(0, os);
      omittedVoid += Math.max(0, ov);
      firstOmittedSweep = firstOmittedSweep == null ? n : Math.min(firstOmittedSweep, n);
      lastOmittedSweep = lastOmittedSweep == null ? n : Math.max(lastOmittedSweep, n);
    }
  }

  if (omittedSettled > 0 || omittedVoid > 0) {
    if (Number(fromSweep) > 0) {
      try {
        const archived = await findArchiveOutcome(id, Number(fromSweep));
        if (archived) return archived;
      } catch (error) {
        console.log(`ARCHIVE_OUTCOME_LOOKUP_FAILED id=${id} error=${String(error).slice(0,200)}`);
      }
    }
    return {
      outcome: "ambiguous_omitted",
      omittedSettled,
      omittedVoid,
      firstOmittedSweep,
      lastOmittedSweep
    };
  }
  return null;
}

async function reconcileUncertainEntries(state, posSnapshots, latestSweep) {
  const entries = uncertainEntries(state);
  if (!entries.length) return { state, changed: false };

  // Old ambiguous trades can age out of the 200-message live view. Use the signed,
  // read-only referee export to revisit their ids without posting a diagnostic trade.
  const flowMessages = await readExport("d-close1-flow");
  const kept = [];
  let changed = false;

  for (const entry of entries) {
    const outcome = await findOutcome(
      String(entry.id || ""),
      Number(entry.acceptedAtSweep || 0),
      flowMessages
    );

    if (outcome?.outcome === "void") {
      changed = true;
      console.log(
        `UNCERTAIN_RESOLVED_VOID id=${entry.id} reason=${outcome.reason} n=${outcome.n ?? "na"}`
      );
      continue;
    }

    const peerEvidence = peerSettlementEvidence(posSnapshots, entry, latestSweep);
    const settled = outcome?.outcome === "settled" || peerEvidence?.settled === true;
    if (settled && entry.confirmedOutcome !== "settled") {
      changed = true;
      const settledPx = Number.isFinite(Number(outcome?.px)) ? Number(outcome.px) : Number(entry.entryPx);
      const settledFee = Number.isFinite(Number(outcome?.fee))
        ? Number(outcome.fee)
        : Number(entry.entryFeeEst || (0.01 * Number(entry.qty) * settledPx));
      kept.push({
        ...entry,
        entryPx: settledPx,
        entryFeeEst: settledFee,
        confirmedOutcome: "settled",
        confirmedAtSweep: Number(outcome?.n || peerEvidence?.after?.n || latestSweep)
      });
      console.log(
        `UNCERTAIN_CONFIRMED_SETTLED id=${entry.id} n=${outcome?.n ?? peerEvidence?.after?.n ?? "na"}`
      );
      continue;
    }

    kept.push(entry);
  }

  if (!changed) return { state, changed: false };
  return { state: { ...state, uncertainEntries: kept }, changed: true };
}

async function findReliableExactOpposingOffer(side, qty, latest) {
  const match = await findReliableOpposingOffer({ side, qty }, latest);
  if (!match) return null;
  return Math.abs(Number(match.qty) - Number(qty)) <= 0.02 ? match : null;
}

async function takeReliableExitOffer(match, openState, latest) {
  const terms = match.b.terms;
  const exitSide = openState.side === "buy" ? "sell" : "buy";
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
    state: "exit_preflight",
    id: String(terms.id),
    exitSide,
    exitPx: Number(terms.px),
    qty: Number(openState.qty),
    entrySide: openState.side,
    entryPx: Number(openState.entryPx),
    entrySweep: Number(openState.entrySweep),
    entryId: openState.entryId || null,
    until: Number(terms.until),
    requestedAtSweep: Number(latest.n),
    realizedScoreEst: Number(openState.realizedScoreEst || 0),
    entryFeeEst: Number(openState.entryFeeEst || (0.01 * Number(openState.qty) * Number(openState.entryPx))),
    closingShadowId: openState.closingShadowId || null,
    uncertainEntries: uncertainEntries(openState),
    liquidityRole: "taker",
    maker: String(terms.maker)
  };
  await setState(preflight);
  const posted = await signedPost(ROOM, text);
  await setState({
    ...preflight,
    state: "exit_accepted",
    postedSeq: posted.seq,
    acceptedSeq: posted.seq,
    acceptedAtSweep: Number(latest.n),
    taker: did
  });
  console.log(`EXIT_TAKE side=${exitSide} qty=${Number(openState.qty).toFixed(2)} px=${Number(terms.px).toFixed(2)} maker=${String(terms.maker).slice(0,24)} seq=${posted.seq || "?"}`);
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
    entryPx: Number(offer.terms.px),
    until: offer.until,
    entrySweep: Number(latest.n),
    realizedScoreEst: Number(priorState.realizedScoreEst || 0),
    uncertainEntries: uncertainEntries(priorState),
    liquidityRole: "maker"
  };
  await setState(preflight);
  const posted = await signedPost(ROOM, offer.text);
  await setState({ ...preflight, state: "entry_offer", postedSeq: posted.seq });
  console.log(`ENTRY_OFFER side=${decision.side} qty=${Number(decision.qty).toFixed(2)} seq=${posted.seq || "?"}`);
}
function realizedCloseDelta(state, outcome, fallbackMark) {
  const qty = Number(state?.qty);
  const entryPx = Number(state?.entryPx);
  const exitPx = Number.isFinite(Number(outcome?.px))
    ? Number(outcome.px)
    : Number.isFinite(Number(state?.exitPx))
      ? Number(state.exitPx)
      : Number(fallbackMark);
  if (![qty, entryPx, exitPx].every(Number.isFinite) || qty <= 0) return null;
  const direction = state.entrySide === "buy" ? 1 : -1;
  const gross = direction * qty * (exitPx - entryPx);
  const entryFee = Number.isFinite(Number(state.entryFeeEst))
    ? Number(state.entryFeeEst)
    : 0.01 * qty * entryPx;
  const exitFee = Number.isFinite(Number(outcome?.fee))
    ? Number(outcome.fee)
    : 0.01 * qty * exitPx;
  return { delta: gross - entryFee - exitFee, gross, entryFee, exitFee, exitPx };
}

async function postExit(openState, latest) {
  const side = openState.side === "buy" ? "sell" : "buy";
  if (execute) {
    const exactMatch = await findReliableExactOpposingOffer(side, Number(openState.qty), latest);
    if (exactMatch) {
      await takeReliableExitOffer(exactMatch, openState, latest);
      return;
    }
  }
  const offer = makeOffer(side, Number(openState.qty), latest, "rd4x");
  if (!execute) {
    console.log(`DRY_EXIT side=${side} qty=${Number(openState.qty).toFixed(2)}`);
    return;
  }
  const preflight = {
    state: "exit_preflight",
    id: offer.id,
    exitSide: side,
    exitPx: Number(offer.terms.px),
    qty: Number(openState.qty),
    entrySide: openState.side,
    entryPx: Number(openState.entryPx),
    entrySweep: Number(openState.entrySweep),
    entryId: openState.entryId || null,
    until: offer.until,
    requestedAtSweep: Number(latest.n),
    realizedScoreEst: Number(openState.realizedScoreEst || 0),
    entryFeeEst: Number(openState.entryFeeEst || (0.01 * Number(openState.qty) * Number(openState.entryPx))),
    closingShadowId: openState.closingShadowId || null,
    uncertainEntries: uncertainEntries(openState),
    liquidityRole: "maker"
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
const reconciled = await reconcileUncertainEntries(state, positions, latest.n);
if (reconciled.changed) {
  state = reconciled.state;
  await setState(state);
}
const ownPos = currentOwnPosition(positions);
let race = raceContext({ now, pnlSnapshots: pnl, state, latest });
console.log(
  `STATUS execute=${execute} n=${latest.n} ref=${latest.px} state=${state.state} ownTopPos=${ownPos ?? "na"} leader=${race.leaderScore ?? "na"} ownEst=${race.ownScoreEst.toFixed(2)} downside=${race.ownDownsideFloor.toFixed(2)} gap=${race.leaderGap ?? "na"} hLeft=${race.hoursRemaining.toFixed(1)}`
);
if (!execute) {
  await logRecentRedDragonVoids();
  await logPeerRecentHistory(state?.taker);
}

const catalyst = catalystContext(now);
if (catalyst.active) {
  console.log(`CATALYST name=${catalyst.active.name} phase=${catalyst.active.phase} deltaMin=${catalyst.active.deltaMin.toFixed(1)}`);
} else if (catalyst.next) {
  console.log(`CATALYST_NEXT name=${catalyst.next.name} hours=${((catalyst.next.at - now) / 3600000).toFixed(1)}`);
}
let realNvdaSignal = null;
if (state.state === "open" || state.state === "idle") {
  realNvdaSignal = await fetchRealNvdaSignal(now);
  if (realNvdaSignal?.fresh) {
    const trend = multiTimeframeTrend(realNvdaSignal);
    console.log(`MTF trend=${trend.label} ratio=${trend.ratio.toFixed(2)} score=${trend.score}/${trend.weight}`);
  }
}

if (state.state === "entry_preflight") {
  const seen = state.liquidityRole === "taker"
    ? await findOwnTakerAcceptance(state.id)
    : await findAcceptance(state.id);
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
    await setState({
      state: "idle",
      cooldownUntilSweep: Number(latest.n) + 1,
      lastPreflight: state.id,
      realizedScoreEst: Number(state.realizedScoreEst || 0),
      uncertainEntries: uncertainEntries(state)
    });
    console.log("ENTRY_PREFLIGHT_CLEARED");
    process.exit(0);
  }
  console.log("ENTRY_PREFLIGHT_WAIT");
  process.exit(0);
}

if (state.state === "exit_preflight") {
  const seen = state.liquidityRole === "taker"
    ? await findOwnTakerAcceptance(state.id)
    : await findAcceptance(state.id);
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
      entryFeeEst: Number(state.entryFeeEst || (0.01 * Number(state.qty) * Number(state.entryPx))),
      uncertainEntries: uncertainEntries(state)
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
  const effectiveEntryUntil = Math.min(
    Number(state.until || latest.n),
    Number(state.entrySweep || latest.n) + 1
  );
  if (Number(latest.n) <= effectiveEntryUntil) {
    console.log("ENTRY_OFFER_LIVE");
    process.exit(0);
  }
  state = {
    state: "idle",
    cooldownUntilSweep: Number(latest.n),
    lastExpiredId: state.id,
    realizedScoreEst: Number(state.realizedScoreEst || 0),
    uncertainEntries: uncertainEntries(state)
  };
  await setState(state);
  console.log("ENTRY_EXPIRED_FAST_REPRICE");
  realNvdaSignal = await fetchRealNvdaSignal(now);
  if (realNvdaSignal?.fresh) {
    const trend = multiTimeframeTrend(realNvdaSignal);
    console.log(`MTF_REPRICE trend=${trend.label} ratio=${trend.ratio.toFixed(2)} score=${trend.score}/${trend.weight}`);
  }
}

if (state.state === "entry_accepted") {
  let releasedAmbiguousEntry = false;
  const outcome = await findOutcome(state.id, Number(state.acceptedAtSweep || state.entrySweep || 0));
  const expectedSign = state.side === "buy" ? 1 : -1;
  const expectedVisibleQty = state.priorOpen ? Number(state.priorOpen.qty || 0) + Number(state.qty) * 0.75 : Number(state.qty) * 0.75;
  const topEvidence =
    Number.isFinite(ownPos) &&
    Math.sign(ownPos) === expectedSign &&
    Math.abs(ownPos) >= Math.max(0.1, expectedVisibleQty);
  const peerEvidence = peerSettlementEvidence(positions, state, latest.n);
  if (peerEvidence) {
    console.log(
      `PEER_POSITION_DELTA did=${peerEvidence.peer.slice(0, 24)} before=${peerEvidence.before.pos.toFixed(2)} after=${peerEvidence.after.pos.toFixed(2)} observed=${peerEvidence.observedDelta.toFixed(2)} expected=${peerEvidence.expectedDelta.toFixed(2)} settled=${peerEvidence.settled}`
    );
  }

  if (outcome?.outcome === "void") {
    const restoredOpen = restorePriorOpen(state, latest.n, outcome.reason);
    if (restoredOpen) {
      await setState(restoredOpen);
      console.log(`ADD_VOID_RESTORE_OPEN reason=${outcome.reason} n=${outcome.n ?? "na"} id=${state.id}`);
    } else {
      await setState({
        state: "idle",
        cooldownUntilSweep: Number(latest.n) + 1,
        lastVoid: outcome.reason,
        lastVoidId: state.id,
        realizedScoreEst: Number(state.realizedScoreEst || 0),
        uncertainEntries: uncertainEntries(state)
      });
      console.log(`ENTRY_VOID reason=${outcome.reason} n=${outcome.n ?? "na"} id=${state.id}`);
    }
    process.exit(0);
  }
  if (outcome?.outcome === "ambiguous_omitted" && !topEvidence && !peerEvidence?.settled) {
    const acceptedAt = Number(state.acceptedAtSweep || state.entrySweep || latest.n);
    if (Number(latest.n) >= acceptedAt + UNCERTAIN_RELEASE_SWEEPS) {
      const entries = uncertainEntries(state);
      if (!entries.some((x) => x.id === state.id)) {
        entries.push({
          id: state.id,
          side: state.side,
          qty: Number(state.qty),
          entryPx: Number(state.entryPx),
          acceptedAtSweep: acceptedAt,
          taker: state.taker || null
        });
      }
      const env = uncertaintyEnvelope({ uncertainEntries: entries });
      state = {
        state: "idle",
        cooldownUntilSweep: Number(latest.n),
        realizedScoreEst: Number(state.realizedScoreEst || 0),
        uncertainEntries: entries,
        lastAmbiguousId: state.id
      };
      await setState(state);
      releasedAmbiguousEntry = true;
      console.log(
        `ENTRY_AMBIGUOUS_RELEASED id=${entries.at(-1)?.id || "?"} lo=${env.lo.toFixed(2)} hi=${env.hi.toFixed(2)}`
      );
      realNvdaSignal = await fetchRealNvdaSignal(now);
      if (realNvdaSignal?.fresh) {
        const trend = multiTimeframeTrend(realNvdaSignal);
        console.log(`MTF_AMBIGUOUS_RELEASE trend=${trend.label} ratio=${trend.ratio.toFixed(2)} score=${trend.score}/${trend.weight}`);
      }
    } else {
      console.log(
        `ENTRY_PENDING_OMITTED settled=${outcome.omittedSettled} void=${outcome.omittedVoid}`
      );
      process.exit(0);
    }
  }

  if (!releasedAmbiguousEntry && (outcome?.outcome === "settled" || topEvidence || peerEvidence?.settled)) {
    const settledEntryPx = Number.isFinite(Number(outcome?.px)) ? Number(outcome.px) : Number(state.entryPx);
    const settledEntryFee = Number.isFinite(Number(outcome?.fee))
      ? Number(outcome.fee)
      : Number(state.entryFeeEst || (0.01 * Number(state.qty) * settledEntryPx));
    const settledState = { ...state, entryPx: settledEntryPx, entryFeeEst: settledEntryFee };
    const open = state.priorOpen
      ? mergeOpenPosition(state.priorOpen, settledState, outcome?.n || Number(state.acceptedAtSweep || latest.n))
      : {
          state: "open",
          side: state.side,
          qty: Number(state.qty),
          entryPx: settledEntryPx,
          entrySweep: outcome?.n || Number(state.acceptedAtSweep || latest.n),
          entryId: state.id,
          realizedScoreEst: Number(state.realizedScoreEst || 0),
          entryFeeEst: settledEntryFee,
          uncertainEntries: uncertainEntries(state),
          addCount: 0
        };
    await setState(open);
    console.log("POSITION_OPEN");
    state = open;
  } else if (!releasedAmbiguousEntry && Number(latest.n) >= Number(state.acceptedAtSweep || latest.n) + 2) {
    const acceptedAt = Number(state.acceptedAtSweep || state.entrySweep || latest.n);
    const entries = uncertainEntries(state);
    if (!entries.some((x) => x.id === state.id)) {
      entries.push({
        id: state.id,
        side: state.side,
        qty: Number(state.qty),
        entryPx: Number(state.entryPx),
        acceptedAtSweep: acceptedAt,
        taker: state.taker || null
      });
    }
    state = {
      state: "idle",
      cooldownUntilSweep: Number(latest.n),
      realizedScoreEst: Number(state.realizedScoreEst || 0),
      uncertainEntries: entries,
      lastUnverifiedReleasedId: state.id
    };
    await setState(state);
    console.log("ENTRY_UNVERIFIED_RELEASED");
  } else if (!releasedAmbiguousEntry) {
    console.log("ENTRY_PENDING_SWEEP");
    process.exit(0);
  }
}

if (state.state === "entry_unverified") {
  const outcome = await findOutcome(state.id, Number(state.acceptedAtSweep || state.entrySweep || 0));
  const expectedSign = state.side === "buy" ? 1 : -1;
  const expectedVisibleQty = state.priorOpen ? Number(state.priorOpen.qty || 0) + Number(state.qty) * 0.75 : Number(state.qty) * 0.75;
  const topEvidence =
    Number.isFinite(ownPos) &&
    Math.sign(ownPos) === expectedSign &&
    Math.abs(ownPos) >= Math.max(0.1, expectedVisibleQty);
  const peerEvidence = peerSettlementEvidence(positions, state, latest.n);
  if (peerEvidence) {
    console.log(
      `PEER_POSITION_DELTA did=${peerEvidence.peer.slice(0, 24)} before=${peerEvidence.before.pos.toFixed(2)} after=${peerEvidence.after.pos.toFixed(2)} observed=${peerEvidence.observedDelta.toFixed(2)} expected=${peerEvidence.expectedDelta.toFixed(2)} settled=${peerEvidence.settled}`
    );
  }
  if (outcome?.outcome === "settled" || topEvidence || peerEvidence?.settled) {
    const settledEntryPx = Number.isFinite(Number(outcome?.px)) ? Number(outcome.px) : Number(state.entryPx);
    const settledEntryFee = Number.isFinite(Number(outcome?.fee))
      ? Number(outcome.fee)
      : Number(state.entryFeeEst || (0.01 * Number(state.qty) * settledEntryPx));
    const settledState = { ...state, entryPx: settledEntryPx, entryFeeEst: settledEntryFee };
    const open = state.priorOpen
      ? mergeOpenPosition(state.priorOpen, settledState, Number(outcome?.n || latest.n))
      : {
          state: "open",
          side: state.side,
          qty: Number(state.qty),
          entryPx: settledEntryPx,
          entrySweep: Number(outcome?.n || latest.n),
          entryId: state.id,
          realizedScoreEst: Number(state.realizedScoreEst || 0),
          entryFeeEst: settledEntryFee,
          uncertainEntries: uncertainEntries(state),
          addCount: 0
        };
    await setState(open);
    console.log("ENTRY_UNVERIFIED_RECOVERED_SETTLED");
    state = open;
  } else if (outcome?.outcome === "void") {
    const restoredOpen = restorePriorOpen(state, latest.n, outcome.reason);
    if (restoredOpen) {
      await setState(restoredOpen);
      console.log(`ADD_UNVERIFIED_VOID_RESTORE_OPEN reason=${outcome.reason} n=${outcome.n ?? "na"} id=${state.id}`);
    } else {
      await setState({
        state: "idle",
        cooldownUntilSweep: Number(latest.n) + 1,
        lastVoid: outcome.reason,
        lastVoidId: state.id,
        realizedScoreEst: Number(state.realizedScoreEst || 0),
        uncertainEntries: uncertainEntries(state)
      });
      console.log(`ENTRY_UNVERIFIED_RECOVERED_VOID reason=${outcome.reason} n=${outcome.n ?? "na"} id=${state.id}`);
    }
    process.exit(0);
  } else if (outcome?.outcome === "ambiguous_omitted") {
    const acceptedAt = Number(state.acceptedAtSweep || state.entrySweep || latest.n);
    if (Number(latest.n) >= acceptedAt + UNCERTAIN_RELEASE_SWEEPS) {
      const entries = uncertainEntries(state);
      if (!entries.some((x) => x.id === state.id)) {
        entries.push({
          id: state.id,
          side: state.side,
          qty: Number(state.qty),
          entryPx: Number(state.entryPx),
          acceptedAtSweep: acceptedAt,
          taker: state.taker || null
        });
      }
      const env = uncertaintyEnvelope({ uncertainEntries: entries });
      if (state.priorOpen) {
        await setState({
          ...state.priorOpen,
          state: "open",
          realizedScoreEst: Number(state.realizedScoreEst || state.priorOpen.realizedScoreEst || 0),
          uncertainEntries: entries,
          lastAmbiguousAddId: state.id,
          addRetryAfterSweep: Number(latest.n) + UNCERTAIN_RELEASE_SWEEPS
        });
        console.log(`ADD_UNVERIFIED_SHADOWED id=${state.id} qty=${Number(state.qty).toFixed(2)} lo=${env.lo.toFixed(2)} hi=${env.hi.toFixed(2)}`);
      } else {
        await setState({
          state: "idle",
          cooldownUntilSweep: Number(latest.n) + 1,
          realizedScoreEst: Number(state.realizedScoreEst || 0),
          uncertainEntries: entries,
          lastAmbiguousId: state.id
        });
        console.log(`ENTRY_UNVERIFIED_SHADOWED id=${state.id} side=${state.side} qty=${Number(state.qty).toFixed(2)} lo=${env.lo.toFixed(2)} hi=${env.hi.toFixed(2)}`);
      }
      process.exit(0);
    }
    console.log(
      `ENTRY_OUTCOME_AMBIGUOUS_OMITTED settled=${outcome.omittedSettled} void=${outcome.omittedVoid} sweeps=${outcome.firstOmittedSweep ?? "na"}-${outcome.lastOmittedSweep ?? "na"}`
    );
    process.exit(0);
  } else if (Number(latest.n) > Number(state.until || 0) + 2) {
    // Only clear when the public flow window is complete enough to prove that
    // no outcome was omitted. With omitted outcome arrays, absence is not evidence.
    const restoredOpen = restorePriorOpen(state, latest.n, "complete_flow_no_settlement");
    if (restoredOpen) {
      await setState(restoredOpen);
      console.log("ADD_UNVERIFIED_CLEARED_RESTORE_OPEN");
    } else {
      await setState({
        state: "idle",
        cooldownUntilSweep: Number(latest.n) + 1,
        lastIgnoredId: state.id,
        realizedScoreEst: Number(state.realizedScoreEst || 0),
        uncertainEntries: uncertainEntries(state)
      });
      console.log("ENTRY_UNVERIFIED_CLEARED_COMPLETE_FLOW");
    }
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
  const effectiveExitUntil = Math.min(
    Number(state.until || latest.n),
    Number(state.requestedAtSweep || latest.n) + 1
  );
  if (Number(latest.n) <= effectiveExitUntil) {
    console.log("EXIT_OFFER_LIVE");
    process.exit(0);
  }
  if (state.closingShadowId) {
    await setState({
      state: "idle",
      cooldownUntilSweep: Number(latest.n) + 1,
      realizedScoreEst: Number(state.realizedScoreEst || 0),
      uncertainEntries: uncertainEntries(state),
      lastShadowExitExpiredId: state.id
    });
    console.log(`SHADOW_EXIT_EXPIRED_REEVALUATE shadow=${state.closingShadowId}`);
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
    entryFeeEst: Number(state.entryFeeEst || (0.01 * Number(state.qty) * Number(state.entryPx))),
    uncertainEntries: uncertainEntries(state)
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
    if (state.closingShadowId) {
      await setState({
        state: "idle",
        cooldownUntilSweep: Number(latest.n) + 1,
        realizedScoreEst: Number(state.realizedScoreEst || 0),
        uncertainEntries: uncertainEntries(state),
        lastShadowExitVoid: outcome.reason
      });
      console.log(`SHADOW_EXIT_VOID_REEVALUATE reason=${outcome.reason} n=${outcome.n ?? "na"} id=${state.id}`);
      process.exit(0);
    }
    const open = {
      state: "open",
      side: state.entrySide,
      qty: Number(state.qty),
      entryPx: Number(state.entryPx),
      entrySweep: Number(state.entrySweep),
      entryId: state.entryId || null,
      lastExitVoid: outcome.reason,
      realizedScoreEst: Number(state.realizedScoreEst || 0),
      entryFeeEst: Number(state.entryFeeEst || (0.01 * Number(state.qty) * Number(state.entryPx))),
      uncertainEntries: uncertainEntries(state)
    };
    await setState(open);
    console.log(`EXIT_VOID_REEVALUATE reason=${outcome.reason} n=${outcome.n ?? "na"} id=${state.id}`);
    state = open;
  } else if (
    outcome?.outcome === "settled" ||
    (Number.isFinite(ownPos) && !topStillOpen && Number(latest.n) >= Number(state.acceptedAtSweep || latest.n) + 1)
  ) {
    const close = realizedCloseDelta(state, outcome, latest.px);
    if (!close) throw new Error("EXIT_REALIZED_ACCOUNTING_INVALID");
    await setState({
      state: "idle",
      cooldownUntilSweep: Number(latest.n) + 1,
      lastClosedId: state.id,
      realizedScoreEst: Number(state.realizedScoreEst || 0) + close.delta,
      uncertainEntries: state.closingShadowId
        ? removeUncertainEntry(state, state.closingShadowId)
        : uncertainEntries(state)
    });
    console.log("POSITION_CLOSED");
    process.exit(0);
  } else if (Number(latest.n) >= Number(state.acceptedAtSweep || latest.n) + 1) {
    state = { ...state, state: "exit_unverified", checkedThroughSweep: Number(latest.n) };
    await setState(state);
    console.log("EXIT_OUTCOME_UNVERIFIED_RECHECK");
  } else {
    console.log("EXIT_PENDING_SWEEP");
    process.exit(0);
  }
}

if (state.state === "exit_unverified") {
  const outcome = await findOutcome(state.id, Number(state.acceptedAtSweep || 0));
  const expectedStillOpenSign = state.entrySide === "buy" ? 1 : -1;
  const topStillOpen =
    Number.isFinite(ownPos) &&
    Math.sign(ownPos) === expectedStillOpenSign &&
    Math.abs(ownPos) >= Math.max(0.1, Number(state.qty) * 0.5);

  if (outcome?.outcome === "void" || topStillOpen) {
    if (state.closingShadowId) {
      await setState({
        state: "idle",
        cooldownUntilSweep: Number(latest.n) + 1,
        realizedScoreEst: Number(state.realizedScoreEst || 0),
        uncertainEntries: uncertainEntries(state),
        lastShadowExitVoid: outcome?.reason || "position_visible"
      });
      console.log(`SHADOW_EXIT_UNVERIFIED_STILL_OPEN reason=${outcome?.reason || "position_visible"}`);
      process.exit(0);
    }
    const open = {
      state: "open",
      side: state.entrySide,
      qty: Number(state.qty),
      entryPx: Number(state.entryPx),
      entrySweep: Number(state.entrySweep),
      entryId: state.entryId || null,
      lastExitVoid: outcome?.reason || "position_visible",
      realizedScoreEst: Number(state.realizedScoreEst || 0),
      entryFeeEst: Number(state.entryFeeEst || (0.01 * Number(state.qty) * Number(state.entryPx))),
      uncertainEntries: uncertainEntries(state)
    };
    await setState(open);
    console.log(`EXIT_UNVERIFIED_RECOVERED_OPEN reason=${outcome?.reason || "position_visible"}`);
    state = open;
  } else if (outcome?.outcome === "settled") {
    const close = realizedCloseDelta(state, outcome, latest.px);
    if (!close) throw new Error("EXIT_UNVERIFIED_REALIZED_ACCOUNTING_INVALID");
    await setState({
      state: "idle",
      cooldownUntilSweep: Number(latest.n) + 1,
      lastClosedId: state.id,
      realizedScoreEst: Number(state.realizedScoreEst || 0) + close.delta,
      uncertainEntries: state.closingShadowId
        ? removeUncertainEntry(state, state.closingShadowId)
        : uncertainEntries(state)
    });
    console.log("EXIT_UNVERIFIED_RECOVERED_CLOSED");
    process.exit(0);
  } else if (
    (outcome?.outcome === "ambiguous_omitted" || !outcome) &&
    Number(latest.n) >= Number(state.acceptedAtSweep || latest.n) + 2
  ) {
    if (state.closingShadowId) {
      await setState({
        state: "idle",
        cooldownUntilSweep: Number(latest.n) + 1,
        realizedScoreEst: Number(state.realizedScoreEst || 0),
        uncertainEntries: uncertainEntries(state),
        lastAmbiguousExitId: state.id
      });
      console.log(`SHADOW_EXIT_UNVERIFIED_WAIT shadow=${state.closingShadowId} exit=${state.id}`);
      process.exit(0);
    }
    const entries = uncertainEntries(state);
    const shadowId = state.entryId || `open-before-${state.id}`;
    if (!entries.some((x) => x.id === shadowId)) {
      entries.push({
        id: shadowId,
        side: state.entrySide,
        qty: Number(state.qty),
        entryPx: Number(state.entryPx),
        acceptedAtSweep: Number(state.entrySweep || state.acceptedAtSweep || latest.n),
        exitAmbiguousId: state.id
      });
    }
    const env = uncertaintyEnvelope({ uncertainEntries: entries });
    await setState({
      state: "idle",
      cooldownUntilSweep: Number(latest.n) + 1,
      realizedScoreEst: Number(state.realizedScoreEst || 0),
      uncertainEntries: entries,
      lastAmbiguousExitId: state.id
    });
    console.log(`EXIT_UNVERIFIED_SHADOWED id=${state.id} qty=${Number(state.qty).toFixed(2)} lo=${env.lo.toFixed(2)} hi=${env.hi.toFixed(2)}`);
    process.exit(0);
  } else {
    console.log("EXIT_UNVERIFIED_WAIT");
    process.exit(0);
  }
}

if (state.state === "open") {
  const tacticalExit = tacticalExitDecision(state, realNvdaSignal, latest, race, catalyst);
  if (tacticalExit?.exit) {
    console.log(`TACTICAL_EXIT reason=${tacticalExit.reason} net=${tacticalExit.net.toFixed(2)} trend=${tacticalExit.trend.label}`);
    await postExit(state, latest);
    process.exit(0);
  }
  const addDecision = scaleInDecision(state, realNvdaSignal, latest, race, catalyst);
  if (addDecision) {
    const added = await postScaleIn(addDecision, latest, state);
    if (added) {
      console.log(`SCALE_IN side=${addDecision.side} qty=${Number(addDecision.qty).toFixed(2)} reason=${addDecision.reason} totalBefore=${Number(state.qty).toFixed(2)}`);
      process.exit(0);
    }
  }
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
    console.log(`HOLD tactical=${tacticalExit?.reason || "na"} net=${Number.isFinite(tacticalExit?.net) ? tacticalExit.net.toFixed(2) : "na"}`);
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

const confirmedShadowActions = uncertainEntries(state)
  .filter((x) => x.confirmedOutcome === "settled")
  .map((entry) => ({ entry, decision: confirmedShadowExitDecision(entry, realNvdaSignal, latest, race, catalyst) }))
  .filter((x) => x.decision?.exit)
  .sort((a, b) => {
    const riskReason = (reason) => /stop|capital_release|breakout|breakdown|reversal/.test(String(reason || ""));
    const ar = riskReason(a.decision.reason);
    const br = riskReason(b.decision.reason);
    if (ar !== br) return ar ? -1 : 1;
    return ar
      ? Number(a.decision.net) - Number(b.decision.net)
      : Number(b.decision.net) - Number(a.decision.net);
  });

if (confirmedShadowActions.length) {
  const { entry, decision: shadowDecision } = confirmedShadowActions[0];
  console.log(
    `CONFIRMED_SHADOW_EXIT id=${entry.id} side=${entry.side} qty=${Number(entry.qty).toFixed(2)} ` +
    `entry=${Number(entry.entryPx).toFixed(2)} mark=${Number(latest.px).toFixed(2)} net=${shadowDecision.net.toFixed(2)} ` +
    `reason=${shadowDecision.reason} trend=${shadowDecision.trend.label}`
  );
  await postExit({
    state: "open",
    side: entry.side,
    qty: Number(entry.qty),
    entryPx: Number(entry.entryPx),
    entrySweep: Number(entry.confirmedAtSweep || entry.acceptedAtSweep || latest.n),
    entryId: entry.id,
    closingShadowId: entry.id,
    realizedScoreEst: Number(state.realizedScoreEst || 0),
    entryFeeEst: Number.isFinite(Number(entry.entryFeeEst))
      ? Number(entry.entryFeeEst)
      : 0.01 * Number(entry.qty) * Number(entry.entryPx),
    uncertainEntries: uncertainEntries(state)
  }, latest);
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
const activeDecision = activeContestEntry(realNvdaSignal, latest, race, catalyst);
const aggressiveDecision = aggressiveDirectionalEntry(realNvdaSignal, latest, race, catalyst);
const tacticalDecision = activeDecision || aggressiveDecision || tacticalRangeEntry(realNvdaSignal, latest, race, catalyst) || rawDecision;
const fallbackDecision = controlledFallbackEntry(
  tacticalDecision,
  race,
  distinct,
  positions,
  latest
);
const realConfirmedDecision = applyRealNvdaSignal(
  tacticalDecision,
  realNvdaSignal,
  race,
  distinct,
  latest
);
const calendarDecision = applyCalendarRiskGate(realConfirmedDecision, realNvdaSignal, race, catalyst);
const sizedDecision = applyRaceSizing(calendarDecision, race, latest.px);
const decision = applyUncertainRiskCap(sizedDecision, state, latest.px);
if (decision?.action === "enter") {
  console.log(
    `RACE_SIZE leaderGap=${decision.race?.leaderGap ?? "na"} hLeft=${decision.race?.hoursRemaining ?? "na"} mult=${decision.race?.multiplier ?? "na"} qty=${Number(decision.qty).toFixed(2)}`
  );
  await postEntry(decision, latest, state);
} else {
  console.log("NO_TRADE");
}
