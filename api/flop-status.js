const SOURCES = Object.freeze({
  testnet: "https://docs.flop.network/networks/testnet",
  devnet: "https://docs.flop.network/networks/devnet",
  official: "https://docs.flop.network/docs/official-links",
  sdks: "https://docs.flop.network/docs/sdk-references",
  validator: "https://explorer.devnet.flop.network/validator",
  validatorManual: "https://docs.flop.network/docs/run-validator",
  timeline: "https://docs.flop.network/docs/testnet-and-timeline",
  paperContent: "https://api.github.com/repos/flop-labs/yellowpaper/commits?path=yellowpaper.md&per_page=1",
  repoHead: "https://api.github.com/repos/flop-labs/yellowpaper/commits/main",
  models: "https://api.flop.network/v1/models",
  rpc: "https://rpc.devnet.flop.network"
});
const MAX_BYTES = 256 * 1024;
// The official docs/API answered in ~4.6–5.9s in the authorized read-only
// Work check, so 3.5s caused false outages. Keep a bounded single-source cap.
const TIMEOUT_MS = 6500;
const CACHE_MS = 120_000;
let memoryCache;

function assertAllowed(url) {
  if (!Object.values(SOURCES).includes(url)) throw new Error("Source is not allowlisted");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || parsed.hash) {
    throw new Error("Unsafe source URL");
  }
  return parsed;
}

function safeUrl(url) {
  const parsed = assertAllowed(url);
  if (parsed.hostname === "api.github.com" && !["/repos/flop-labs/yellowpaper/commits", "/repos/flop-labs/yellowpaper/commits/main"].includes(parsed.pathname)) {
    throw new Error("Unapproved GitHub API path");
  }
  return parsed.href;
}

async function readLimited(response) {
  if (!response?.ok) throw new Error(`HTTP ${response?.status ?? "unknown"}`);
  const final = response.url ? new URL(response.url) : null;
  if (response.redirected) throw new Error("Unexpected source redirect");
  if (final && (!Object.values(SOURCES).some((u) => new URL(u).origin === final.origin) || response.redirected)) {
    throw new Error("Unexpected source redirect");
  }
  const mime = response.headers?.get?.("content-type") || "";
  if (mime && !/^(text\/html|text\/plain|application\/json)(?:\s*;|$)/i.test(mime)) throw new Error("Unexpected source type");
  const declared = Number(response.headers?.get?.("content-length") || 0);
  if (!Number.isFinite(declared) || declared < 0 || declared > MAX_BYTES) throw new Error("Source size invalid");
  if (!response.body?.getReader) throw new Error("Missing response body");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) { await reader.cancel(); throw new Error("Source size exceeded"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

async function fetchText(url, fetchFn = fetch, options = {}) {
  const target = safeUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(options.timeoutMs || TIMEOUT_MS, 7000));
  try {
    const response = await fetchFn(target, {
      method: options.method || "GET",
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
      headers: options.headers || { accept: "text/html,application/json;q=0.9" },
      ...(options.body ? { body: options.body } : {}),
      signal: controller.signal
    });
    return await readLimited(response);
  } finally { clearTimeout(timer); }
}

export function sourceText(html) {
  return String(html).replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<\/(?:p|h[1-6]|li|td|tr|div|section|article|dt|dd)>/gi, "\n")
    .replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">").replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"')
    .replace(/[\u00a0\u200b]/g, " ").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

export function classifyTestnetPage(html) {
  const text = sourceText(html);
  const head = text.slice(0, 700);
  const hasIdentity = /Network\s*:\s*testnet/i.test(head);
  const release = head.match(/Release\s*:\s*([^\n·]{1,100})/i)?.[1]?.trim() || "";
  const unreleased = /planned|unreleased|\bnext\b/i.test(head) || /public operator enrollment is unavailable|None verified/i.test(text);
  const hasRpc = /\bRPC\s+(?:wss?:\/\/|https?:\/\/)/i.test(text);
  const hasGenesis = /Expected genesis\s+0x[0-9a-f]{32,}/i.test(text);
  if (hasIdentity && unreleased) return { state: "not-live", release: release || "unreleased" };
  if (hasIdentity && hasRpc && hasGenesis) return { state: "manual-verification-required", release };
  return { state: "unverified", release: release || null };
}

export function parseDevnetPage(html) {
  const text = sourceText(html);
  const rpc = text.match(/\bRPC\s+(wss?:\/\/[^\s]+)/i)?.[1] || null;
  const gateway = text.match(/\bGateway\s+(https:\/\/[^\s]+)/i)?.[1] || null;
  const catalog = text.match(/\bModel catalog\s+(https:\/\/[^\s]+)/i)?.[1] || null;
  const publicEndpoints = /public devnet endpoints are available/i.test(text);
  const restricted = /operator enrollment and inference readiness require separate checks/i.test(text) || /operator enrollment is unavailable/i.test(text);
  return {
    state: /Network\s*:\s*devnet\s*\(development\)/i.test(text) && publicEndpoints ? "public-development-network" : "unverified",
    rpc: rpc === "wss://rpc.devnet.flop.network" ? rpc : null,
    gateway: gateway === "https://api.flop.network" ? gateway : null,
    modelCatalog: catalog === "https://api.flop.network/v1/models" ? catalog : null,
    operatorEnrollment: restricted ? "administrator-assisted / public self-service unavailable" : "unverified",
    rewards: /earns nothing|no rewards and no airdrop weight/i.test(text) ? "none" : "unverified"
  };
}

export function parsePackageVersions(html) {
  const text = sourceText(html);
  const versions = [];
  for (const match of text.matchAll(/(@flop-labs\/(?:client|contracts|sdk|pi|cli)|flop-sdk)\s+(\d+\.\d+\.\d+(?:-[\w.-]+)?)/g)) {
    if (!versions.some((item) => item.name === match[1])) versions.push({ name: match[1], version: match[2] });
  }
  return versions;
}

export function parseValidatorPackage(html) {
  const text = sourceText(html);
  return {
    packageVersion: text.match(/validator-cs-[\w-]+\s*[·|]\s*(\d+\.\d+\.\d+-devnet\.\d+)/i)?.[1] || null,
    admission: /administrator-assisted devnet onboarding/i.test(text) ? "administrator-assisted; public self-service testnet onboarding unavailable" : "unverified"
  };
}

export function parseValidatorManual(html) {
  const text = sourceText(html);
  return {
    packageVersion: text.match(/Use\s+(\d+\.\d+\.\d+-devnet\.\d+)/i)?.[1] || null,
    updated: text.match(/Last updated\s+(\d{4}-\d{2}-\d{2})/i)?.[1] || null
  };
}

export function parseTimelinePage(html) {
  const text = sourceText(html);
  const updated = text.match(/Last updated\s+(\d{4}-\d{2}-\d{2})/i)?.[1] || null;
  const target = text.match(/working target is\s+([^.!?]{1,100})/i)?.[1]?.trim() || null;
  return {
    updated,
    testnetTarget: target,
    testnetTargetIsUnconfirmed: !!target && /target rather than a fixed date/i.test(text),
    testnetOpenClaim: /testnet is open/i.test(text),
    devnetRewards: /devnet earns nothing/i.test(text) && /no rewards and no airdrop weight/i.test(text) ? "none" : "unverified"
  };
}

export function parseCommit(value) {
  const commit = Array.isArray(value) ? value[0] : value;
  if (!commit?.sha || !commit?.commit?.committer?.date || !commit?.commit?.message) throw new Error("Malformed commit metadata");
  return { sha: commit.sha, date: commit.commit.committer.date, message: commit.commit.message.split("\n")[0] };
}

async function capture(name, url, parser, fetchFn) {
  try { return { state: "verified", data: parser(await fetchText(url, fetchFn)), source: url, checkedAt: new Date().toISOString() }; }
  catch (error) { return { state: "unverified", error: String(error?.name === "AbortError" ? "source timeout" : error?.message || "source unavailable").slice(0, 140), source: url }; }
}

function parseModels(text) {
  const json = JSON.parse(text);
  if (!json || json.object !== "list" || !Array.isArray(json.data) || json.data.length > 500) throw new Error("Invalid model catalog");
  const models = json.data.filter((m) => m && typeof m.id === "string" && typeof m.owned_by === "string")
    .slice(0, 100).map(({ id, name, owned_by }) => ({ id: id.slice(0, 100), name: typeof name === "string" ? name.slice(0, 140) : id.slice(0, 100), ownedBy: owned_by.slice(0, 80) }));
  if (!models.length) throw new Error("Empty model catalog");
  return { count: json.data.length, models };
}

async function probeRpc(fetchFn) {
  try {
    const calls = ["system_chain", "system_version", "chain_getBlockHash"];
    const results = await Promise.all(calls.map(async (method, i) => {
      const text = await fetchText(SOURCES.rpc, fetchFn, {
        method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: i + 1, method, params: method === "chain_getBlockHash" ? [0] : [] })
      });
      const parsed = JSON.parse(text);
      if (parsed.id !== i + 1 || parsed.error || !Object.hasOwn(parsed, "result")) throw new Error("Invalid read-only RPC response");
      return parsed.result;
    }));
    return { state: results[2] === "0x99c172c095340ace980631f9123544c6bebd4839f3437e463533422d8be2d631" ? "identity-matched" : "identity-unverified", chain: String(results[0]).slice(0, 100), version: String(results[1]).slice(0, 80), genesis: String(results[2]).slice(0, 100), source: SOURCES.rpc };
  } catch (error) { return { state: "unverified", error: String(error?.name === "AbortError" ? "RPC timeout" : error?.message || "RPC unavailable").slice(0, 140), source: SOURCES.rpc }; }
}

function hasCurrentSourceData(data) {
  return [
    data.testnet?.state,
    data.devnet?.state,
    data.timeline?.state,
    data.officialLinks?.state,
    data.packages?.state,
    data.services?.gateway?.state,
    data.services?.rpc?.state,
    data.yellowPaper?.githubContentCommit ? "verified" : "unverified",
    data.yellowPaper?.githubRepositoryHead ? "verified" : "unverified"
  ].some((state) => state && state !== "unverified");
}

export async function buildStatus({ fetchFn = fetch, now = new Date() } = {}) {
  const [testnet, devnet, official, sdks, validator, validatorManual, timeline, paperContent, repoHead, catalog, rpc] = await Promise.all([
    capture("testnet", SOURCES.testnet, classifyTestnetPage, fetchFn),
    capture("devnet", SOURCES.devnet, parseDevnetPage, fetchFn),
    capture("official", SOURCES.official, (html) => ({ tokenClaim: /there is no FLOP token yet/i.test(sourceText(html)), updated: sourceText(html).match(/Updated (\d{4}-\d{2}-\d{2})/i)?.[1] || null }), fetchFn),
    capture("sdks", SOURCES.sdks, parsePackageVersions, fetchFn),
    capture("validator", SOURCES.validator, parseValidatorPackage, fetchFn),
    capture("validatorManual", SOURCES.validatorManual, parseValidatorManual, fetchFn),
    capture("timeline", SOURCES.timeline, parseTimelinePage, fetchFn),
    capture("paperContent", SOURCES.paperContent, (raw) => parseCommit(JSON.parse(raw)), fetchFn),
    capture("repoHead", SOURCES.repoHead, (raw) => parseCommit(JSON.parse(raw)), fetchFn),
    capture("models", SOURCES.models, parseModels, fetchFn),
    probeRpc(fetchFn)
  ]);
  const data = {
    schema: "reddragon-flop-live-status/v1",
    checkedAt: now.toISOString(),
    officialLinks: { ...official.data, state: official.state, source: SOURCES.official, checkedAt: official.checkedAt, error: official.error },
    testnet: { ...testnet.data, source: SOURCES.testnet, state: testnet.state === "verified" ? testnet.data.state : "unverified", checkedAt: testnet.checkedAt, error: testnet.error },
    devnet: { ...devnet.data, rewards: devnet.state === "verified" && devnet.data.rewards === "none" ? "none" : timeline.state === "verified" ? timeline.data.devnetRewards : "unverified", source: SOURCES.devnet, state: devnet.state === "verified" ? devnet.data.state : "unverified", checkedAt: devnet.checkedAt, error: devnet.error },
    timeline: { ...timeline.data, state: timeline.state, source: SOURCES.timeline, checkedAt: timeline.checkedAt, error: timeline.error },
    services: { gateway: { state: catalog.state === "verified" ? "catalog-responded" : "unverified", source: SOURCES.models, count: catalog.data?.count, models: catalog.data?.models, error: catalog.error }, rpc, faucet: { state: "published-endpoint; operational-status-unverified", url: "https://faucet.flop.network", source: SOURCES.official } },
    packages: { state: sdks.state === "verified" ? "verified-from-docs" : "unverified", source: SOURCES.sdks, versions: sdks.data || [], error: sdks.error, validatorPackage: validator.data?.packageVersion || null, validatorSource: SOURCES.validator, validatorManualVersion: validatorManual.data?.packageVersion || null, validatorManualUpdated: validatorManual.data?.updated || null, validatorManualSource: SOURCES.validatorManual, validatorAdmission: validator.data?.admission || "unverified" },
    yellowPaper: { version: "0.5.0 (draft)", livePageUpdated: "2026-09-24", liveSource: "https://flop.finance/intro/yellowpaper/", githubContentCommit: paperContent.data || null, githubRepositoryHead: repoHead.data || null, contentVsCiDistinguished: true, sources: { content: SOURCES.paperContent, repositoryHead: SOURCES.repoHead } },
    notes: { devnetRewards: timeline.state === "verified" && timeline.data.devnetRewards === "none" ? "Official timeline FAQ says devnet earns nothing and has no reward or airdrop weight" : "unverified from current official sources", testnetDate: timeline.data?.testnetTarget || "Q4 2026 draft target; launch unverified", airdropConversion: "E.38 remains open; no individual reward estimate is produced", methodology: "Official sources and public read-only probes only. Failed checks remain unverified." }
  };
  return data;
}

export async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "GET only" });
  }
  const now = Date.now();
  if (memoryCache && now - memoryCache.savedAt < CACHE_MS) {
    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=600, stale-if-error=86400");
    return res.status(200).json({ ...memoryCache.data, servedFromCache: true, cachedAt: new Date(memoryCache.savedAt).toISOString() });
  }
  try {
    const data = await buildStatus();
    // A source outage is represented as unverified data. Keep the last useful
    // snapshot when every live source fails, and explicitly label its age.
    if (!hasCurrentSourceData(data) && memoryCache) {
      res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
      return res.status(200).json({ ...memoryCache.data, stale: true, cachedAt: new Date(memoryCache.savedAt).toISOString() });
    }
    memoryCache = { data, savedAt: now };
    res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=600, stale-if-error=86400");
    return res.status(200).json(data);
  } catch {
    if (memoryCache) {
      res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
      return res.status(200).json({ ...memoryCache.data, stale: true, cachedAt: new Date(memoryCache.savedAt).toISOString() });
    }
    res.setHeader("Cache-Control", "no-store");
    return res.status(503).json({ schema: "reddragon-flop-live-status/v1", stale: false, checkedAt: new Date().toISOString(), state: "unverified", error: "Official sources could not be checked" });
  }
}

export const __test = {
  SOURCES, safeUrl, fetchText, parseModels, parseTimelinePage, readLimited, hasCurrentSourceData,
  getCache: () => memoryCache,
  resetCache: () => { memoryCache = undefined; },
  seedCache: (data, savedAt) => { memoryCache = { data, savedAt }; }
};
export default handler;
