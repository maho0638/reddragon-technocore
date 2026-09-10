import { createHash } from "node:crypto";

const BASE = "https://technocore.chat";
const DID = "did:key:z6MkuhrsP4tDZjWYdZLPxaur19WvrF1yuLGsGB2S8Q1gwS6K";
const CAPABILITY = "tclk1:paper";
const fingerprint = createHash("sha256").update(DID, "utf8").digest("hex").slice(0, 16);
const namespace = `did-${fingerprint.slice(0, 2)}`;
const key = fingerprint.slice(2);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function unwrap(value) {
  let text = String(value || "").trim();
  if (text.startsWith("!! UNTRUSTED CONTENT")) {
    const split = text.indexOf("\n\n");
    if (split >= 0) text = text.slice(split + 2).trim();
  }
  const budget = text.indexOf("\n# budget:");
  if (budget >= 0) text = text.slice(0, budget).trim();
  return text;
}

function normalizeNote(value) {
  let text = unwrap(value);
  for (let i = 0; i < 3; i += 1) {
    if (!text) return "";
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed === "string") {
        text = unwrap(parsed);
        continue;
      }
      if (parsed && typeof parsed === "object" && typeof parsed.value === "string") {
        text = unwrap(parsed.value);
        continue;
      }
    } catch {}
    break;
  }
  return text;
}

async function request(url, options = {}, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20_000) });
      const text = await response.text();
      if (response.ok || response.status === 404) return { response, text };
      lastError = new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await sleep(attempt * 1500);
  }
  throw lastError || new Error("Technocore request failed");
}

const url = `${BASE}/kv/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`;
const first = await request(url, { headers: { accept: "text/plain,application/json" } });
const current = first.response.status === 404 ? "" : normalizeNote(first.text);

if (current && !current.startsWith(DID)) {
  throw new Error("DID note contains an unexpected identity; refusing to overwrite it");
}

const preserved = current
  ? current.split(/\s+/).filter((token) => token && token !== DID && !/^tclk1:/.test(token))
  : [];
const desired = [DID, CAPABILITY, ...preserved].join(" ");

if (current !== desired) {
  const write = await request(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/plain,application/json" },
    body: JSON.stringify({ value: desired })
  });
  if (!write.response.ok) {
    throw new Error(`Capability write failed ${write.response.status}: ${write.text.slice(0, 200)}`);
  }
}

let lastSeen = "";
for (let attempt = 1; attempt <= 5; attempt += 1) {
  const verify = await request(url, { headers: { accept: "text/plain,application/json", "cache-control": "no-cache" } });
  lastSeen = normalizeNote(verify.text);
  if (lastSeen.startsWith(DID) && lastSeen.split(/\s+/).includes(CAPABILITY)) {
    console.log(`TCLK capability advertised and verified: ${CAPABILITY} (${namespace}/${key})`);
    process.exit(0);
  }
  await sleep(attempt * 400);
}

throw new Error(`TCLK capability write could not be verified; observed=${lastSeen.slice(0, 180)}`);
