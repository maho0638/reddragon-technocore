import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { decodeAddress } from '@polkadot/util-crypto';
import { hexToU8a, u8aToHex } from '@polkadot/util';
import { fetchSessionInfoProof, verifySessionInfoProof, modelIdentityHash } from './node_modules/@flop-labs/sdk/dist/miner-admission.js';
import { GENESIS } from './flop-spend.mjs';

const eqHex = (a, b) => assert.equal(String(a).replace(/^0x/, '').toLowerCase(), String(b).replace(/^0x/, '').toLowerCase());
const hex32 = value => {
  assert.match(value, /^(?:0x)?[0-9a-f]{64}$/i);
  return hexToU8a('0x' + value.replace(/^0x/, ''));
};

export async function verifyMinerProof(candidate, registry, anchoredKey) {
  const challenge = randomBytes(32);
  const proof = await fetchSessionInfoProof(candidate.endpoint, challenge);
  assert.equal(proof.ready, true, 'MINER_NOT_READY');
  const m = proof.model_identity;
  assert.equal(m.requested_slug, candidate.model);
  eqHex(m.model_hash, u8aToHex(registry.modelHash));
  eqHex(m.measured_root, u8aToHex(registry.measuredRoot));
  eqHex(m.decode_policy_hash, u8aToHex(registry.decodePolicyHash));
  assert.equal(m.precision, registry.precision);
  assert.equal(m.registry_model, registry.registryModel);
  assert.equal(m.registry_version, registry.registryVersion);
  if (anchoredKey) eqHex(proof.enclave_key, anchoredKey);
  const identity = { requestedSlug: m.requested_slug, registryModel: m.registry_model,
    registryVersion: m.registry_version, backendModelName: m.backend_model_name,
    modelHash: hex32(m.model_hash), measuredRoot: hex32(m.measured_root),
    decodePolicyHash: hex32(m.decode_policy_hash), precision: m.precision };
  const enclaveKey = hex32(proof.enclave_key);
  const expected = { challenge, genesisHash: hexToU8a(GENESIS), account: decodeAddress(candidate.miner),
    enclaveKey, modelIdentityHash: modelIdentityHash(identity) };
  assert.ok(verifySessionInfoProof(proof, expected), 'MINER_SIGNATURE_INVALID');
  assert.equal(verifySessionInfoProof(proof, { ...expected, challenge: randomBytes(32) }), undefined);
  return enclaveKey;
}
