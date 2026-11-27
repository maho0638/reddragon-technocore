import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { cryptoWaitReady, decodeAddress } from '@polkadot/util-crypto';
import { hexToU8a, u8aToHex } from '@polkadot/util';
import { fetchSessionInfoProof, verifySessionInfoProof, modelIdentityHash } from './node_modules/@flop-labs/sdk/dist/miner-admission.js';
import { createDirectSessionRuntime } from './node_modules/@flop-labs/sdk/dist/compute-channel/direct-session-chain.js';

const GENESIS='0x918abd58fb16306b30ef3886514cfaebffecb4de43e82b6f8ec4795c43cfd800';
const ADDRESS='5HBqG8RN2WMPKhwq4AfGEPRBGsn82JQc28JU5pKCYW2QZFtW';
const MINER='5Cm99adrc7guxVoT6YnC7LxUmmVgPamRsw9nVifRA9NUwDmd';
const ENDPOINT='https://m14.floptest.xyz', MODEL='qwen/qwen3-8b';
const OLD='0xe58f3f1026a23f4f023255eb85dfae6b56fb0b6d3317f889fbb15c463e95da7f';
const DURATION=1200, ESCROW=5000000000000000n;
const deny=()=>{throw Error('READ_ONLY: signing forbidden')};
const eqHex=(a,b)=>assert.equal(String(a).replace(/^0x/,'').toLowerCase(),String(b).replace(/^0x/,'').toLowerCase());
const hex32=v=>{assert.match(v,/^[0-9a-f]{64}$/i);return hexToU8a('0x'+v)};
await cryptoWaitReady();
let api;
try{
  api=await ApiPromise.create({provider:new WsProvider('wss://testnet.flop.network/'),noInitWarn:true});
  assert.equal(api.genesisHash.toHex(),GENESIS);
  const head=await api.rpc.chain.getFinalizedHead(),at=await api.at(head),header=await api.rpc.chain.getHeader(head);
  const balance=(await at.query.system.account(ADDRESS)).data.free.toBigInt();
  const old=(await at.query.computeChannel.channels(OLD)).unwrap().toJSON();
  assert.equal(old.miner,MINER);assert.ok(Object.hasOwn(old.state,'closed'));
  // Only resolve identity and calibration; no transaction or signing method is invoked.
  const runtime=await createDirectSessionRuntime({api,signer:{address:ADDRESS,signer:{signPayload:deny,signRaw:deny}},miner:MINER,model:MODEL,endpoint:ENDPOINT,via:'force',maxDurationSeconds:DURATION,maxFlop:ESCROW});
  const registry=await runtime.resolveIdentity();
  assert.equal(await runtime.minerCalibrated(),true);
  console.log('REGISTRY_IDENTITY='+JSON.stringify(registry,(_,v)=>typeof v==='bigint'?v.toString():v instanceof Uint8Array?u8aToHex(v):v));
  const challenge=randomBytes(32),proof=await fetchSessionInfoProof(ENDPOINT,challenge);
  assert.equal(proof.ready,true);
  const m=proof.model_identity;
  assert.equal(m.requested_slug,MODEL);
  eqHex(m.model_hash,u8aToHex(registry.modelHash));eqHex(m.measured_root,u8aToHex(registry.measuredRoot));
  eqHex(m.decode_policy_hash,u8aToHex(registry.decodePolicyHash));
  assert.equal(m.precision,registry.precision);assert.equal(m.registry_model,registry.registryModel);assert.equal(m.registry_version,registry.registryVersion);
  eqHex(proof.enclave_key,old.enclaveKey);eqHex(old.modelHash,m.model_hash);eqHex(old.measuredRoot,m.measured_root);
  // Model wire identity has no secret content. Construct canonical typed value and verify signature.
  const identity={requestedSlug:m.requested_slug,registryModel:m.registry_model,registryVersion:m.registry_version,backendModelName:m.backend_model_name,modelHash:hex32(m.model_hash),measuredRoot:hex32(m.measured_root),decodePolicyHash:hex32(m.decode_policy_hash),precision:m.precision};
  const expected={challenge,genesisHash:hexToU8a(GENESIS),account:decodeAddress(MINER),enclaveKey:hexToU8a(old.enclaveKey),modelIdentityHash:modelIdentityHash(identity)};
  assert.ok(verifySessionInfoProof(proof,expected),'signed proof refused');
  assert.equal(verifySessionInfoProof(proof,{...expected,challenge:randomBytes(32)}),undefined);
  assert.equal(verifySessionInfoProof({...proof,ready:false},expected),undefined);
  assert.equal(verifySessionInfoProof(proof,{...expected,enclaveKey:randomBytes(32)}),undefined);
  const cap=(await at.query.hwCalibration.benchmarkBurstCaps(MINER)).unwrap().toJSON();
  const rate=(await at.query.computeChannel.minerCapacityReservationRate(MINER)).toString();
  const tariff=api.consts.computeChannel.unconsentedReservationTariff.toString();
  const floor=BigInt(rate)*BigInt(DURATION)*BigInt(tariff);
  assert.ok(floor>0n&&ESCROW>=floor);
  const minBalance=api.consts.balances.existentialDeposit.toBigInt();
  assert.ok(balance>ESCROW+minBalance);
  console.log('READINESS_RESULT='+JSON.stringify({state:'verified-read-only',head:head.toHex(),block:header.number.toString(),payerBalanceRaw:balance.toString(),signatureVerified:true,registryMatches:true,wrongChallengeRejected:true,notReadyRejected:true,wrongKeyRejected:true,calibrated:true,capacity:cap.capGflopsPerSec,escrowFloorRaw:floor.toString(),candidateEscrowRaw:ESCROW.toString(),feeEstimateVerified:false,turnTariffVerified:false,transactionSent:false}));
}finally{await api?.disconnect();}
