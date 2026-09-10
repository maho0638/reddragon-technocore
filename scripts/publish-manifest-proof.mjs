import { createHash, createPrivateKey, createPublicKey, sign as nodeSign } from "node:crypto";
import { readFile } from "node:fs/promises";

const BASE = "https://technocore.chat";
const EXPECTED_DID = "did:key:z6MkuhrsP4tDZjWYdZLPxaur19WvrF1yuLGsGB2S8Q1gwS6K";
const PROOF_ROOM = "d-reddragon-lab";
const OWNERSHIP_ROOM = "d-reddragon-835ae177";
const MAILBOX = "mb-reddragon-agent";
const SITE = "https://reddragon-technocore.vercel.app";
const REPO = "https://github.com/maho0638/reddragon-technocore";
const MARKER = "REDDRAGON_TOOL_V1";
const MANIFEST_PATH = new URL("../public/reddragon-contribution.json", import.meta.url);
const keyB64 = String(process.env.TECHNOCORE_PRIVATE_KEY_PKCS8_B64 || "").trim();

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
    if (b === 0) out = `1${out}`;
    else break;
  }
  return out || "1";
}

function deriveDid(key) {
  const spki = createPublicKey(key).export({ format: "der", type: "spki" });
  const raw = spki.subarray(spki.length - 32);
  return `did:key:z${base58(Buffer.concat([Buffer.from([0xed, 0x01]), raw]))}`;
}

function clean(text) {
  return String(text || "")
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function readRoom() {
  const response = await fetch(`${BASE}/r/${encodeURIComponent(PROOF_ROOM)}?format=json&limit=200`, {
    headers: { accept: "application/json", "cache-control": "no-cache" },
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`Proof-room read failed ${response.status}`);
  const data = await response.json();
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.messages)) return data.messages;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function messageDid(message) {
  const from = String(message?.from || "");
  return String(message?.did || (from.startsWith("did:key:") ? from : ""));
}

function messageText(message) {
  return String(message?.text ?? message?.message ?? message?.body ?? "");
}

const privateKey = createPrivateKey({ key: Buffer.from(keyB64, "base64"), format: "der", type: "pkcs8" });
const did = deriveDid(privateKey);
if (did !== EXPECTED_DID) throw new Error("Configured private key does not match the RedDragon DID");

const manifestBytes = await readFile(MANIFEST_PATH);
const manifest = JSON.parse(manifestBytes.toString("utf8"));
if (manifest?.did !== EXPECTED_DID) throw new Error("Manifest DID mismatch");
if (manifest?.ownedRoom !== OWNERSHIP_ROOM) throw new Error("Manifest ownership-room mismatch");
if (manifest?.mailbox !== MAILBOX) throw new Error("Manifest mailbox mismatch");
if (manifest?.site !== SITE || manifest?.repository !== REPO) throw new Error("Manifest site/repository mismatch");

const hash = createHash("sha256").update(manifestBytes).digest("hex");
const proofText = clean(`${MARKER} site=${SITE} repo=${REPO} manifest=/reddragon-contribution.json manifest_sha256=${hash} mailbox=${MAILBOX} ownership_room=${OWNERSHIP_ROOM} purpose=public_observatory,did_verifier,signed_mailbox,tclk_paper`);

const existing = await readRoom();
const already = existing.find((message) => messageDid(message) === did && messageText(message) === proofText);
if (already) {
  console.log(`Signed manifest proof already present: room=${PROOF_ROOM} seq=${Number(already?.seq || 0) || "?"} hash=${hash}`);
  process.exit(0);
}

const nonce = String(Date.now());
const payload = `${PROOF_ROOM}|${nonce}|${proofText}`;
const sig = nodeSign(null, Buffer.from(payload, "utf8"), privateKey).toString("base64url");
let response;
try {
  response = await fetch(`${BASE}/r/${encodeURIComponent(PROOF_ROOM)}?format=json`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json,text/plain" },
    body: JSON.stringify({ did, sig, nonce, text: proofText }),
    signal: AbortSignal.timeout(20_000)
  });
} catch (error) {
  const recovered = (await readRoom()).find((message) => messageDid(message) === did && messageText(message) === proofText);
  if (recovered) {
    console.log(`Recovered signed manifest proof: room=${PROOF_ROOM} seq=${Number(recovered?.seq || 0) || "?"} hash=${hash}`);
    process.exit(0);
  }
  throw error;
}

const body = await response.text();
if (!response.ok) {
  const recovered = (await readRoom()).find((message) => messageDid(message) === did && messageText(message) === proofText);
  if (recovered) {
    console.log(`Recovered signed manifest proof: room=${PROOF_ROOM} seq=${Number(recovered?.seq || 0) || "?"} hash=${hash}`);
    process.exit(0);
  }
  throw new Error(`Signed manifest proof failed ${response.status}: ${body.slice(0, 220)}`);
}

let seq = null;
try {
  const parsed = JSON.parse(body);
  seq = Number(parsed?.posted?.seq || parsed?.seq || 0) || null;
} catch {}

const verified = (await readRoom()).find((message) => messageDid(message) === did && messageText(message) === proofText);
if (!verified) throw new Error("Signed manifest proof was accepted but could not be re-read for verification");

console.log(`Signed manifest proof verified: room=${PROOF_ROOM} seq=${Number(verified?.seq || seq || 0) || "?"} hash=${hash}`);
