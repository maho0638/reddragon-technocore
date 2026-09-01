import { createHash, createPrivateKey, createPublicKey, sign as nodeSign } from "node:crypto";
import { readFile } from "node:fs/promises";

const BASE = "https://technocore.chat";
const configuredDid = (process.env.TECHNOCORE_DID || "").trim();
const keyB64 = (process.env.TECHNOCORE_PRIVATE_KEY_PKCS8_B64 || "").trim();
const room = (process.env.TECHNOCORE_AGENT_ROOM || "lobby").trim();
const message = clean(process.env.TECHNOCORE_AGENT_MESSAGE || "RedDragon agent check-in");
const postEnabled = String(process.env.TECHNOCORE_POST_ENABLED || "false").toLowerCase() === "true";
const minPostHours = Math.max(0.5, Number(process.env.TECHNOCORE_MIN_POST_HOURS || "12"));
const contributionRoom = (process.env.TECHNOCORE_CONTRIBUTION_ROOM || "d-reddragon-lab").trim();
const mailbox = (process.env.TECHNOCORE_AGENT_MAILBOX || "mb-reddragon-agent").trim();
const siteUrl = clean(process.env.TECHNOCORE_TOOL_URL || "https://reddragon-technocore.vercel.app");
const repoUrl = clean(process.env.TECHNOCORE_TOOL_REPO || "https://github.com/maho0638/reddragon-technocore");
const contributionMarker = "REDDRAGON_TOOL_V1";
const mailboxMarker = "REDDRAGON_MAILBOX_V1";
const manifestPath = new URL("../public/reddragon-contribution.json", import.meta.url);
const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,47}$/;
const OWNED_ROOM_RE = /^d-[a-z0-9][a-z0-9_-]{0,45}$/;
const MAILBOX_RE = /^mb-[a-z0-9][a-z0-9_-]{0,44}$/;

if (!keyB64) throw new Error("Missing TECHNOCORE_PRIVATE_KEY_PKCS8_B64");
if (!NAME_RE.test(room)) throw new Error("Invalid TECHNOCORE_AGENT_ROOM");
if (!OWNED_ROOM_RE.test(contributionRoom)) throw new Error("Invalid TECHNOCORE_CONTRIBUTION_ROOM");
if (!MAILBOX_RE.test(mailbox)) throw new Error("Invalid TECHNOCORE_AGENT_MAILBOX");
if (!message) throw new Error("Missing TECHNOCORE_AGENT_MESSAGE");
if (message.length > 4096) throw new Error("TECHNOCORE_AGENT_MESSAGE is too long");

const privateKey = createPrivateKey({ key: Buffer.from(keyB64, "base64"), format: "der", type: "pkcs8" });
const did = deriveDid(privateKey);
if (configuredDid && configuredDid !== did) {
  throw new Error("Configured TECHNOCORE_DID does not match the private key");
}
const fingerprint = createHash("sha256").update(did, "utf8").digest("hex").slice(0, 16);
const heartbeatKey = `hb-${fingerprint}`;
console.log(`Agent identity: ${did} (${fingerprint})`);

function clean(text) {
  return String(text || "")
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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
  if (!Buffer.isBuffer(spki) || spki.length < 32) throw new Error("Could not derive Ed25519 public key");
  const raw = spki.subarray(spki.length - 32);
  const prefixed = Buffer.concat([Buffer.from([0xed, 0x01]), raw]);
  return `did:key:z${base58(prefixed)}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(url, options = {}, attempts = 5) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const r = await fetch(url, { ...options, signal: AbortSignal.timeout(20_000) });
      const text = await r.text();
      if (r.ok || (r.status < 500 && r.status !== 429)) return { r, text };

      const retryAfter = Number(r.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 60_000)
        : attempt * 2000;
      lastError = new Error(`HTTP ${r.status}: ${text.slice(0, 300)}`);
      if (attempt < attempts) await sleep(waitMs);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(attempt * 2000);
    }
  }
  throw lastError || new Error("Request failed");
}

async function getRoomByName(targetRoom, allowMissing = false) {
  const { r, text } = await request(`${BASE}/r/${encodeURIComponent(targetRoom)}?format=json&limit=200`, {
    headers: { accept: "application/json" }
  });
  if (allowMissing && r.status === 404) return { messages: [] };
  if (!r.ok) throw new Error(`Read failed ${r.status}: ${text}`);
  try { return JSON.parse(text); } catch { throw new Error("Technocore returned invalid room JSON"); }
}

async function getRoom() {
  return getRoomByName(room, false);
}

function messagesFrom(data) {
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

function lastSeq(messages) {
  return messages.reduce((max, m) => Math.max(max, Number(m?.seq || 0)), 0);
}

function recentOwnMessage(messages) {
  const own = messages.filter((m) => m?.from === did || m?.did === did);
  if (!own.length) return null;
  const latest = own[own.length - 1];
  const rawTs = latest?.ts || latest?.timestamp || latest?.createdAt || latest?.time || "";
  const ts = Date.parse(rawTs);
  return Number.isFinite(ts) ? { ...latest, tsMs: ts } : latest;
}

function unwrapTechnocoreNote(value) {
  if (typeof value !== "string") return value;
  let text = value.trim();

  if (text.startsWith("!! UNTRUSTED CONTENT")) {
    const split = text.indexOf("\n\n");
    if (split >= 0) text = text.slice(split + 2).trim();
  }

  const budgetFooter = text.indexOf("\n# budget:");
  if (budgetFooter >= 0) text = text.slice(0, budgetFooter).trim();

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }
  return text;
}

function parseMaybeJson(value) {
  if (typeof value !== "string") return value;
  const trimmed = String(unwrapTechnocoreNote(value) || "").trim();
  if (!trimmed) return null;
  try { return JSON.parse(trimmed); } catch { return trimmed; }
}

function normalizeHeartbeatState(raw) {
  let value = parseMaybeJson(raw);
  if (value && typeof value === "object" && !Array.isArray(value) && "value" in value) {
    value = parseMaybeJson(value.value);
  }
  value = parseMaybeJson(value);

  if (typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value))) {
    return { version: 2, lastRoomSeq: Number(value) || 0 };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { version: 2, lastRoomSeq: 0 };
  }

  return {
    version: 2,
    lastRoomSeq: Number(value.lastRoomSeq || value.seq || 0) || 0,
    lastHeartbeatAt: typeof value.lastHeartbeatAt === "string" ? value.lastHeartbeatAt : null,
    lastSignedAt: typeof value.lastSignedAt === "string" ? value.lastSignedAt : null,
    lastSignedSeq: Number(value.lastSignedSeq || 0) || null,
    postLockUntil: typeof value.postLockUntil === "string" ? value.postLockUntil : null
  };
}

async function readNote(ns, key) {
  const { r, text } = await request(`${BASE}/kv/${encodeURIComponent(ns)}/${encodeURIComponent(key)}`, {
    headers: { accept: "text/plain,application/json" }
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Note read failed ${r.status}: ${text}`);
  return String(unwrapTechnocoreNote(text) || "").trim();
}

async function writeNote(ns, key, value) {
  const normalized = clean(value);
  const { r, text } = await request(`${BASE}/kv/${encodeURIComponent(ns)}/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/plain,application/json" },
    body: JSON.stringify({ value: normalized })
  });
  if (!r.ok) throw new Error(`Note write failed ${r.status}: ${text}`);
}

async function readHeartbeatState() {
  const raw = await readNote(room, heartbeatKey);
  if (raw == null) return { version: 2, lastRoomSeq: 0 };
  return normalizeHeartbeatState(raw);
}

async function writeHeartbeatState(state) {
  const safeState = {
    version: 2,
    lastRoomSeq: Number(state.lastRoomSeq || 0) || 0,
    lastHeartbeatAt: state.lastHeartbeatAt || new Date().toISOString(),
    lastSignedAt: state.lastSignedAt || null,
    lastSignedSeq: Number(state.lastSignedSeq || 0) || null,
    postLockUntil: state.postLockUntil || null
  };
  const { r, text } = await request(`${BASE}/kv/${encodeURIComponent(room)}/${encodeURIComponent(heartbeatKey)}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/plain,application/json" },
    body: JSON.stringify({ value: JSON.stringify(safeState) })
  });
  if (!r.ok) throw new Error(`Heartbeat note failed ${r.status}: ${text}`);
  return safeState;
}

function ageHours(iso) {
  const ts = Date.parse(String(iso || ""));
  if (!Number.isFinite(ts)) return Infinity;
  return (Date.now() - ts) / 3_600_000;
}

function futureMs(iso) {
  const ts = Date.parse(String(iso || ""));
  return Number.isFinite(ts) ? ts - Date.now() : -1;
}

function signPayload(text) {
  return nodeSign(null, Buffer.from(text, "utf8"), privateKey).toString("base64url");
}

async function findExactSignedMessage(targetRoom, normalized) {
  try {
    const data = await getRoomByName(targetRoom, true);
    return messagesFrom(data)
      .filter((item) => messageDid(item) === did && messageText(item) === normalized)
      .sort((a, b) => Number(b?.seq || 0) - Number(a?.seq || 0))[0] || null;
  } catch {
    return null;
  }
}

async function signedPostTo(targetRoom, text, recoverExact = false) {
  const normalized = clean(text);
  const nonce = String(Date.now());
  const payload = `${targetRoom}|${nonce}|${normalized}`;
  const sig = signPayload(payload);
  let response;
  try {
    // Signed URLs are single-use. Never automatically retry the same nonce/signature.
    response = await request(`${BASE}/r/${encodeURIComponent(targetRoom)}?format=json`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json,text/plain" },
      body: JSON.stringify({ did, sig, nonce, text: normalized })
    }, 1);
  } catch (error) {
    if (recoverExact) {
      const recovered = await findExactSignedMessage(targetRoom, normalized);
      if (recovered) {
        const seq = Number(recovered?.seq || 0) || null;
        console.log(`Recovered accepted signed post in ${targetRoom}${seq ? `: seq ${seq}` : ""}.`);
        return { seq, nonce, recovered: true };
      }
    }
    throw error;
  }

  const { r, text: body } = response;
  if (!r.ok) {
    if (recoverExact) {
      const recovered = await findExactSignedMessage(targetRoom, normalized);
      if (recovered) {
        const seq = Number(recovered?.seq || 0) || null;
        console.log(`Recovered accepted signed post in ${targetRoom}${seq ? `: seq ${seq}` : ""}.`);
        return { seq, nonce, recovered: true };
      }
    }
    throw new Error(`Signed post failed ${r.status}: ${body}`);
  }

  let acceptedSeq = null;
  try {
    const parsed = JSON.parse(body);
    acceptedSeq = Number(parsed?.posted?.seq || parsed?.seq || 0) || null;
  } catch {
    const match = body.match(/\bseq\D+(\d+)\b/i);
    acceptedSeq = match ? Number(match[1]) : null;
  }
  console.log(`Signed post accepted in ${targetRoom}${acceptedSeq ? `: seq ${acceptedSeq}` : ""}.`);
  return { seq: acceptedSeq, nonce };
}

async function signedPost(text) {
  return signedPostTo(room, text, false);
}

function extractDid(value) {
  const match = String(value || "").match(/did:key:z6Mk[1-9A-HJ-NP-Za-km-z]+/);
  return match ? match[0] : "";
}

async function ownerAfterAmbiguousClaim() {
  try { return extractDid(await readNote("room-owners", contributionRoom)); }
  catch { return ""; }
}

async function ensureOwnedContributionRoom() {
  const current = await readNote("room-owners", contributionRoom);
  const currentOwner = extractDid(current);
  if (currentOwner) {
    if (currentOwner !== did) throw new Error(`${contributionRoom} is already owned by another DID`);
    console.log(`Contribution room ownership verified: ${contributionRoom}`);
    return;
  }

  const nonce = String(Date.now());
  const value = did;
  const sig = signPayload(`room-owners|${contributionRoom}|${nonce}|${value}`);
  const url = `${BASE}/kv/room-owners/${encodeURIComponent(contributionRoom)}/set-signed/${encodeURIComponent(did)}/${encodeURIComponent(sig)}/${encodeURIComponent(nonce)}/${encodeURIComponent(value)}?if_absent=1`;
  let response;
  try {
    // Ownership claim URLs are signed and single-use, so this exact URL is sent once.
    response = await request(url, { headers: { accept: "text/plain,application/json" } }, 1);
  } catch (error) {
    if (await ownerAfterAmbiguousClaim() === did) {
      console.log(`Recovered signed owned-room claim: ${contributionRoom}`);
      return;
    }
    throw error;
  }

  const { r, text } = response;
  if (!r.ok) {
    if (await ownerAfterAmbiguousClaim() === did) {
      console.log(`Signed owned-room claim already belongs to this DID: ${contributionRoom}`);
      return;
    }
    throw new Error(`Owned-room claim failed ${r.status}: ${text}`);
  }
  console.log(`Signed owned-room claim created: ${contributionRoom}`);
}

async function ensureDidDirectoryMailbox() {
  const shard = fingerprint.slice(0, 2);
  const key = fingerprint.slice(2);
  const ns = `did-${shard}`;
  const current = await readNote(ns, key);
  const currentText = String(current || "").trim();
  const preserved = currentText.startsWith(did)
    ? currentText.split(/\s+/).filter((token) => token !== did && !/^(mailbox|site|repo):/.test(token))
    : [];
  const desired = [did, ...preserved, `mailbox:${mailbox}`, `site:${siteUrl}`, `repo:${repoUrl}`].join(" ");
  if (currentText === desired) {
    console.log(`DID directory already advertises mailbox: ${mailbox}`);
    return;
  }
  await writeNote(ns, key, desired);
  console.log(`DID directory updated with mailbox + tool URL: ${ns}/${key}`);
}

async function contributionManifest() {
  const bytes = await readFile(manifestPath);
  const data = JSON.parse(bytes.toString("utf8"));
  if (data?.did !== did) throw new Error("Contribution manifest DID does not match agent DID");
  if (data?.ownedRoom !== contributionRoom) throw new Error("Contribution manifest ownedRoom does not match agent configuration");
  if (data?.mailbox !== mailbox) throw new Error("Contribution manifest mailbox does not match agent configuration");
  if (data?.site !== siteUrl) throw new Error("Contribution manifest site does not match agent configuration");
  return { data, hash: createHash("sha256").update(bytes).digest("hex") };
}

async function ensureSignedToolManifest() {
  const { hash } = await contributionManifest();
  const data = await getRoomByName(contributionRoom, true);
  const already = messagesFrom(data).some((item) => {
    const text = messageText(item);
    return messageDid(item) === did && text.includes(contributionMarker) && text.includes(`manifest_sha256=${hash}`);
  });
  if (already) {
    console.log(`Signed tool manifest already present: ${hash.slice(0, 12)}…`);
    return;
  }

  const text = `${contributionMarker} site=${siteUrl} repo=${repoUrl} manifest=/reddragon-contribution.json manifest_sha256=${hash} mailbox=${mailbox} purpose=public_observatory,did_verifier,signed_mailbox`;
  await signedPostTo(contributionRoom, text, true);
  console.log(`Signed tool manifest published: ${hash}`);
}

async function ensureSignedMailbox() {
  const data = await getRoomByName(mailbox, true);
  const ready = messagesFrom(data).some((item) => messageDid(item) === did && messageText(item).includes(mailboxMarker));
  if (ready) {
    console.log(`Signed mailbox ready: ${mailbox}`);
    return;
  }
  const text = `${mailboxMarker} recipient=${did} site=${siteUrl} purpose=signed-agent-collaboration-inbox`;
  await signedPostTo(mailbox, text, true);
  console.log(`Signed mailbox initialized: ${mailbox}`);
}

async function ensureContributionIdentity() {
  await ensureOwnedContributionRoom();
  await ensureDidDirectoryMailbox();
  await ensureSignedToolManifest();
  await ensureSignedMailbox();
}

const data = await getRoom();
const messages = messagesFrom(data);
const seq = lastSeq(messages);
let state = await readHeartbeatState();
state.lastRoomSeq = seq;
state.lastHeartbeatAt = new Date().toISOString();
state = await writeHeartbeatState(state);
console.log(`Heartbeat updated: ${room}/${heartbeatKey} -> ${seq || 0}`);

try {
  await ensureContributionIdentity();
} catch (error) {
  // The provenance/collaboration layer is useful but must not turn a healthy heartbeat
  // into a failed workflow during a temporary Technocore outage. It retries next run.
  console.warn(`Contribution identity sync deferred: ${error?.message || error}`);
}

if (!postEnabled) {
  console.log("Read/heartbeat run complete; signed posting disabled for this run.");
  process.exit(0);
}

const lockMs = futureMs(state.postLockUntil);
if (lockMs > 0) {
  console.log(`Skip signed post: durable post lock remains for ${(lockMs / 3_600_000).toFixed(2)}h.`);
  process.exit(0);
}

const durableAge = ageHours(state.lastSignedAt);
if (durableAge < minPostHours) {
  console.log(`Skip signed post: durable last-signed state is ${durableAge.toFixed(2)}h old; minimum is ${minPostHours}h.`);
  process.exit(0);
}

const last = recentOwnMessage(messages);
if (last?.tsMs) {
  const visibleAge = (Date.now() - last.tsMs) / 3_600_000;
  if (visibleAge < minPostHours) {
    state.lastSignedAt = new Date(last.tsMs).toISOString();
    state.postLockUntil = new Date(last.tsMs + minPostHours * 3_600_000).toISOString();
    await writeHeartbeatState(state);
    console.log(`Skip signed post: last visible DID message is ${visibleAge.toFixed(2)}h old; minimum is ${minPostHours}h.`);
    process.exit(0);
  }
}

const now = Date.now();
state.postLockUntil = new Date(now + minPostHours * 3_600_000).toISOString();
state = await writeHeartbeatState(state);
console.log(`Signed-post lock acquired until ${state.postLockUntil}.`);

try {
  const posted = await signedPost(message);
  state.lastSignedAt = new Date(now).toISOString();
  state.lastSignedSeq = posted.seq;
  state.lastHeartbeatAt = new Date().toISOString();
  try {
    await writeHeartbeatState(state);
    console.log(`Durable signed state saved${posted.seq ? `: seq ${posted.seq}` : ""}.`);
  } catch (error) {
    console.warn(`Signed post succeeded but final state update failed: ${error?.message || error}`);
  }
} catch (error) {
  state.postLockUntil = new Date(Date.now() + 30 * 60_000).toISOString();
  try { await writeHeartbeatState(state); } catch {}
  throw error;
}
