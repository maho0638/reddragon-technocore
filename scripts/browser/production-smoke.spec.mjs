// Read-only production HTTP checks. Local E2E flows live in site-acceptance.spec.mjs.
import assert from "node:assert/strict";
import test from "node:test";

const PRODUCTION_ORIGIN = "https://reddragon-technocore.vercel.app";

test("production public pages and status endpoints respond without writes", { timeout: 90000 }, async () => {
  for (const path of ["/", "/flop", "/flop-source-status.json", "/api/flop-status", "/assets/reddragon.jpg"]) {
    const response = await fetch(PRODUCTION_ORIGIN + path, {
      signal: AbortSignal.timeout(30000),
      redirect: "manual",
    });
    assert.equal(response.status, 200, `${path} returned HTTP ${response.status}`);
    if (path === "/api/flop-status") {
      const status = await response.json();
      assert.equal(status.schema, "reddragon-flop-live-status/v1");
      assert.notEqual(status.testnet?.state, "live", "unconfirmed testnet must not be shown live");
    } else if (path === "/flop-source-status.json") {
      const source = await response.json();
      assert.equal(source.project?.independentCommunityTool, true);
      assert.equal(source.project?.affiliatedWithFlopLabs, false);
    } else {
      await response.arrayBuffer();
    }
  }

  const relayGet = await fetch(PRODUCTION_ORIGIN + "/api/relay", {
    method: "GET",
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(relayGet.status, 405, "relay GET must return the method gate, not a service error");
});
