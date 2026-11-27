import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGitHubJournal } from './flop-github-journal.mjs';

const context = { token: 'mock', repository: 'maho0638/reddragon-technocore',
  commit: 'a'.repeat(40), runId: '12' };
const reserve = { status: 'reserved', payer: 'test-payer', runtime: 123,
  genesis: '0x' + 'b'.repeat(64), miner: 'test-miner', model: 'qwen/public' };

test('journal reserve is atomic and following writes use the returned blob SHA', async () => {
  const requests = [];
  const journal = createGitHubJournal({ ...context, fetchImpl: async (_, req) => {
    requests.push(JSON.parse(req.body));
    return { status: requests.length === 1 ? 201 : 200, json: async () => ({ content: { sha: 'c'.repeat(40) } }) };
  } });
  await journal(reserve);
  await journal({ status: 'prepared', intent: { channelId: reserve.genesis, nonce: '1', escrow: '5',
    maxDuration: '1200', sessionSeed: 'do-not-store' } });
  await journal({ status: 'verified', channelId: reserve.genesis, root: reserve.genesis, gn: 2n,
    output: 'do-not-store', claim: { secret: 'do-not-store' }, receipt: { text: 'do-not-store' } });
  assert.equal(requests[0].sha, undefined);
  assert.equal(requests[1].sha, 'c'.repeat(40));
  assert.equal(requests[0].branch, 'flop-inference-state');
  const stored = Buffer.from(requests[2].content, 'base64').toString();
  assert.equal(JSON.parse(stored).records.length, 3);
  assert.doesNotMatch(stored, /do-not-store|sessionSeed|output|claim|receipt/);
});

for (const status of [200, 409, 422, 500]) {
  test(`reservation failure ${status} blocks all further journal writes`, async () => {
    let calls = 0;
    const journal = createGitHubJournal({ ...context, fetchImpl: async () => { calls++; return { status }; } });
    await assert.rejects(journal(reserve), /DURABLE_JOURNAL_WRITE_REFUSED/);
    await assert.rejects(journal(reserve), /INVALID_JOURNAL_SEQUENCE/);
    assert.equal(calls, 1);
  });
}
