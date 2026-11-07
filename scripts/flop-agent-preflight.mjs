/**
 * RedDragon - FLOP public testnet preflight.
 * Read-only: does NOT read secrets, sign requests, claim a faucet, or send inference.
 * Requires Node >= 22; only the fixed official testnet document is fetched.
 */
import { createHash, createPublicKey } from "node:crypto";
import { pathToFileURL } from "node:url";

export const DID = "did:key:z6MkuhrsP4tDZjWYdZLPxaur19WvrF1yuLGsGB2S8Q1gwS6K";
export const TESTNET_DOC = "https://docs.flop.network/networks/testnet";
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const MAX_BYTES = 262144;

export function verifyDid(did = DID) {
  if (typeof did !== "string" || !did.startsWith("did:key:z")) {
    throw Error("A public did:key:z Ed25519 identity is required");
  }
  const encoded = did.slice("did:key:z".length);
  if (!encoded || [...encoded].some(char => !B58.includes(char))) {
    throw Error("Invalid base58btc DID");
  }
  let n = 0n;
  for (const char of encoded) n = n * 58n + BigInt(B58.indexOf(char));
  const bytes = [];
  while (n > 0n) { bytes.unshift(Number(n & 255n)); n >>= 8n; }
  for (const char of encoded) { if (char !== "1") break; bytes.unshift(0); }
  const decoded = Buffer.from(bytes);
  if (decoded.length !== 34 || decoded[0] !== 0xed || decoded[1] !== 0x01) {
    throw Error("Not an Ed25519 32-byte did:key public key");
  }
  const publicKey = decoded.subarray(2);
  const derPrefix = Buffer.from("302a300506032b6570032100", "hex");
  createPublicKey({ key: Buffer.concat([derPrefix, publicKey]), format: "der", type: "spki" });
  return {
    did,
    codec: "ed25519-pub",
    publicKeyHex: publicKey.toString("hex"),
    fingerprint: createHash("sha256").update(did).digest("hex").slice(0, 16)
  };
}

export function validateSource(url) {
  if (url !== TESTNET_DOC) throw Error("Unapproved source URL");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== "docs.flop.network" ||
      parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash) {
    throw Error("Unsafe official source origin");
  }
  return parsed.href;
}

export async function readNetworkPage(url = TESTNET_DOC, { fetchFn = fetch, timeoutMs = 10000 } = {}) {
  const safeUrl = validateSource(url);
  const response = await fetchFn(safeUrl, {
    method: "GET", redirect: "error", credentials: "omit", cache: "no-store",
    headers: { Accept: "text/html, text/plain;q=0.9" },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response?.ok) throw Error("Official source HTTP " + (response?.status ?? "unknown"));
  if (response.url && response.url !== safeUrl) throw Error("Unexpected response URL");
  const mime = response.headers?.get?.("content-type") || "";
  if (mime && !/^(text\/html|text\/plain)(?:\s*;|$)/i.test(mime)) {
    throw Error("Unexpected source MIME type");
  }
  const length = Number(response.headers?.get?.("content-length") || 0);
  if (!Number.isFinite(length) || length < 0 || length > MAX_BYTES) {
    throw Error("Official page size invalid");
  }
  if (!response.body || typeof response.body[Symbol.asyncIterator] !== "function") {
    throw Error("Missing streamed response");
  }
  let size = 0;
  const chunks = [];
  for await (const part of response.body) {
    size += part.byteLength;
    if (size > MAX_BYTES) throw Error("Official page size exceeded");
    chunks.push(part);
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
}

export function textOnly(html) {
  return String(html)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<\/(?:p|h[1-6]|li|td|tr|div|section|article|dt|dd)>/gi, "\n")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[\u00a0\u200b]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

export function classifyNetworkPage(html) {
  const text = textOnly(html);
  const match = text.match(/\bNetwork\s*:\s*testnet\b\s*(?:\(([^)]+)\))?/i);
  if (!match) return { state: "unverified", reason: "Public testnet identity not found" };
  const nearby = text.slice(match.index, match.index + 320);
  const release = nearby.match(/\bRelease\s*:\s*([^\n]{1,80})/i)?.[1] || "";
  const blocked = /planned|unreleased|\bnext\b|placeholder|coming soon/i.test((match[1] || "") + " " + release) ||
    /Unavailable\s*[—-]\s*no verified public value|None verified|Admission\s+Unavailable|public operator enrollment is unavailable/i.test(text);
  if (blocked) {
    return { state: "not-launched", reason: "Official testnet release or network settings not verified" };
  }
  return {
    state: "manual-verification-required",
    reason: "Review signed official release, chain identity/genesis, RPC, faucet, DID/SS58 mapping and settlement first"
  };
}

export function makeReport(html, now = new Date()) {
  const identity = verifyDid();
  const status = classifyNetworkPage(html);
  return {
    checkedAt: now.toISOString(),
    network: "flop-public-testnet",
    readOnly: true,
    did: identity.did,
    didCodec: identity.codec,
    didFingerprint: identity.fingerprint,
    source: TESTNET_DOC,
    sourceSha256: createHash("sha256").update(html).digest("hex"),
    ...status,
    mayClaim: false,
    maySign: false,
    maySendInference: false,
    testnetTx: null,
    settlementReceipt: null,
    devnetAirdropCredit: 0,
    requiredAfterLaunch: [
      "Verify official testnet release, chain genesis and RPC",
      "Verify DID-to-chain-account mapping and approved signer protocol",
      "Use official free faucet once within published limits",
      "Send one authorized signed inference and verify final on-chain settlement receipt"
    ]
  };
}

export async function runPreflight(options = {}) {
  const html = await readNetworkPage(TESTNET_DOC, options);
  return makeReport(html, options.now || new Date());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.slice(2).some(arg => arg !== "--json")) {
    console.error("Usage: node scripts/flop-agent-preflight.mjs [--json]");
    process.exitCode = 2;
  } else {
    try {
      const result = await runPreflight();
      console.log(JSON.stringify(result, null, 2));
      if (result.state !== "not-launched") process.exitCode = 3;
    } catch (error) {
      console.error(JSON.stringify({ readOnly: true, state: "unverified", error: String(error.message || error) }));
      process.exitCode = 1;
    }
  }
}
