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
const { response, text } = await request(url, { headers: { accept: "text/plain,application/json" } });
const current = response.status === 404 ? "" : unwrap(text);

if (current && !current.startsWith(DID)) {
  throw new Error("DID note contains an unexpected identity; refusing to overwrite it");
}

const preserved = current
  ? current.split(/\s+/).filter((token) =>
      token &&
      token !== DID &&
      !/^tclk1:/.test(token)
    )
  : [];

const desired = [DID, CAPABILITY, ...preserved].join(" ");
if (current === desired) {
  console.log(`TCLK capability already advertised: ${CAPABILITY} (${namespace}/${key})`);
  process.exit(0);
}

const write = await request(url, {
  method: "POST",
  headers: { "content-type": "application/json", accept: "text/plain,application/json" },
  body: JSON.stringify({ value: desired })
});

if (!write.response.ok) {
  throw new Error(`Capability write failed ${write.response.status}: ${write.text.slice(0, 200)}`);
}

const verify = await request(url, { headers: { accept: "text/plain,application/json" } });
const verified = unwrap(verify.text);
if (!verified.startsWith(DID) || !verified.split(/\s+/).includes(CAPABILITY)) {
  throw new Error("TCLK capability write could not be verified");
}

console.log(`TCLK capability advertised and verified: ${CAPABILITY} (${namespace}/${key})`);
