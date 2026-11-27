import assert from 'node:assert/strict';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ApiPromise, WsProvider, Keyring } from '@polkadot/api';
import { cryptoWaitReady, encodeAddress } from '@polkadot/util-crypto';
import { base58Encode } from '@polkadot/util-crypto';
import { spendWithSdk } from './flop-spend-sdk.mjs';
import { createGitHubJournal } from './flop-github-journal.mjs';
import { PAYER } from './flop-spend.mjs';

const DID = 'did:key:z6MkuhrsP4tDZjWYdZLPxaur19WvrF1yuLGsGB2S8Q1gwS6K';

function loadExistingSigner(encoded) {
  assert.match(encoded ?? '', /^[A-Za-z0-9+/]+=*$/, 'EXISTING_SIGNER_REQUIRED');
  const der = Buffer.from(encoded, 'base64');
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
  const { FLOP_EXPECTED_MINER, FLOP_EXPECTED_RUNTIME, FLOP_RUN_APPROVAL,
    TECHNOCORE_PRIVATE_KEY_PKCS8_B64, FLOP_JOURNAL_TOKEN, GITHUB_REPOSITORY, FLOP_REVIEWED_COMMIT, GITHUB_RUN_ID } = process.env;
  assert.equal(FLOP_RUN_APPROVAL, 'one-testnet-inference', 'USER_APPROVAL_REQUIRED');
  assert.match(FLOP_EXPECTED_MINER ?? '', /^m\d+$/);
  assert.match(FLOP_EXPECTED_RUNTIME ?? '', /^[1-9]\d*$/);
  assert.equal(process.env.GITHUB_RUN_ATTEMPT, '1', 'RERUN_FORBIDDEN');
  delete process.env.TECHNOCORE_PRIVATE_KEY_PKCS8_B64;
  delete process.env.FLOP_JOURNAL_TOKEN;
  const persistMetadata = createGitHubJournal({ token: FLOP_JOURNAL_TOKEN,
    repository: GITHUB_REPOSITORY, commit: FLOP_REVIEWED_COMMIT, runId: GITHUB_RUN_ID });
  await cryptoWaitReady();
  const signer = loadExistingSigner(TECHNOCORE_PRIVATE_KEY_PKCS8_B64);
  const directory = await mkdtemp(join(tmpdir(), 'flop-inference-'));
  let api;
  try {
    api = await ApiPromise.create({ provider: new WsProvider('wss://testnet.flop.network/'), noInitWarn: true });
    const result = await spendWithSdk({ api, signer, directory, persistMetadata,
      approvedRuntime: Number(FLOP_EXPECTED_RUNTIME), approvedMiner: FLOP_EXPECTED_MINER,
      prompt: 'In one sentence, explain the difference between inclusion and finality on a blockchain.' });
    console.log(JSON.stringify(result));
  } finally {
    signer.lock();
    try { await api?.disconnect(); } finally { await rm(directory, { recursive: true, force: true }); }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error('FLOP_EXECUTION_STOPPED: inspect the GitHub journal and finalized chain before any further action');
    process.exitCode = 1;
  });
}
