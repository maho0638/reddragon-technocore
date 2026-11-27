import assert from 'node:assert/strict';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { ApiPromise, WsProvider, Keyring } from '@polkadot/api';
import { cryptoWaitReady, encodeAddress } from '@polkadot/util-crypto';
import { base58Encode } from '@polkadot/util-crypto';
import { spendWithSdk } from './flop-spend-sdk.mjs';
import { PAYER } from './flop-spend.mjs';

const DID = 'did:key:z6MkuhrsP4tDZjWYdZLPxaur19WvrF1yuLGsGB2S8Q1gwS6K';

async function loadExistingSigner(filename) {
  assert.ok(filename?.startsWith('/'), 'EXISTING_SIGNER_FILE_REQUIRED');
  const stat = await lstat(filename);
  assert.ok(stat.isFile() && stat.uid === process.getuid() && (stat.mode & 0o077) === 0,
    'PRIVATE_SIGNER_FILE_REQUIRED');
  const der = await readFile(filename);
  let seed;
  try {
    const key = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
    assert.equal(key.asymmetricKeyType, 'ed25519');
    const jwk = createPublicKey(key).export({ format: 'jwk' });
    const pub = Buffer.from(jwk.x, 'base64url');
    assert.equal(pub.length, 32);
    assert.equal(encodeAddress(pub, 42), PAYER);
    assert.equal('did:key:z' + base58Encode(Buffer.concat([Buffer.from([0xed, 1]), pub])), DID);
    seed = Buffer.from(key.export({ format: 'jwk' }).d, 'base64url');
    assert.equal(seed.length, 32);
    const signer = new Keyring({ type: 'ed25519', ss58Format: 42 }).addFromSeed(seed);
    assert.equal(signer.address, PAYER);
    return signer;
  } finally {
    der.fill(0);
    seed?.fill(0);
  }
}

async function main() {
  const { FLOP_EXPECTED_MINER, FLOP_EXPECTED_RUNTIME, FLOP_STATE_DIRECTORY,
    FLOP_EXISTING_SIGNER_FILE, FLOP_RUN_APPROVAL } = process.env;
  assert.equal(FLOP_RUN_APPROVAL, 'one-testnet-inference', 'USER_APPROVAL_REQUIRED');
  assert.match(FLOP_EXPECTED_MINER ?? '', /^m\d+$/);
  assert.match(FLOP_EXPECTED_RUNTIME ?? '', /^[1-9]\d*$/);
  assert.ok(FLOP_STATE_DIRECTORY?.startsWith('/'), 'DURABLE_STATE_DIRECTORY_REQUIRED');
  await cryptoWaitReady();
  const signer = await loadExistingSigner(FLOP_EXISTING_SIGNER_FILE);
  const api = await ApiPromise.create({ provider: new WsProvider('wss://testnet.flop.network/'), noInitWarn: true });
  try {
    const result = await spendWithSdk({ api, signer, directory: FLOP_STATE_DIRECTORY,
      approvedRuntime: Number(FLOP_EXPECTED_RUNTIME), approvedMiner: FLOP_EXPECTED_MINER,
      prompt: 'In one sentence, explain the difference between inclusion and finality on a blockchain.' });
    console.log(JSON.stringify(result));
  } finally {
    signer.lock();
    await api.disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error('FLOP_EXECUTION_STOPPED: inspect the private journal before any further action');
    process.exitCode = 1;
  });
}
