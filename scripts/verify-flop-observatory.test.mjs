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
  assert.equal(s.checkedAt, "2026-11-03");
});

test("resolved mirror mismatch is not advertised as current", async () => {
  const s = await json("public/flop-source-status.json");
  const page = await read("public/flop.html");
  assert.deepEqual(s.sourceDrift, []);
  assert.equal(s.resolvedSourceDrift[0].status, "resolved");
  assert.match(page, /GitHub mirror caught up/);
  assert.doesNotMatch(page, /still shows the older 3\.5B|currently stale versus live/i);
});

test("testnet remains fail-closed and devnet has no airdrop weight", async () => {
  const s = await json("public/flop-source-status.json");
  assert.match(s.roadmap.testnetNetworkStatus, /planned.+unreleased/i);
  assert.equal(s.roadmap.officialFaucetEndpointVerifiedLive, false);
  assert.equal(s.roadmap.officialInferenceEndpointVerifiedLive, false);
  assert.equal(s.roadmap.devnetEarnsAirdropWeight, false);
  const page = await read("public/flop.html");
  assert.match(page, /https:\/\/docs\.flop\.network\/networks\/testnet/);
  assert.match(page, /https:\/\/docs\.flop\.network\/networks\/devnet/);
  assert.match(page, /Devnet activity earns no rewards/i);
});

test("agent unlock is specified, but local testnet logs do not imply unlocked funds", async () => {
  const s = await json("public/flop-source-status.json");
  assert.equal(s.authoritative.airdropMechanics.spendToUnlockRatifiedInYellowPaper, true);
  assert.equal(s.authoritative.airdropMechanics.notATestnetRewardEstimate, true);
  const toolkit = await read("public/testnet-toolkit.js");
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
