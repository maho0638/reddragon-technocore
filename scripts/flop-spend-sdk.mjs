import assert from 'node:assert/strict';
import { runDirectSession } from '@flop-labs/sdk';
import { createDirectSessionRuntime } from './node_modules/@flop-labs/sdk/dist/compute-channel/direct-session-chain.js';
import { ComputeChannelChainClient } from './node_modules/@flop-labs/sdk/dist/compute-channel/chain.js';
import { FlopChainSubmitter } from './node_modules/@flop-labs/sdk/dist/compute-channel/flop-submitter.js';
import { u8aEq } from '@polkadot/util';
import { verifyMinerProof } from './flop-miner-proof.mjs';
import { checkBudget, DURATION, ENDPOINT, ESCROW, GENESIS, MINER, MODEL, PAYER, spendOnce } from './flop-spend.mjs';

// Call from the authorized runner with the existing signer and registry-bound miner proof check.
export async function spendWithSdk({ api, signer, directory, approvedRuntime, prompt }) {
  assert.equal(signer.address, PAYER);
  assert.equal(api.genesisHash.toHex(), GENESIS);
  const specVersion = () => api.runtimeVersion.specVersion.toNumber();
  assert.equal(specVersion(), approvedRuntime);
  const opts = { api, signer, miner: MINER, model: MODEL, endpoint: ENDPOINT, via: 'force',
    maxDurationSeconds: DURATION, maxFlop: ESCROW };
  const runtime = await createDirectSessionRuntime(opts);
  const enclaveKey = await verifyMinerProof(api, runtime);
  const snapshot = runtime.snapshot.bind(runtime);
  runtime.snapshot = async channelId => {
    const view = await snapshot(channelId);
    if (view.channel?.state === 'Open') {
      assert.ok(u8aEq(view.channel.enclaveKey, enclaveKey), 'CHANNEL_ENCLAVE_CHANGED');
    }
    return view;
  };
  const submitter = new FlopChainSubmitter(api, signer, true);
  let recordSubmission;
  let submitted = false;
  runtime.chain = new ComputeChannelChainClient({
    async submit(pallet, method, args) {
      // This first-spend runner budgets one buyer extrinsic. Recovery must be separately reconciled.
      assert.ok(recordSubmission && !submitted && pallet === 'computeChannel' && method === 'forceOpen',
        'BUYER_WRITE_NOT_AUTHORIZED');
      assert.equal(args[0], MINER);
      assert.equal(args[7], ESCROW);
      const head = await api.rpc.chain.getFinalizedHead();
      const at = await api.at(head);
      const [account, rate, health, quote] = await Promise.all([
        at.query.system.account(PAYER),
        at.query.computeChannel.minerCapacityReservationRate(MINER),
        api.rpc.system.health(),
        api.tx.computeChannel.forceOpen(...args).paymentInfo(PAYER),
      ]);
      const free = account.data.free.toBigInt();
      const frozen = account.data.frozen.toBigInt();
      checkBudget({
        fee: quote.partialFee.toBigInt(),
        available: free - frozen,
        reserve: at.consts.balances.existentialDeposit.toBigInt(),
        floor: BigInt(rate.toString()) * runtime.maxDuration *
          at.consts.computeChannel.unconsentedReservationTariff.toBigInt(),
      });
      assert.ok(!health.isSyncing.isTrue && health.peers.toNumber() > 0, 'RPC_NOT_READY');
      assert.equal(specVersion(), approvedRuntime);
      submitted = true;
      const { send, ...signed } = await submitter.prepare(pallet, method, args);
      await recordSubmission(signed);
      assert.equal(specVersion(), approvedRuntime);
      return send();
    },
  });
  return spendOnce({
    directory, approvedRuntime, prompt,
    runtime: { genesisHash: GENESIS, payer: signer.address, specVersion: specVersion() },
    runSession: (options, persistSubmission) => {
      recordSubmission = persistSubmission;
      return runDirectSession({ ...opts, ...options }, runtime);
    },
  });
}
