import assert from 'node:assert/strict';

const REPO = 'maho0638/reddragon-technocore';
const BRANCH = 'flop-inference-state';
const URL = `https://api.github.com/repos/${REPO}/contents/flop-testnet-first-inference.json`;
const HASH = /^0x[0-9a-f]{64}$/;

const fields = {
  reserved: ['payer', 'runtime', 'genesis', 'miner', 'model'],
  prepared: ['channelId', 'nonce', 'escrow', 'maxDuration'],
  'submission-prepared': ['channelId', 'txHash', 'accountNonce', 'eraBirth', 'eraPeriod'],
  'open-finalized': ['channelId', 'txHash', 'blockHash'],
  verified: ['channelId', 'root', 'gn'],
  'settlement-pending': ['channelId', 'txHash'],
  'paid-finalized': ['channelId', 'txHash', 'paid'],
};

function publicRecord(value) {
  const keys = fields[value.status];
  assert.ok(Array.isArray(keys), 'UNKNOWN_JOURNAL_STAGE');
  const input = value.status === 'prepared' ? value.intent : value;
  const row = { status: value.status };
  for (const key of keys) {
    const v = typeof input[key] === 'bigint' ? input[key].toString() : input[key];
    assert.ok(typeof v === 'number' ? Number.isSafeInteger(v) :
      typeof v === 'string' && /^[a-zA-Z0-9./-]{1,96}$/.test(v), 'INVALID_JOURNAL_METADATA');
    if (['genesis', 'channelId', 'root', 'txHash', 'blockHash'].includes(key)) {
      assert.match(v, HASH);
    }
    row[key] = v;
  }
  return row;
}

// A first PUT without a blob SHA creates the reservation atomically. Every
// following PUT must match the preceding SHA. An uncertain response stops the run.
export function createGitHubJournal({ token, repository, commit, runId, fetchImpl = fetch }) {
  assert.equal(repository, REPO);
  assert.ok(token && /^[0-9a-f]{40}$/.test(commit) && /^[0-9]+$/.test(runId), 'INVALID_GITHUB_CONTEXT');
  let sha;
  let pending = false;
  const records = [];
  return async value => {
    assert.ok(!pending && (sha ? value.status !== 'reserved' : value.status === 'reserved'),
      'INVALID_JOURNAL_SEQUENCE');
    pending = true;
    const record = publicRecord(value);
    const content = Buffer.from(JSON.stringify({ commit, runId, records: [...records, record] }, null, 2)).toString('base64');
    const response = await fetchImpl(URL, {
      method: 'PUT', redirect: 'error', signal: AbortSignal.timeout(12000),
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json',
        'content-type': 'application/json', 'x-github-api-version': '2022-11-28' },
      body: JSON.stringify({ branch: BRANCH, message: `Record FLOP inference: ${record.status}`, content,
        ...(sha ? { sha } : {}) }),
    });
    assert.equal(response.status, sha ? 200 : 201, 'DURABLE_JOURNAL_WRITE_REFUSED');
    const result = await response.json();
    assert.match(result.content?.sha ?? '', /^[0-9a-f]{40}$/, 'DURABLE_JOURNAL_ACK_MISSING');
    records.push(record);
    sha = result.content.sha;
    pending = false;
  };
}
