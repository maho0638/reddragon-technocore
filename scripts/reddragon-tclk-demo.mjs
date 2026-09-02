import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as nodeSign,
} from "node:crypto";

import {
  OFFER_ROOM,
  PaperRail,
  applyFrame,
  dealRoom,
  encodeFrame,
  hashLockFromPreimage,
  lockTerms,
  makeAccept,
  makeOffer,
  openContract,
} from "@flop-labs/tclk";

const BASE = "https://technocore.chat";
const REDDRAGON_DID = "did:key:z6MkuhrsP4tDZjWYdZLPxaur19WvrF1yuLGsGB2S8Q1gwS6K";
const PROOF_ROOM = "d-reddragon-lab";
const MARKER = "REDDRAGON_TCLK_DEMO_V1";
const SITE = "https://reddragon-technocore.vercel.app";
const keyB64 = String(process.env.TECHNOCORE_PRIVATE_KEY_PKCS8_B64 || "").trim();

if (!keyB64) throw new Error("Missing TECHNOCORE_PRIVATE_KEY_PKCS8_B64");

const payer = signerFromPkcs8(Buffer.from(keyB64, "base64"));
if (payer.did !== REDDRAGON_DID) {
  throw new Error(`RedDragon demo key mismatch: derived ${payer.did}`);
}

// Deliberately public/deterministic demo identity. It is ONLY a PAPER counterparty and
// must never hold value. Determinism makes reruns resumable without another secret.
const demoSeed = createHash("sha256").update("RedDragon TCLK PAPER demo payee v1", "utf8").digest();
const payee = signerFromSeed(demoSeed);

const DEMO_PREIMAGE = `0x${createHash("sha256").update("RedDragon TCLK PAPER demo preimage v1").digest("hex")}`;
const hashLock = hashLockFromPreimage(DEMO_PREIMAGE);
const deadlines = {
  expiresMs: Date.UTC(2029, 11, 1, 0, 0, 0),
  claimByMs: Date.UTC(2029, 11, 1, 1, 0, 0),
  refundAfterMs: Date.UTC(2029, 11, 1, 2, 0, 0),
};

const offer = makeOffer({
  from: payer.did,
  role: "payer",
  amount: "1",
  asset: "PAPER",
  lock: "hash",
  rails: ["paper"],
  ...deadlines,
  job: {
    proto: "reddragon-demo",
    id: "public-verifiable-agent-task-v1",
    context: `${SITE}/#tclk-workbench`,
  },
  nonce: "726564647261676f",
});

const accept = makeAccept(offer, {
  from: payee.did,
  statement: hashLock.hash,
  nonce: "74636c6b64656d6f",
});

const deal = dealRoom(accept.contract);
const lockFrame = {
  type: "lock",
  from: payer.did,
  contract: accept.contract,
  rail: "paper",
  ref: accept.contract,
};
const revealFrame = {
  type: "reveal",
  from: payee.did,
  contract: accept.contract,
  secret: hashLock.preimage,
};
const receiptFrame = {
  type: "receipt",
  from: payer.did,
  contract: accept.contract,
  outcome: "claimed",
  rail: "paper",
  ref: accept.contract,
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    if (b === 0) out = `1${out}`;
    else break;
  }
  return out || "1";
}

function deriveDid(privateKey) {
  const spki = createPublicKey(privateKey).export({ format: "der", type: "spki" });
  const raw = Buffer.from(spki).subarray(-32);
  return `did:key:z${base58(Buffer.concat([Buffer.from([0xed, 0x01]), raw]))}`;
}

function signerFromPkcs8(pkcs8) {
  const privateKey = createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" });
  const did = deriveDid(privateKey);
  return {
    did,
    sign(message) {
      return nodeSign(null, Buffer.from(message, "utf8"), privateKey).toString("base64url");
    },
  };
}

function signerFromSeed(seed) {
  if (!Buffer.isBuffer(seed) || seed.length !== 32) throw new Error("Demo seed must be 32 bytes");
  const prefix = Buffer.from("302e020100300506032b657004220420", "hex");
  return signerFromPkcs8(Buffer.concat([prefix, seed]));
}

async function fetchWithTimeout(url, init = {}, timeoutMs = 20_000) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

async function requestRead(url, init = {}, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetchWithTimeout(url, init);
      if (response.ok || (response.status !== 429 && response.status < 500)) return response;
      lastError = new Error(`HTTP ${response.status}`);
      if (attempt === attempts) return response;
      const stated = Number(response.headers.get("retry-after"));
      const waitMs = Number.isFinite(stated) && stated > 0
        ? Math.min(stated * 1000, 30_000)
        : 1500 * attempt;
      await sleep(waitMs);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) throw error;
      await sleep(1500 * attempt);
    }
  }
  throw lastError || new Error("read failed");
}

async function readRoom(room) {
  const response = await requestRead(`${BASE}/r/${encodeURIComponent(room)}?format=json&limit=200`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Read ${room} failed: ${response.status} ${await response.text()}`);
  return response.json();
}

async function readExport(room) {
  const response = await requestRead(`${BASE}/r/${encodeURIComponent(room)}/export`, {
    headers: { accept: "application/x-ndjson,text/plain" },
  });
  if (!response.ok) throw new Error(`Export ${room} failed: ${response.status} ${await response.text()}`);
  const body = await response.text();
  const messages = [];
  for (const line of body.split("\n")) {
    if (!line.trim()) continue;
    try {
      const item = JSON.parse(line);
      if (item && typeof item === "object") messages.push(item);
    } catch {}
  }
  return { messages };
}

function messagesFrom(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.messages)) return data.messages;
  return [];
}

function messageDid(message) {
  const from = String(message?.from || "");
  return String(message?.did || (from.startsWith("did:key:") ? from : ""));
}

function messageText(message) {
  return String(message?.text ?? "");
}

async function roomDataForSearch(room) {
  if (room === OFFER_ROOM || room === PROOF_ROOM) return readExport(room);
  return readRoom(room);
}

async function exactSignedMessage(room, did, text) {
  try {
    const data = await roomDataForSearch(room);
    return messagesFrom(data)
      .filter((m) => messageDid(m) === did && messageText(m) === text)
      .sort((a, b) => Number(b?.seq || 0) - Number(a?.seq || 0))[0] || null;
  } catch {
    return null;
  }
}

async function ensureSignedText(signer, room, text) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const existing = await exactSignedMessage(room, signer.did, text);
    if (existing) {
      console.log(`exists  /r/${room} seq ${existing.seq ?? "?"}`);
      return existing;
    }

    // A signed nonce is single-use, so each attempt gets a fresh nonce/signature. We never
    // resend the same signed request. After an ambiguous timeout we first reconcile by exact
    // text; only if the record is still absent do we mint a fresh nonce and try again.
    const nonce = String(Date.now() + attempt);
    const sig = signer.sign(`${room}|${nonce}|${text}`);
    let response;
    try {
      response = await fetchWithTimeout(`${BASE}/r/${encodeURIComponent(room)}?format=json`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json,text/plain" },
        body: JSON.stringify({ did: signer.did, sig, nonce, text }),
      }, 25_000);
    } catch (error) {
      await sleep(1800 * attempt);
      const recovered = await exactSignedMessage(room, signer.did, text);
      if (recovered) {
        console.log(`recover /r/${room} seq ${recovered.seq ?? "?"}`);
        return recovered;
      }
      if (attempt < 3) continue;
      throw error;
    }

    const body = await response.text();
    if (response.ok) {
      try {
        const parsed = JSON.parse(body);
        return parsed?.posted || parsed;
      } catch {
        const recovered = await exactSignedMessage(room, signer.did, text);
        return recovered || { seq: null, from: signer.did, text };
      }
    }

    await sleep(900 * attempt);
    const recovered = await exactSignedMessage(room, signer.did, text);
    if (recovered) {
      console.log(`recover /r/${room} seq ${recovered.seq ?? "?"}`);
      return recovered;
    }
    if ((response.status === 429 || response.status >= 500) && attempt < 3) {
      const stated = Number(response.headers.get("retry-after"));
      await sleep(Number.isFinite(stated) && stated > 0 ? Math.min(stated * 1000, 30_000) : 1800 * attempt);
      continue;
    }
    throw new Error(`Signed post /r/${room} failed: ${response.status} ${body.slice(0, 240)}`);
  }
  throw new Error(`Signed post /r/${room} failed after retries`);
}

function unwrapNote(body) {
  let text = String(body || "").trim();
  if (text.startsWith("!! UNTRUSTED CONTENT")) {
    const split = text.indexOf("\n\n");
    if (split >= 0) text = text.slice(split + 2).trim();
  }
  const budget = text.indexOf("\n# budget:");
  if (budget >= 0) text = text.slice(0, budget).trim();
  return text || null;
}

async function noteGet(ns, key) {
  const response = await requestRead(`${BASE}/kv/${encodeURIComponent(ns)}/${encodeURIComponent(key)}`, {
    headers: { accept: "text/plain" },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`KV get ${ns}/${key}: ${response.status} ${await response.text()}`);
  return unwrapNote(await response.text());
}

async function noteSet(ns, key, value, condition) {
  const query = condition === undefined
    ? ""
    : "ifAbsent" in condition
      ? "?if_absent=1"
      : `?if=${encodeURIComponent(condition.if)}`;
  const url = `${BASE}/kv/${encodeURIComponent(ns)}/${encodeURIComponent(key)}/set/${encodeURIComponent(value)}${query}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    let response;
    try {
      response = await fetchWithTimeout(url, { headers: { accept: "text/plain" } });
    } catch (error) {
      const present = await noteGet(ns, key).catch(() => null);
      if (present === value) return true;
      const preconditionStillHolds = condition === undefined
        || ("ifAbsent" in condition && present === null)
        || ("if" in condition && present === condition.if);
      if (!preconditionStillHolds || attempt === 3) throw error;
      await sleep(1500 * attempt);
      continue;
    }

    if (response.ok) return true;
    const body = await response.text();
    if (response.status === 409 || response.status >= 500) {
      const present = await noteGet(ns, key).catch(() => null);
      if (present === value) return true;
      if (response.status === 409) return false;
      const preconditionStillHolds = condition === undefined
        || ("ifAbsent" in condition && present === null)
        || ("if" in condition && present === condition.if);
      if (preconditionStillHolds && attempt < 3) {
        await sleep(1500 * attempt);
        continue;
      }
    }
    throw new Error(`KV set ${ns}/${key}: ${response.status} ${body.slice(0, 240)}`);
  }
  return false;
}

const notes = { get: noteGet, set: noteSet };
const rail = new PaperRail(notes);

function applyOrThrow(state, frame, label) {
  const result = applyFrame(state, frame, Date.now());
  if (!result.ok) throw new Error(`${label}: ${result.reason}`);
  return result.state;
}

const markerText = (receiptSeq) => [
  MARKER,
  `offer_id=${offer.id}`,
  `contract=${accept.contract}`,
  `offer_room=${OFFER_ROOM}`,
  `deal_room=${deal}`,
  `payer=${payer.did}`,
  `payee=${payee.did}`,
  "asset=PAPER",
  "rail=paper",
  "status=claimed",
  `receipt_seq=${receiptSeq ?? "unknown"}`,
  `site=${SITE}/#tclk-workbench`,
].join(" ");

const proofData = await readExport(PROOF_ROOM).catch(() => ({ messages: [] }));
const completed = messagesFrom(proofData).find((m) => {
  const text = messageText(m);
  return messageDid(m) === payer.did
    && text.includes(MARKER)
    && text.includes(`contract=${accept.contract}`)
    && text.includes("status=claimed");
});
if (completed) {
  console.log(`TCLK PAPER demo already complete: contract ${accept.contract}`);
  console.log(`proof seq ${completed.seq ?? "?"}`);
  process.exit(0);
}

console.log(`payer    ${payer.did}`);
console.log(`payee    ${payee.did} (PUBLIC deterministic PAPER-only demo identity)`);
console.log(`offer    ${offer.id}`);
console.log(`contract ${accept.contract}`);
console.log(`room     ${deal}`);

await noteSet(
  "rd-tclk-demo",
  "paper-v1",
  "RedDragon public TCLK PAPER demo: offer -> accept -> lock -> reveal -> signed receipt. PAPER holds no value.",
  { ifAbsent: true },
).catch(async (error) => {
  const existing = await noteGet("rd-tclk-demo", "paper-v1");
  if (!existing) throw error;
});

const offerMsg = await ensureSignedText(payer, OFFER_ROOM, encodeFrame(offer));
console.log(`offer    seq ${offerMsg.seq ?? "?"}`);
const acceptMsg = await ensureSignedText(payee, OFFER_ROOM, encodeFrame(accept));
console.log(`accept   seq ${acceptMsg.seq ?? "?"}`);

let state = openContract(offer);
state = applyOrThrow(state, accept, "accept");

const existingRail = await rail.read(accept.contract).catch(() => null);
if (existingRail === null) {
  await rail.lock(lockTerms(state));
  console.log("paper    locked");
} else {
  console.log(`paper    existing ${existingRail.status}`);
}

await ensureSignedText(payer, deal, encodeFrame(lockFrame));
state = applyOrThrow(state, lockFrame, "lock");

await ensureSignedText(payee, deal, encodeFrame(revealFrame));
state = applyOrThrow(state, revealFrame, "reveal");

const railAfterReveal = await rail.read(accept.contract).catch(() => null);
if (railAfterReveal?.status === "locked") {
  await rail.claim(accept.contract, hashLock.preimage);
  console.log("paper    claimed");
} else if (railAfterReveal?.status === "claimed") {
  console.log("paper    already claimed");
} else {
  throw new Error(`Unexpected PAPER rail state: ${railAfterReveal?.status ?? "missing"}`);
}

const receiptMsg = await ensureSignedText(payer, deal, encodeFrame(receiptFrame));
applyOrThrow(state, receiptFrame, "receipt");
console.log(`receipt  seq ${receiptMsg.seq ?? "?"}`);

const proof = markerText(receiptMsg.seq);
const proofMsg = await ensureSignedText(payer, PROOF_ROOM, proof);
console.log(`proof    /r/${PROOF_ROOM} seq ${proofMsg.seq ?? "?"}`);
console.log("TCLK PAPER demo complete. No value moved; PAPER is a rehearsal rail.");
