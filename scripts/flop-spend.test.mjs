import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkBudget, ESCROW, GENESIS, MAX_FEE, MINER, MODEL, PAYER, spendOnce } from './flop-spend.mjs';

const runtime = { payer: PAYER, genesisHash: GENESIS, specVersion: 123 };
const channelId = Buffer.alloc(32, 42);
const root = Buffer.alloc(32, 43);
const txHash = '0x' + 'cc'.repeat(32);
const toHex = bytes => '0x' + bytes.toString('hex');
const intent = { channelId: toHex(channelId), sessionSeed: '0x' + 'ab'.repeat(32),
  agent: PAYER, genesisHash: GENESIS, miner: MINER, model: MODEL, escrow: ESCROW.toString() };
const receipt = { runningRoot: root, gN: 5n, output: Buffer.from('verified result') };
const claim = { channelId, finalRoot: root, aggregateGn: 5n };
const result = { miner: MINER, reply: 'Verified result', receipts: [receipt], channelId, settleTx: txHash,
  settlement: { channelId, txHash, aggregateGn: 5n, cooperative: true, minerPaid: 4n, burned: 1n } };

async function fixture(t, overrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'flop-spend-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const read = () => readFile(join(directory, 'reddragon-flop-spend.jsonl'), 'utf8');
  const options = { directory, runtime, approvedRuntime: 123, prompt: 'Summarize this public text.',
    runSession: async (opts, persistSubmission, persistFinalized) => {
      await opts.onPrepared(intent);
      assert.match(await read(), /"status":"prepared"/);
      await persistSubmission({ signer: PAYER, txHash, accountNonce: 0n, eraBirth: 42n, eraPeriod: 64n });
      assert.match(await read(), /"status":"submission-prepared"/);
      await persistFinalized({ txHash, blockHash: txHash });
      await opts.onVerified(receipt, claim);
      assert.match(await read(), /"status":"verified"/);
      return result;
    }, ...overrides };
  return { read, options };
}

test('fee, reserve, escrow floor and balance must all pass', () => {
  const quote = { fee: MAX_FEE, reserve: 1n, floor: ESCROW, available: ESCROW + MAX_FEE + 1n };
  checkBudget(quote);
  for (const [patch, error] of [
    [{ fee: MAX_FEE + 1n }, /FEE_OUT/], [{ fee: 0n }, /FEE_OUT/],
    [{ reserve: 0n }, /INSUFFICIENT/], [{ floor: ESCROW + 1n }, /ESCROW_OUT/],
    [{ floor: 0n }, /ESCROW_OUT/], [{ available: quote.available - 1n }, /INSUFFICIENT/],
    [{ fee: undefined }, /BUDGET_UNAVAILABLE/],
  ]) assert.throws(() => checkBudget({ ...quote, ...patch }), error);
});

test('journal is persisted before an ACK and prevents repeat or concurrent spend', async t => {
  const { options } = await fixture(t);
  const outcomes = await Promise.allSettled([spendOnce(options), spendOnce(options)]);
  const paid = outcomes.find(item => item.status === 'fulfilled').value;
  assert.equal(paid.status, 'paid-finalized');
  assert.equal(paid.faucetEligibility, 'unconfirmed');
  assert.equal(outcomes.find(item => item.status === 'rejected').reason.code, 'EEXIST');
  await assert.rejects(spendOnce(options), { code: 'EEXIST' });
});

test('unapproved runtime or wrong payer cannot enter the SDK', async t => {
  const { options } = await fixture(t);
  for (const patch of [{ approvedRuntime: 999 }, { runtime: { ...runtime, payer: MINER } }]) {
    await assert.rejects(spendOnce({ ...options, ...patch }), /RUNTIME_OR_PAYER/);
  }
});

test('miner mismatch cannot reach opening', async t => {
  const { options } = await fixture(t, {
    runSession: opts => opts.onPrepared({ ...intent, miner: PAYER }),
  });
  await assert.rejects(spendOnce(options), /INTENT_MISMATCH/);
});

for (const [name, change, expected] of [
  ['posting is pending', { settlement: { ...result.settlement, cooperative: undefined } }, 'settlement-pending'],
  ['wrong channel is rejected', { channelId: Buffer.alloc(32) }, /SETTLEMENT_MISMATCH/],
  ['wrong output is rejected', { receipts: [{ ...receipt, output: Buffer.from('wrong') }] }, /SETTLEMENT_MISMATCH/],
  ['zero payment is rejected', { settlement: { ...result.settlement, minerPaid: 0n } }, /PAYMENT_OUT_OF_BOUNDS/],
]) {
  test(name, async t => {
    const { options } = await fixture(t);
    const runSession = options.runSession;
    options.runSession = async (...args) => ({ ...await runSession(...args), ...change });
    const execution = spendOnce(options);
    if (expected instanceof RegExp) await assert.rejects(execution, expected);
    else assert.equal((await execution).status, expected);
  });
}

test('ambiguous submission preserves the original intent and blocks a retry', async t => {
  const { options, read } = await fixture(t, {
    runSession: async (opts, persistSubmission) => {
      await opts.onPrepared(intent);
      throw new Error('timeout');
    },
  });
  await assert.rejects(spendOnce(options), /timeout/);
  assert.match(await read(), new RegExp(intent.channelId));
  await assert.rejects(spendOnce(options), { code: 'EEXIST' });
});

test('selected miner is recorded and finalized open cannot refer to a different transaction', async t => {
  const candidate = { miner: PAYER, model: MODEL, endpoint: 'https://example.invalid' };
  const { options, read } = await fixture(t, { candidate,
    runSession: async (opts, persist, finalize) => {
      assert.equal(opts.miner, candidate.miner);
      await opts.onPrepared({ ...intent, miner: candidate.miner });
      await persist({ signer: PAYER, txHash, accountNonce: 0n, eraBirth: 42n, eraPeriod: 64n });
      await finalize({ txHash, blockHash: txHash });
      await assert.rejects(finalize({ txHash: intent.channelId, blockHash: txHash }), /FINALIZED_OPEN_MISMATCH/);
      await opts.onVerified(receipt, claim);
      return { ...result, miner: candidate.miner };
    },
  });
  assert.equal((await spendOnce(options)).status, 'paid-finalized');
  const records = (await read()).trim().split('\n').map(JSON.parse);
  assert.deepEqual(records.map(row => row.status),
    ['reserved', 'prepared', 'submission-prepared', 'open-finalized', 'verified', 'paid-finalized']);
  assert.equal(records[0].miner, candidate.miner);
  assert.equal(records[3].txHash, txHash);
});

test('miner selection rejects unanchored, over-budget and unpaid candidates before ranking', async () => {
  const { selectMiner } = await import('./flop-miners.mjs');
  const valid = { id: 'm11', verified: true, budgetOk: true, paidChannel: intent.channelId, total: 5n };
  assert.equal(selectMiner([
    { ...valid, id: 'm2', total: 1n, verified: false },
    { ...valid, id: 'm4', total: 2n, budgetOk: false },
    { ...valid, id: 'm5', total: 3n, paidChannel: undefined },
    { ...valid, id: 'm6', total: 6n },
    valid,
  ]), valid);
  assert.equal(selectMiner([{ ...valid, total: undefined }]), undefined);
});

test('receipt cannot advance the journal before the opening finalizes', async t => {
  const { options, read } = await fixture(t, {
    runSession: async (opts, persist) => {
      await opts.onPrepared(intent);
      await persist({ signer: PAYER, txHash, accountNonce: 0n, eraBirth: 42n, eraPeriod: 64n });
      await opts.onVerified(receipt, claim);
    },
  });
  await assert.rejects(spendOnce(options), /RECEIPT_MISMATCH/);
  assert.match(await read(), /submission-prepared/);
  assert.doesNotMatch(await read(), /"status":"verified"/);
  await assert.rejects(spendOnce(options), { code: 'EEXIST' });
});

test('failed durable submission write blocks broadcast and subsequent retry', async t => {
  let broadcast = false;
  const { options } = await fixture(t, {
    persistMetadata: async entry => {
      if (entry.status === 'submission-prepared') throw new Error('durable state unavailable');
    },
    runSession: async (opts, persist) => {
      await opts.onPrepared(intent);
      await persist({ signer: PAYER, txHash, accountNonce: 0n, eraBirth: 42n, eraPeriod: 64n });
      broadcast = true;
    },
  });
  await assert.rejects(spendOnce(options), /durable state unavailable/);
  assert.equal(broadcast, false);
  await assert.rejects(spendOnce(options), { code: 'EEXIST' });
});
