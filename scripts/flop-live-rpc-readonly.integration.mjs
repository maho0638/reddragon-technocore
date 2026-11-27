import assert from "node:assert/strict";
import { cryptoWaitReady, mnemonicGenerate } from "@polkadot/util-crypto";
import { Keyring } from "@polkadot/keyring";
import "./wallet-chain-entry.mjs";

const expectedGenesis = "0x918abd58fb16306b30ef3886514cfaebffecb4de43e82b6f8ec4795c43cfd800";
const timeout = setTimeout(() => { console.error("Read-only FLOP RPC verification timed out"); process.exit(1); }, 90_000);
timeout.unref();
let result;
try {
  await cryptoWaitReady();
  const pair = new Keyring({ type: "sr25519" }).addFromMnemonic(mnemonicGenerate());
  const client = globalThis.RedDragonFlopReadOnly;
  assert.ok(client, "site read-only client is available");
  const account = await client.connect(pair.address);
  assert.equal(account.genesis.toLowerCase(), expectedGenesis, "connected RPC matches official Testnet genesis");
  assert.equal(typeof account.balance, "string", "real account balance is returned");
  assert.ok(Number.isSafeInteger(account.specVersion) && account.specVersion > 0, "runtime version is available");
  const history = await client.readTransfers(pair.address);
  assert.ok(Number.isSafeInteger(history.finalizedHeight) && history.finalizedHeight > 0, "finalized chain head is available");
  assert.equal(history.scannedFrom, history.finalizedHeight, "history starts at the finalized head");
  assert.ok(history.scannedTo < history.scannedFrom, "history page covers older finalized blocks");
  for (const row of history.rows) {
    assert.ok(row.block <= history.finalizedHeight, "history excludes unfinalized blocks");
    assert.ok(row.from === pair.address || row.to === pair.address, "history rows belong to the generated test wallet");
    assert.match(row.txHash || "", /^0x[0-9a-f]{64}$/i, "transfer row is bound to an extrinsic hash");
  }
  result = { network: "FLOP Testnet", genesis: account.genesis, specVersion: account.specVersion, finalizedHeight: history.finalizedHeight, scannedFrom: history.scannedFrom, scannedTo: history.scannedTo, matchingFinalizedTransfers: history.rows.length, ephemeralWallet: true };
} catch (error) {
  console.error(`Read-only FLOP RPC verification failed: ${error?.message || "unknown error"}`);
  process.exitCode = 1;
} finally {
  try { await Promise.race([globalThis.RedDragonFlopReadOnly?.disconnect(), new Promise(resolve => setTimeout(resolve, 2_000))]); } catch {}
  clearTimeout(timeout);
}
if (process.exitCode) process.exit(process.exitCode);
console.log(JSON.stringify(result));
