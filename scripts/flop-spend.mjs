import { lstat, open } from 'node:fs/promises';
import { join } from 'node:path';

export const GENESIS = '0x918abd58fb16306b30ef3886514cfaebffecb4de43e82b6f8ec4795c43cfd800';
export const PAYER = '5HBqG8RN2WMPKhwq4AfGEPRBGsn82JQc28JU5pKCYW2QZFtW';
export const MINER = '5Cm99adrc7guxVoT6YnC7LxUmmVgPamRsw9nVifRA9NUwDmd';
export const MODEL = 'qwen/qwen3-8b';
export const ENDPOINT = 'https://m14.floptest.xyz';
export const ESCROW = 5_000_000_000_000_000n;
export const MAX_FEE = 10_000_000_000_000_000n;
export const DURATION = 1200;
const HASH = /^0x[0-9a-f]{64}$/;
const hex = bytes => '0x' + Buffer.from(bytes).toString('hex');
const require = (condition, code) => { if (!condition) throw new Error(code); };

export function checkBudget({ fee, available, reserve, floor }) {
  require([fee, available, reserve, floor].every(value => typeof value === 'bigint'), 'BUDGET_UNAVAILABLE');
  require(fee > 0n && fee <= MAX_FEE, 'FEE_OUT_OF_BOUNDS');
  require(floor > 0n && floor <= ESCROW, 'ESCROW_OUT_OF_BOUNDS');
  require(available >= ESCROW + fee + reserve && reserve > 0n, 'INSUFFICIENT_SPENDABLE_BALANCE');
}

export function classifySettlement(result, { channelId, root, gn, output }) {
  const settlement = result.settlement;
  require(result.receipts?.length === 1 && result.reply?.trim() &&
    hex(result.receipts[0].runningRoot) === root && hex(result.receipts[0].output) === output &&
    result.receipts[0].gN === gn && hex(result.channelId) === channelId &&
    result.miner === MINER && hex(settlement.channelId) === channelId &&
    HASH.test(settlement.txHash) && settlement.txHash === result.settleTx &&
    settlement.aggregateGn === gn, 'SETTLEMENT_MISMATCH');

  if (settlement.cooperative !== true) {
    return { status: 'settlement-pending', channelId, txHash: settlement.txHash };
  }
  require(settlement.minerPaid > 0n && settlement.burned >= 0n &&
    settlement.minerPaid + settlement.burned <= ESCROW, 'SETTLEMENT_PAYMENT_OUT_OF_BOUNDS');
  return { status: 'paid-finalized', channelId, txHash: settlement.txHash,
    paid: settlement.minerPaid.toString(), faucetEligibility: 'unconfirmed' };
}

// Use a pre-existing private, durable directory shared by all runners for this payer.
// A stuck or incomplete journal blocks a replay until the original channel is reconciled.
export async function spendOnce({ directory, approvedRuntime, prompt, runtime, runSession }) {
  require(runtime.genesisHash === GENESIS && runtime.payer === PAYER &&
    Number.isSafeInteger(approvedRuntime) && approvedRuntime > 0 &&
    runtime.specVersion === approvedRuntime, 'RUNTIME_OR_PAYER_UNAPPROVED');
  require(typeof prompt === 'string' && prompt.trim() && Buffer.byteLength(prompt) <= 4096, 'WORKLOAD_REQUIRED');
  const permissions = await lstat(directory);
  require(permissions.isDirectory() && (permissions.mode & 0o077) === 0, 'PRIVATE_STATE_DIRECTORY_REQUIRED');
  const filename = join(directory, 'reddragon-flop-spend.jsonl');
  const journal = await open(filename, 'ax', 0o600);
  const record = async value => {
    await journal.writeFile(JSON.stringify(value, (_, field) => typeof field === 'bigint'
      ? field.toString() : field instanceof Uint8Array ? hex(field) : field) + '\n');
    await journal.sync();
  };
  let intent, verified, submitted;
  try {
    await record({ status: 'reserved', payer: PAYER, runtime: approvedRuntime });
    const parent = await open(directory, 'r');
    try { await parent.sync(); } finally { await parent.close(); }
    const result = await runSession({
      miner: MINER, model: MODEL, endpoint: ENDPOINT, via: 'force',
      prompt, maxTokens: 64, maxDurationSeconds: DURATION, maxFlop: ESCROW,
      onPrepared: async candidate => {
        require(!intent && candidate.genesisHash === GENESIS && candidate.agent === PAYER &&
          candidate.miner === MINER && candidate.model === MODEL && HASH.test(candidate.channelId) &&
          HASH.test(candidate.sessionSeed) && candidate.escrow === ESCROW.toString(), 'INTENT_MISMATCH');
        await record({ status: 'prepared', intent: candidate });
        intent = candidate;
      },
      onVerified: async (receipt, claim) => {
        require(submitted && !verified && hex(claim.channelId) === intent.channelId &&
          hex(claim.finalRoot) === hex(receipt.runningRoot) && receipt.gN > 0n &&
          receipt.gN === claim.aggregateGn && receipt.output.length > 0, 'RECEIPT_MISMATCH');
        verified = { channelId: intent.channelId, root: hex(receipt.runningRoot),
          gn: receipt.gN, output: hex(receipt.output) };
        await record({ status: 'verified', receipt, claim });
      },
    }, async signed => {
      require(intent && !submitted && signed.signer === PAYER && HASH.test(signed.txHash) &&
        signed.accountNonce >= 0n && signed.eraBirth >= 0n && signed.eraPeriod > 0n, 'SIGNED_INTENT_MISMATCH');
      await record({ status: 'submission-prepared', channelId: intent.channelId, ...signed });
      submitted = true;
    });
    require(verified, 'MISSING_VERIFIED_RECEIPT');
    const verdict = classifySettlement(result, verified);
    await record(verdict);
    return verdict;
  } finally {
    await journal.close();
  }
}
