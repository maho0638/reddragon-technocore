import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");
const json = async (path) => JSON.parse(await read(path));
const did = "did:key:z6MkuhrsP4tDZjWYdZLPxaur19WvrF1yuLGsGB2S8Q1gwS6K";

test("owner X handle appears consistently without old Joanna links", async () => {
  const files = [
    "public/index.html", "public/flop.html", "public/config.js", "public/app.js",
    "public/enhancements.js", "public/final-fixes.js", "public/language-final.js",
    "public/language-safe.js", "public/language-stable.js", "public/language.js",
    "public/repair.js", "README.md"
  ];
  for (const file of files) {
    const content = await read(file);
    assert.doesNotMatch(content, /joannawolker|joannawalker/i, file);
  }
  assert.match(await read("public/flop.html"), /https:\/\/x\.com\/lionmousse/);
  assert.match(await read("public/index.html"), /@lionmousse/);
  const config = await read("public/config.js");
  assert.match(config, /xHandle: "@lionmousse"/);
  assert.match(config, /xUrl: "https:\/\/x\.com\/lionmousse"/);
});

test("public supply and cohort allocations agree with signed manifest", async () => {
  const s = await json("public/flop-source-status.json");
  const m = await json("public/reddragon-contribution.json");
  const g = s.authoritative.genesis;
  assert.equal(g.supplyFlop, 4_400_000_000);
  assert.equal(g.minerAirdropFlop + g.validatorAirdropFlop + g.agentAirdropFlop + g.ecosystemReserveFlop, g.supplyFlop);
  assert.equal(m.flopCommunityObservatory.authoritativeGenesisSupplyFlop, g.supplyFlop);
  assert.equal(m.testnetReadiness.genesisSupplyFlop, g.supplyFlop);
  assert.equal(m.testnetReadiness.genesisValidatorAirdropFlop, 1_200_000_000);
  assert.equal(s.project.xUrl, "https://x.com/lionmousse");
  assert.equal(m.projectX, s.project.xUrl);
  assert.equal(m.did, did);
  assert.equal(s.checkedAt, "2026-11-10");
});

test("newer paper-content drift is distinct from CI-only repository head", async () => {
  const s = await json("public/flop-source-status.json");
  const page = await read("public/flop.html");
  assert.equal(s.sourceDrift[0].status, "open");
  assert.equal(s.authoritative.githubMirrorContentCommit.date, "2026-10-26");
  assert.equal(s.authoritative.githubRepositoryHead.date, "2026-11-05");
  assert.match(s.authoritative.githubRepositoryHead.message, /^ci\(/);
  assert.match(page, /Yellow Paper file history/);
  assert.doesNotMatch(page, /still shows the older 3\.5B|currently stale versus live/i);
});

test("testnet remains fail-closed and devnet has no airdrop weight", async () => {
  const s = await json("public/flop-source-status.json");
  assert.match(s.roadmap.testnetNetworkStatus, /planned.+unreleased/i);
  assert.equal(s.roadmap.officialFaucetEndpointVerifiedLive, false);
  assert.equal(s.roadmap.officialInferenceEndpointVerifiedLive, false);
  assert.equal(s.roadmap.devnetEarnsAirdropWeight, false);
  assert.equal(s.roadmap.publicDevnetModelCatalog, "https://api.flop.network/v1/models");
  assert.equal(s.roadmap.validatorPackage, "0.4.1-devnet.1 (explorer page; administrator-assisted access)");
  const page = await read("public/flop.html");
  assert.match(page, /https:\/\/docs\.flop\.network\/networks\/testnet/);
  assert.match(page, /https:\/\/docs\.flop\.network\/networks\/devnet/);
  assert.match(page, /timeline FAQ, updated 30 October, says devnet earns nothing and has no reward or airdrop weight/i);
  assert.match(page, /https:\/\/docs\.flop\.network\/docs\/testnet-and-timeline/);
});

test("agent unlock is specified, but local testnet logs do not imply unlocked funds", async () => {
  const s = await json("public/flop-source-status.json");
  assert.equal(s.authoritative.airdropMechanics.spendToUnlockRatifiedInYellowPaper, true);
  assert.equal(s.authoritative.airdropMechanics.notATestnetRewardEstimate, true);
  const toolkit = await read("public/testnet-toolkit.js");
  const didUtils = await read("public/flop-did-utils.js");
  const spec = await read("public/flop-spec-refresh.js");
  assert.match(toolkit, /return \{claimed,spent,unlock:null\}/);
  assert.match(toolkit, /const required=allocation\*0\.75/);
  assert.match(toolkit, /Math\.min\(allocation\*0\.25,eligibleSpent\/3\)/);
  assert.doesNotMatch(toolkit, /const required=allocation\*3;/);
  assert.match(spec, /publicAgentScenarioUnlocked: null/);
  assert.match(spec, /spendToUnlockRatifiedInYellowPaper: true/);
  const P = 1000, eligiblePayable = 750;
  assert.equal(Math.min(P * 0.25, eligiblePayable / 3), 250);
  assert.equal(P - eligiblePayable - 250, 0);
});

test("canonical identity and HTML metadata remain unchanged", async () => {
  const page = await read("public/flop.html");
  const cfg = await read("public/config.js");
  assert.match(page, /<link rel="canonical" href="https:\/\/reddragon-technocore\.vercel\.app\/flop"/);
  assert.match(cfg, new RegExp(did.replace(/[.*+?^$\{\}()|[\]\\]/g, "\\$&")));
  assert.equal((page.match(/<article class="status-card/g) || []).length, 9);
});

test("live source checks, bilingual status view and per-DID local log are wired without replacing RedDragon identity", async () => {
  const page = await read("public/flop.html");
  const status = await read("api/flop-status.js");
  const view = await read("public/flop-live-status.js");
  const toolkit = await read("public/testnet-toolkit.js");
  const didUtils = await read("public/flop-did-utils.js");
  const config = await read("public/config.js");
  assert.match(page, /id="flop-live-status"/);
  assert.match(status, /AbortController/);
  assert.match(status, /MAX_BYTES/);
  assert.match(view, /reddragon-lang/);
  assert.match(didUtils, /reddragon-flop-testnet-ledger:\$\{did\}/);
  assert.match(toolkit, /rdIsPublicEd25519Did/);
  assert.match(didUtils, /bytes\[0\]\s*===\s*0xed\s*&&\s*bytes\[1\]\s*===\s*0x01/);
  assert.match(toolkit, /not on-chain proof|not chain-verified/i);
  assert.match(config, /"\/flop-live-status\.js"/);
  assert.match(toolkit, new RegExp(did.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(toolkit, /rdLedgerDid.*value=.?did:key/);
});

test("DID provenance separates the owned room from historical proof and validates only published note fields", async () => {
  const manifest = await json("public/reddragon-contribution.json");
  const legacy = await read("public/did-provenance.js");
  const current = await read("public/provenance-room-refresh.js");
  const owned = manifest.ownedRoom;
  const proof = manifest.manifestProofRoom;
  assert.equal(owned, "d-reddragon-835ae177");
  assert.equal(proof, "d-reddragon-lab");
  assert.match(legacy, new RegExp(`const RD_PROV_ROOM = "${owned}"`));
  assert.match(current, new RegExp(`const RD_PROV_FIX_ROOM = "${owned}"`));
  assert.match(current, new RegExp(`const RD_PROV_FIX_PROOF_ROOM = "${proof}"`));
  assert.ok(current.includes("didNote.split(/\\s+/).includes(RD_PROV_FIX_CAP)"));
  assert.doesNotMatch(current, /didNote\.includes\(`mailbox:/);
  const startup = legacy.slice(legacy.indexOf("function rdProvStart()"));
  assert.doesNotMatch(startup, /rdProvRefreshSelf\(\)/);
  assert.match(startup, /rdProvRefreshMailbox\(\)/);
});

test("live status reports the dated testnet conflict and only repeats verified reward/token claims", async () => {
  const view = await read("public/flop-live-status.js");
  const api = await read("api/flop-status.js");
  assert.match(api, /testnetOpenClaim:\s*\/testnet is open\/i/);
  assert.match(view, /timeline\.state === "verified" && timeline\.testnetOpenClaim/);
  assert.match(view, /official\.tokenClaim === true \? c\.noToken : c\.tokenChanged/);
  assert.match(view, /data\.devnet\?\.rewards === "none" && data\.timeline\?\.state === "verified"/);
});
