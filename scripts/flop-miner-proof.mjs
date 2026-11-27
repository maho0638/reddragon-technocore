import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { decodeAddress } from '@polkadot/util-crypto';
import { hexToU8a, u8aToHex } from '@polkadot/util';
import { fetchSessionInfoProof, verifySessionInfoProof, modelIdentityHash } from './node_modules/@flop-labs/sdk/dist/miner-admission.js';

import { ENDPOINT, GENESIS, MINER, MODEL } from './flop-spend.mjs';
const OLD='0xe58f3f1026a23f4f023255eb85dfae6b56fb0b6d3317f889fbb15c463e95da7f';
const eqHex=(a,b)=>assert.equal(String(a).replace(/^0x/,'').toLowerCase(),String(b).replace(/^0x/,'').toLowerCase());
const hex32=v=>{assert.match(v,/^[0-9a-f]{64}$/i);return hexToU8a('0x'+v)};

export async function verifyMinerProof(api, runtime) {
  const head = await api.rpc.chain.getFinalizedHead();
  const at = await api.at(head);
  const old = (await at.query.computeChannel.channels(OLD)).unwrap().toJSON();
  assert.equal(old.miner, MINER);
  assert.ok(Object.hasOwn(old.state, 'closed'));
  const registry = await runtime.resolveIdentity();
  assert.equal(await runtime.minerCalibrated(), true, 'MINER_CALIBRATION_UNAVAILABLE');
  const challenge=randomBytes(32),proof=await fetchSessionInfoProof(ENDPOINT,challenge);
  assert.equal(proof.ready,true,"MINER_NOT_READY");
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
  return hexToU8a(old.enclaveKey);
}
