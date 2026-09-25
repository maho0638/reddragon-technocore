import {
  createPrivateKey, createPublicKey, sign as nodeSign, createHash,
  diffieHellman, hkdfSync, createDecipheriv, createCipheriv, randomBytes
} from "node:crypto";
import { readFile } from "node:fs/promises";

const BASE = "https://technocore.chat";
const ROOM = "close1";
const STATE_ROOM = "d-reddragon-835ae177";
const STATE_MARKER = "REDDRAGON_CLOSE1_STATE_V4:";
const SEASON = "close-1";
const LOCK_MS = Date.parse("2026-10-04T09:00:00Z");
const EXPECTED_DID = "did:key:z6MkuhrsP4tDZjWYdZLPxaur19WvrF1yuLGsGB2S8Q1gwS6K";
const keyB64 = String(process.env.TECHNOCORE_PRIVATE_KEY_PKCS8_B64 || "").trim();
const execute = String(process.env.CLOSE1_EXECUTE || "false").toLowerCase() === "true";
const stateSelftest = String(process.env.CLOSE1_STATE_SELFTEST || "false").toLowerCase() === "true";
if (!keyB64) throw new Error("Missing TECHNOCORE_PRIVATE_KEY_PKCS8_B64");

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
    Buffer.from("reddragon-close1-state-v4"),
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
async function getState() {
  const messages = await readExport(STATE_ROOM);
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messageDid(messages[i]) !== did) continue;
    const state = decryptState(messageText(messages[i]));
    if (state) return state;
  }
  return { state: "idle" };
}
async function setState(state, force = false) {
  if (!execute && !force) {
    console.log(`DRY_STATE=${state.state}`);
    return;
  }
  const posted = await signedPost(STATE_ROOM, encryptState(state));
  if (!posted.seq) throw new Error("STATE_POST_UNCONFIRMED");
  console.log(`STATE=${state.state} seq=${posted.seq}`);
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
      b.taker !== "any"
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

async function postEntry(decision, latest) {
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
    entrySweep: Number(latest.n)
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
    requestedAtSweep: Number(latest.n)
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
console.log(
  `STATUS execute=${execute} n=${latest.n} ref=${latest.px} state=${state.state} ownTopPos=${ownPos ?? "na"}`
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
      lastPreflight: state.id
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
    console.log("ENTRY_VOID");
    process.exit(0);
  }
  if (outcome?.outcome === "settled" || topEvidence) {
    const open = {
      state: "open",
      side: state.side,
      qty: Number(state.qty),
      entryPx: Number(state.entryPx),
      entrySweep: outcome?.n || Number(state.acceptedAtSweep || latest.n),
      entryId: state.id
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
  throw new Error("ENTRY_OUTCOME_UNVERIFIED");
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
    exitRetryAfterSweep: Number(latest.n)
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
      lastExitVoid: outcome.reason
    };
    await setState(open);
    console.log("EXIT_VOID_REEVALUATE");
    state = open;
  } else if (outcome?.outcome === "settled" || (!topStillOpen && Number(latest.n) >= Number(state.acceptedAtSweep || latest.n) + 1)) {
    await setState({
      state: "idle",
      cooldownUntilSweep: Number(latest.n) + 2,
      lastClosedId: state.id
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
    latest
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

const decision = decide({
  now,
  mode: "entry",
  series,
  distinct,
  pnlSnapshots: pnl,
  positionSnapshots: positions,
  state,
  latest
});
if (decision?.action === "enter") {
  await postEntry(decision, latest);
} else {
  console.log("NO_TRADE");
}
