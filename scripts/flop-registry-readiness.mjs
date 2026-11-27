import { ApiPromise, WsProvider } from '@polkadot/api';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { assessMiners } from './flop-miner-readiness.mjs';
import { selectMiner } from './flop-miners.mjs';

await cryptoWaitReady();
const api = await ApiPromise.create({ provider: new WsProvider('wss://testnet.flop.network/'), noInitWarn: true });
try {
  const { candidates, ...snapshot } = await assessMiners(api);
  const chosen = selectMiner(candidates);
  console.log(JSON.stringify({ ...snapshot, selected: chosen?.id ?? null,
    candidates: candidates.map(({ registry, enclaveKey, ...report }) => report) },
  (_, value) => typeof value === 'bigint' ? value.toString() : value, 2));
  if (!chosen) process.exitCode = 1;
} finally {
  await api.disconnect();
}
