import assert from 'node:assert/strict';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { cryptoWaitReady, decodeAddress } from '@polkadot/util-crypto';
import { createDirectSessionRuntime } from './node_modules/@flop-labs/sdk/dist/compute-channel/direct-session-chain.js';

import { verifyMinerProof } from './flop-miner-proof.mjs';

import { checkBudget, DURATION, ENDPOINT, ESCROW, GENESIS, MINER, MODEL, PAYER as ADDRESS } from './flop-spend.mjs';
const deny=()=>{throw Error('READ_ONLY: signing forbidden')};
await cryptoWaitReady();
let api;
try{
  api=await ApiPromise.create({provider:new WsProvider('wss://testnet.flop.network/'),noInitWarn:true});
  assert.equal(api.genesisHash.toHex(),GENESIS);
  const head=await api.rpc.chain.getFinalizedHead(),at=await api.at(head),header=await api.rpc.chain.getHeader(head);
  const { free, frozen } = (await at.query.system.account(ADDRESS)).data;
  const balance = free.toBigInt();
  // Only resolve identity and calibration; no transaction or signing method is invoked.
  const runtime=await createDirectSessionRuntime({api,signer:{address:ADDRESS,signer:{signPayload:deny,signRaw:deny}},miner:MINER,model:MODEL,endpoint:ENDPOINT,via:'force',maxDurationSeconds:DURATION,maxFlop:ESCROW});
  const cap=(await at.query.hwCalibration.benchmarkBurstCaps(MINER)).unwrap().toJSON();
  const rate=(await at.query.computeChannel.minerCapacityReservationRate(MINER)).toString();
  const tariff=at.consts.computeChannel.unconsentedReservationTariff.toString();
  const floor=BigInt(rate)*runtime.maxDuration*BigInt(tariff);
  const minBalance=at.consts.balances.existentialDeposit.toBigInt();
  const registry = await runtime.resolveIdentity();
  const quote = await api.tx.computeChannel.forceOpen(MINER, registry.modelHash, registry.measuredRoot,
    registry.decodePolicyHash, registry.precision, decodeAddress(ADDRESS),
    { maxTurns: 1, maxDuration: runtime.maxDuration, reattestEvery: 1 }, ESCROW, 0n).paymentInfo(ADDRESS);
  console.log('PUBLIC_QUOTE='+JSON.stringify({ block:header.number.toString(), head:head.toHex(),
    runtime:api.runtimeVersion.specVersion.toString(), balance:balance.toString(),
    feeEstimate:quote.partialFee.toString(), escrow:ESCROW.toString(), floor:floor.toString() }));
  checkBudget({ fee:quote.partialFee.toBigInt(), available:balance-frozen.toBigInt(), reserve:minBalance, floor });
  await verifyMinerProof(api, runtime);
  console.log('READINESS_RESULT='+JSON.stringify({state:'verified-read-only',head:head.toHex(),block:header.number.toString(),payerBalanceRaw:balance.toString(),signatureVerified:true,registryMatches:true,wrongChallengeRejected:true,notReadyRejected:true,wrongKeyRejected:true,calibrated:true,capacity:cap.capGflopsPerSec,escrowFloorRaw:floor.toString(),candidateEscrowRaw:ESCROW.toString(),feeEstimateVerified:true,turnTariffVerified:false,transactionSent:false}));
}finally{await api?.disconnect();}
