import assert from 'node:assert/strict';
import { runDirectSession } from '@flop-labs/sdk';
import { createDirectSessionRuntime } from './node_modules/@flop-labs/sdk/dist/compute-channel/direct-session-chain.js';
import { ComputeChannelChainClient } from './node_modules/@flop-labs/sdk/dist/compute-channel/chain.js';
import { FlopChainSubmitter } from './node_modules/@flop-labs/sdk/dist/compute-channel/flop-submitter.js';
import { u8aEq } from '@polkadot/util';
import { assessMiners } from './flop-miner-readiness.mjs';
import { selectMiner } from './flop-miners.mjs';
import { checkBudget, DURATION, ESCROW, GENESIS, MAX_BLOCKS, PAYER, spendOnce } from './flop-spend.mjs';

// Call from the authorized runner with the existing signer and registry-bound miner proof check.
export async function spendWithSdk({ api, signer, directory, approvedRuntime, approvedMiner, prompt }) {
  assert.equal(signer.address, PAYER);
  assert.equal(signer.type, 'ed25519', 'PAYER_KEYTYPE_MISMATCH');
  assert.equal(api.genesisHash.toHex(), GENESIS);
  const specVersion = () => api.runtimeVersion.specVersion.toNumber();
  assert.equal(specVersion(), approvedRuntime);
  const assessment = await assessMiners(api);
  assert.equal(assessment.runtime, approvedRuntime);
  const candidate = selectMiner(assessment.candidates);
  assert.ok(candidate && candidate.id === approvedMiner, 'MINER_SELECTION_REQUIRES_APPROVAL');
  const { miner, model, endpoint, enclaveKey, registry } = candidate;
  const opts = { api, signer, miner, model, endpoint, via: 'force',
    maxDurationSeconds: DURATION, maxFlop: ESCROW };
  const runtime = await createDirectSessionRuntime(opts);
  assert.equal(runtime.maxDuration, candidate.blocks);
  assert.ok(runtime.maxDuration <= BigInt(MAX_BLOCKS));
  const resolveIdentity = runtime.resolveIdentity.bind(runtime);
  runtime.resolveIdentity = async () => {
    const current = await resolveIdentity();
    assert.deepEqual(current, registry, 'REGISTRY_IDENTITY_CHANGED');
    return current;
  };
  const snapshot = runtime.snapshot.bind(runtime);
  runtime.snapshot = async channelId => {
    const view = await snapshot(channelId);
    if (view.channel?.state === 'Open') {
      assert.ok(u8aEq(view.channel.enclaveKey, enclaveKey), 'CHANNEL_ENCLAVE_CHANGED');
    }
    return view;
  };
  const submitter = new FlopChainSubmitter(api, signer, true);
  let recordSubmission, recordFinalized;
  let submitted = false;
  runtime.chain = new ComputeChannelChainClient({
    async submit(pallet, method, args) {
      // This first-spend runner budgets one buyer extrinsic. Recovery must be separately reconciled.
      assert.ok(recordSubmission && !submitted && pallet === 'computeChannel' && method === 'forceOpen',
        'BUYER_WRITE_NOT_AUTHORIZED');
      assert.equal(args[0], miner);
      assert.equal(args[7], ESCROW);
      const head = await api.rpc.chain.getFinalizedHead();
      const at = await api.at(head);
      const [account, rate, health, quote] = await Promise.all([
        at.query.system.account(PAYER),
        at.query.computeChannel.minerCapacityReservationRate(miner),
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
      const finalized = await send();
      await recordFinalized({ blockHash: finalized.blockHash, txHash: finalized.txHash });
      return finalized;
    },
  });
  return spendOnce({
    directory, approvedRuntime, prompt, candidate,
    runtime: { genesisHash: GENESIS, payer: signer.address, specVersion: specVersion() },
    runSession: (options, persistSubmission, persistFinalized) => {
      recordSubmission = persistSubmission;
      recordFinalized = persistFinalized;
      return runDirectSession({ ...opts, ...options }, runtime);
    },
  });
}
