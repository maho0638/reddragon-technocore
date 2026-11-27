import assert from 'node:assert/strict';
import { hexToU8a } from '@polkadot/util';
import { decodeAddress } from '@polkadot/util-crypto';
import { createDirectSessionRuntime } from './node_modules/@flop-labs/sdk/dist/compute-channel/direct-session-chain.js';
import { verifyMinerProof } from './flop-miner-proof.mjs';
import { MINERS } from './flop-miners.mjs';
import { checkBudget, DURATION, ESCROW, GENESIS, MAX_BLOCKS, PAYER } from './flop-spend.mjs';

const deny = () => { throw new Error('READ_ONLY'); };

export const PAID_CHANNELS = [
  { miner: 'm11', channel: '0xd2432f817a03686f30c1c6fd9db9d04badb55e2be1632ca99d587041ecd8bf35',
    block: 272452, tx: '0x90ce93ebf7962e3bc6fb1cabb2a946aa39c6318f1206886fd6c14765f4e19acc' },
  { miner: 'm11', channel: '0xe5df15fc8c976b70c906b94319cb6704b24b5f930118862b3b8525580f694d9f',
    block: 274894, tx: '0x11d066a6546f3ffbe6082d147e85145fa70894a18c7d980dfd9c7f80d621ee88' },
  { miner: 'm6', channel: '0x21db5fbf276788e798b826ded38905bc5cfeeb8bc4dc0190a52bd2d58941a730',
    block: 276996, tx: '0x9bb328d6f4a6d7cc0751b3546bbff2bc00a42d40d63da031b77ee8833a435453' },
  { miner: 'm7', channel: '0x2fbb10f1305d3f090976c3dec7af3cd2ce397221952093e7381c90ba8fc0a18e',
    block: 277163, tx: '0x391937c7eca8b204d8e26df9064cc6e20524f20031ad97e4f8427a3930a77d9f' },
  { miner: 'm16', channel: '0x51e33018b5b21ea61cbad7a9a0622878ef2ec21ecb409f46b18cb1944529cd0e',
    block: 277499, tx: '0x17fcf8c32de7a6ff2cc489acf663bc4df6de0d04985389e5e6fe608893d3aea0' },
];

async function paidEvidence(api, candidate, height) {
  const proof = PAID_CHANNELS.filter(entry => entry.miner === candidate.id && entry.block <= height)
    .sort((a, b) => b.block - a.block)[0];
  if (!proof) return undefined;
  const hash = await api.rpc.chain.getBlockHash(proof.block);
  const [block, historical] = await Promise.all([api.rpc.chain.getBlock(hash), api.at(hash)]);
  const [events, raw] = await Promise.all([
    historical.query.system.events(), historical.query.computeChannel.channels(proof.channel),
  ]);
  const index = block.block.extrinsics.findIndex(tx => tx.hash.toHex() === proof.tx);
  assert.ok(index >= 0, 'HISTORICAL_TRANSACTION_MISSING');
  const scoped = events.filter(({ phase }) => phase.isApplyExtrinsic && phase.asApplyExtrinsic.toNumber() === index);
  const settled = scoped.find(({ event }) => historical.events.computeChannel.Settled.is(event))?.event.data;
  const channel = raw.unwrap();
  assert.equal(channel.miner.toString(), candidate.miner);
  assert.ok(channel.state.isClosed && scoped.some(({ event }) => historical.events.system.ExtrinsicSuccess.is(event)));
  assert.ok(settled && settled[0].toHex() === proof.channel && settled[1].toBigInt() > 0n && settled[4].isTrue,
    'POSITIVE_COOPERATIVE_PAYMENT_MISSING');
  return { ...proof, paid: settled[1].toString(), key: channel.enclaveKey.toHex(),
    modelHash: channel.modelHash.toHex(), measuredRoot: channel.measuredRoot.toHex() };
}

export async function assessMiners(api) {
  assert.equal(api.genesisHash.toHex(), GENESIS);
  const head = await api.rpc.chain.getFinalizedHead();
  const [at, header] = await Promise.all([api.at(head), api.rpc.chain.getHeader(head)]);
  const block = header.number.toNumber();
  const { free, frozen } = (await at.query.system.account(PAYER)).data;
  const available = free.toBigInt() - frozen.toBigInt();
  const reserve = at.consts.balances.existentialDeposit.toBigInt();
  const tariff = at.consts.computeChannel.unconsentedReservationTariff.toBigInt();
  const registries = new Map();
  const candidates = await Promise.all(MINERS.map(async candidate => {
    const row = { ...candidate };
    try {
      const runtime = await createDirectSessionRuntime({
        api, ...candidate, signer: { address: PAYER, signer: { signPayload: deny, signRaw: deny } },
        via: 'force', maxDurationSeconds: DURATION, maxFlop: ESCROW,
      });
      if (!registries.has(candidate.model)) registries.set(candidate.model, runtime.resolveIdentity());
      const registry = await registries.get(candidate.model);
      row.registry = registry;
      const [rate, cap, evidence, enclave] = await Promise.allSettled([
        at.query.computeChannel.minerCapacityReservationRate(candidate.miner),
        at.query.hwCalibration.benchmarkBurstCaps(candidate.miner),
        paidEvidence(api, candidate, block),
        verifyMinerProof(candidate, registry),
      ]);
      if (evidence.status === 'fulfilled') row.history = evidence.value;
      else row.historyError = evidence.reason.message;
      if (enclave.status === 'fulfilled') {
        row.signatureVerified = true;
        const history = row.history;
        if (history && history.key.slice(2) === Buffer.from(enclave.value).toString('hex') &&
            history.modelHash.slice(2) === Buffer.from(registry.modelHash).toString('hex') &&
            history.measuredRoot.slice(2) === Buffer.from(registry.measuredRoot).toString('hex')) {
          row.paidChannel = history.channel;
          row.enclaveKey = hexToU8a(history.key);
        }
      } else row.proofError = enclave.reason.message;
      const lease = at.consts.hwCalibration.calibrationLeaseBlocks.toBigInt();
      row.calibrated = cap.status === 'fulfilled' && cap.value.isSome &&
        BigInt(block) < cap.value.unwrap().acceptedAt.toBigInt() + lease;
      row.verified = Boolean(row.paidChannel && row.calibrated);
      const quote = await api.tx.computeChannel.forceOpen(candidate.miner, registry.modelHash, registry.measuredRoot,
        registry.decodePolicyHash, registry.precision, decodeAddress(PAYER),
        { maxTurns: 1, maxDuration: runtime.maxDuration, reattestEvery: 1 }, ESCROW, 0n).paymentInfo(PAYER);
      row.fee = quote.partialFee.toBigInt();
      row.blocks = runtime.maxDuration;
      if (rate.status === 'fulfilled') row.floor = BigInt(rate.value.toString()) * row.blocks * tariff;
      row.total = ESCROW + row.fee;
      assert.ok(row.blocks <= BigInt(MAX_BLOCKS), 'DURATION_EXCEEDS_APPROVAL');
      checkBudget({ fee: row.fee, available, reserve, floor: row.floor });
      row.budgetOk = true;
    } catch (error) {
      row.blocked = error.message;
    }
    return row;
  }));
  return { block, head: head.toHex(), runtime: at.runtimeVersion.specVersion.toNumber(), candidates };
}
