import { ApiPromise, WsProvider } from "@polkadot/api";
import { assertSupportedSpecVersion } from "../node_modules/@flop-labs/sdk/dist/runtime-compatibility.js";
import { formatFlop, transferRow } from "../public/flop-wallet-chain-core.mjs";

const TESTNET_RPC = "wss://testnet.flop.network";
const TESTNET_GENESIS = "0x918abd58fb16306b30ef3886514cfaebffecb4de43e82b6f8ec4795c43cfd800";
const MAX_BLOCKS_PER_PAGE = 25;
let apiPromise;
let apiReadyPromise;

async function getClient() {
  if (!apiReadyPromise) {
    apiReadyPromise = (async () => {
      const provider = new WsProvider(TESTNET_RPC, 2, undefined, 15000);
      const api = await ApiPromise.create({ provider, noInitWarn: true });
      try {
        await api.isReady;
        const genesis = (await api.rpc.chain.getBlockHash(0)).toHex().toLowerCase();
        if (genesis !== TESTNET_GENESIS) throw new Error("Connected RPC is not the official FLOP Testnet genesis");
        const specVersion = api.runtimeVersion.specVersion.toNumber();
        assertSupportedSpecVersion(specVersion);
        apiPromise = api;
        return api;
      } catch (error) {
        await api.disconnect();
        throw error;
      }
    })().catch((error) => { apiReadyPromise = undefined; throw error; });
  }
  return apiReadyPromise;
}

async function readTransfers(address, beforeHeight = null, limit = MAX_BLOCKS_PER_PAGE) {
  const api = apiPromise;
  if (!api) throw new Error("Testnet connection is not ready");
  const finalizedHash = await api.rpc.chain.getFinalizedHead();
  const finalizedHeader = await api.rpc.chain.getHeader(finalizedHash);
  const finalizedHeight = finalizedHeader.number.toNumber();
  const high = Math.min(Number.isSafeInteger(beforeHeight) ? beforeHeight : finalizedHeight, finalizedHeight);
  const low = Math.max(0, high - Math.min(Math.max(1, limit), MAX_BLOCKS_PER_PAGE) + 1);
  const rows = [];

  for (let batchHigh = high; batchHigh >= low; batchHigh -= 4) {
    const heights = Array.from({ length: Math.min(4, batchHigh - low + 1) }, (_, i) => batchHigh - i);
    const batchRows = await Promise.all(heights.map(async (height) => {
      const blockHash = await api.rpc.chain.getBlockHash(height);
      const [block, records] = await Promise.all([
        api.rpc.chain.getBlock(blockHash),
        api.query.system.events.at(blockHash)
      ]);
      const extrinsics = block.block.extrinsics;
      const matches = [];
      for (const record of records) {
        const event = record.event;
        if (event.section !== "balances" || event.method !== "Transfer") continue;
        const phase = record.phase;
        const index = phase?.isApplyExtrinsic ? phase.asApplyExtrinsic.toNumber() : -1;
        const txHash = index >= 0 && extrinsics[index] ? extrinsics[index].hash.toHex() : null;
        const transfer = transferRow(record, address, height, txHash);
        if (transfer) matches.push(transfer);
      }
      return matches;
    }));
    rows.push(...batchRows.flat());
  }
  return { finalizedHeight, scannedFrom: high, scannedTo: low, nextBeforeHeight: low > 0 ? low - 1 : null, rows };
}

globalThis.RedDragonFlopReadOnly = Object.freeze({
  async connect(address) {
    if (typeof address !== "string" || !address) throw new Error("Select a wallet account first");
    await getClient();
    const account = await apiPromise.query.system.account(address);
    const balance = formatFlop(account.data.free.toBigInt());
    return { balance, nonce: account.nonce, genesis: TESTNET_GENESIS, specVersion: apiPromise.runtimeVersion.specVersion.toNumber() };
  },
  readTransfers,
  async disconnect() {
    if (apiPromise) await apiPromise.disconnect();
    apiPromise = undefined;
    apiReadyPromise = undefined;
  },
  get maxBlocksPerPage() { return MAX_BLOCKS_PER_PAGE; }
});
