import {
  createPrivateKey,
  createPublicKey,
  sign as nodeSign,
  verify as nodeVerify
} from "node:crypto";

const BASE = "https://technocore.chat";
const ROOM = "mb-sonnet-2-registration";
const CONTEST_ID = "sonnet-2";
const ROLE = "writer";
const X_ACCOUNT_URL = "https://x.com/joannawolker";
const REQUEST_ID = "reddragon-sonnet2-writer-register-v1";
const EXPECTED_DID = "did:key:z6MkuhrsP4tDZjWYdZLPxaur19WvrF1yuLGsGB2S8Q1gwS6K";
const REFEREE_DID = "did:key:z6MkowHQwsx9xr84WbWN3YCnKutyBnBXkT1ChKY4uEAAMzte";
const LAUNCH_URL = "https://raw.githubusercontent.com/flop-labs/technocore-sonnet-challenge/main/LAUNCH.md";
const OPEN_MS = Date.parse("2026-09-11T12:00:00Z");
const CLOSE_MS = Date.parse("2026-09-18T12:00:00Z");

const keyB64 = String(process.env.TECHNOCORE_PRIVATE_KEY_PKCS8_B64 || "").trim();
if (!keyB64) throw new Error("Missing TECHNOCORE_PRIVATE_KEY_PKCS8_B64");

const privateKey = createPrivateKey({
  key: Buffer.from(keyB64, "base64"),
  format: "der",
  type: "pkcs8"
});
const did = deriveDid(privateKey);
if (did !== EXPECTED_DID) {
  throw new Error(`Refusing contest registration: secret derives ${did}, expected ${EXPECTED_DID}`);
}

const registration = JSON.stringify({
  type: "sonnet.register.v1",
  contest_id: CONTEST_ID,
  role: ROLE,
  x_account_url: X_ACCOUNT_URL,
  request_id: REQUEST_ID
});

console.log(`Sonnet-2 registration identity: ${did}`);
console.log(`Role: ${ROLE}; X: ${X_ACCOUNT_URL}; request_id: ${REQUEST_ID}`);

function base58Encode(bytes) {
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

function base58Decode(text) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const index = new Map([...alphabet].map((c, i) => [c, BigInt(i)]));
  let x = 0n;
  for (const c of text) {
    if (!index.has(c)) throw new Error("Invalid base58 character");
    x = x * 58n + index.get(c);
  }
  const bytes = [];
  while (x > 0n) {
    bytes.push(Number(x & 255n));
    x >>= 8n;
  }
  bytes.reverse();
  let leading = 0;
  for (const c of text) {
    if (c === "1") leading += 1;
    else break;
  }
  return Buffer.concat([Buffer.alloc(leading), Buffer.from(bytes)]);
}

function deriveDid(key) {
  const spki = createPublicKey(key).export({ format: "der", type: "spki" });
  const raw = spki.subarray(spki.length - 32);
  return `did:key:z${base58Encode(Buffer.concat([Buffer.from([0xed, 0x01]), raw]))}`;
}

function publicKeyFromDid(value) {
  if (!value.startsWith("did:key:z")) throw new Error("Unsupported DID");
  const decoded = base58Decode(value.slice("did:key:z".length));
  if (decoded.length !== 34 || decoded[0] !== 0xed || decoded[1] !== 0x01) {
    throw new Error("DID is not an Ed25519 did:key");
  }
  const raw = decoded.subarray(2);
  const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
  return createPublicKey({ key: Buffer.concat([spkiPrefix, raw]), format: "der", type: "spki" });
}

function messageDid(item) {
  const from = String(item?.from || "");
  return String(item?.did || (from.startsWith("did:key:") ? from : ""));
}

function messageText(item) {
  return String(item?.text ?? item?.message ?? item?.body ?? "");
}

function messagesFrom(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.messages)) return data.messages;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function parseJson(text) {
  try { return JSON.parse(String(text || "")); }
  catch { return null; }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url, options = {}, attempts = 4) {
  let lastError;
  for (let i = 1; i <= attempts; i++) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20_000) });
      const text = await response.text();
      if (response.ok || (response.status < 500 && response.status !== 429)) {
        return { response, text };
      }
      lastError = new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
    } catch (error) {
      lastError = error;
    }
    if (i < attempts) await sleep(i * 1500);
  }
  throw lastError || new Error("Request failed");
}

async function verifyOfficialLaunch() {
  const { response, text } = await fetchText(LAUNCH_URL, { headers: { accept: "text/plain" } });
  if (!response.ok) throw new Error(`Could not read official launch record: ${response.status}`);
  const required = [
    "Official launch record — sonnet-2",
    REFEREE_DID,
    "mb-sonnet-2-registration",
    "2026-09-11T12:00:00Z",
    "2026-09-18T12:00:00Z"
  ];
  for (const needle of required) {
    if (!text.includes(needle)) throw new Error(`Official launch record no longer matches expected Sonnet-2 config: missing ${needle}`);
  }
  const now = Date.now();
  if (now < OPEN_MS) throw new Error("Sonnet-2 has not opened yet");
  if (now >= CLOSE_MS) throw new Error("Sonnet-2 registration window has closed");
  console.log("Official Sonnet-2 launch record verified against FLOP Labs GitHub.");
}

async function readRegistrationRoom() {
  for (const limit of [500, 200]) {
    const { response, text } = await fetchText(`${BASE}/r/${ROOM}?format=json&limit=${limit}`, {
      headers: { accept: "application/json" }
    });
    if (!response.ok) {
      if (limit === 500 && response.status === 400) continue;
      throw new Error(`Registration-room read failed ${response.status}: ${text.slice(0, 500)}`);
    }
    try { return messagesFrom(JSON.parse(text)); }
    catch { throw new Error("Technocore returned invalid registration-room JSON"); }
  }
  return [];
}

function verifyRefereeMessage(item) {
  if (messageDid(item) !== REFEREE_DID) return false;
  const nonce = String(item?.nonce || "");
  const sig = String(item?.sig || item?.signature || "");
  const text = messageText(item);
  if (!nonce || !sig || !text) return false;
  try {
    const payload = `${ROOM}|${nonce}|${text}`;
    return nodeVerify(null, Buffer.from(payload, "utf8"), publicKeyFromDid(REFEREE_DID), Buffer.from(sig, "base64url"));
  } catch {
    return false;
  }
}

function findReceipt(messages) {
  const candidates = [];
  for (const item of messages) {
    if (messageDid(item) !== REFEREE_DID) continue;
    const body = parseJson(messageText(item));
    if (!body || body.type !== "sonnet.receipt.v1" || body.request_id !== REQUEST_ID) continue;
    candidates.push({ item, body });
  }
  candidates.sort((a, b) => Number(b.item?.seq || 0) - Number(a.item?.seq || 0));
  return candidates[0] || null;
}

function ownRegistrationExists(messages) {
  return messages.some((item) => {
    if (messageDid(item) !== did) return false;
    const body = parseJson(messageText(item));
    return body?.type === "sonnet.register.v1" && body?.contest_id === CONTEST_ID && body?.request_id === REQUEST_ID;
  });
}

async function postRegistration() {
  const nonce = String(Date.now());
  const payload = `${ROOM}|${nonce}|${registration}`;
  const sig = nodeSign(null, Buffer.from(payload, "utf8"), privateKey).toString("base64url");
  const { response, text } = await fetchText(`${BASE}/r/${ROOM}?format=json`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json,text/plain" },
    body: JSON.stringify({ did, sig, nonce, text: registration })
  }, 1);
  if (!response.ok) throw new Error(`Writer registration post failed ${response.status}: ${text.slice(0, 1000)}`);
  console.log(`Writer registration submitted to ${ROOM}.`);
}

function reportReceipt(receipt) {
  const { item, body } = receipt;
  if (!verifyRefereeMessage(item)) {
    throw new Error(`Found receipt seq ${item?.seq || "?"}, but referee signature verification failed`);
  }
  const status = String(body.status || body.result || "").toUpperCase();
  console.log(`Verified referee receipt seq ${item?.seq || "?"}: ${JSON.stringify(body)}`);
  if (["ACCEPTED", "OK", "REGISTERED"].includes(status)) {
    if (body.role && body.role !== ROLE) throw new Error(`Receipt role mismatch: ${body.role}`);
    console.log("SONNET2_WRITER_REGISTERED=true");
    return true;
  }
  if (["REJECTED", "REFUSED", "DENIED", "ERROR"].includes(status)) {
    throw new Error(`Sonnet-2 writer registration was rejected: ${JSON.stringify(body)}`);
  }
  console.log(`Receipt status is ${status || "unspecified"}; leaving registration pending.`);
  return false;
}

await verifyOfficialLaunch();

let messages = await readRegistrationRoom();
let receipt = findReceipt(messages);
if (receipt) {
  reportReceipt(receipt);
  process.exit(0);
}

if (!ownRegistrationExists(messages)) {
  await postRegistration();
} else {
  console.log("Matching writer registration request already exists; not posting a duplicate.");
}

// Intake can lag during bursts. Poll briefly now; future scheduled agent runs will
// continue checking the same stable request_id without creating duplicate requests.
for (let attempt = 1; attempt <= 9; attempt++) {
  await sleep(attempt === 1 ? 3000 : 8000);
  messages = await readRegistrationRoom();
  receipt = findReceipt(messages);
  if (receipt) {
    reportReceipt(receipt);
    process.exit(0);
  }
  console.log(`Receipt pending (${attempt}/9).`);
}

console.log("Writer registration is submitted and awaiting the signed referee receipt. This is a delay, not a rejection.");
