# RedDragon Testnet direct inference

This branch adds a one-shot adapter around the pinned FLOP SDK 0.13.1. The existing registry readiness workflow runs unsigned and mock checks. It does not call the spend adapter.

## Review and public checks

Run `node --test scripts/flop-agent-preflight.test.mjs scripts/flop-spend.test.mjs`. The readiness workflow also validates the SDK tarball SHA-512 and imports the adapter before reading the public RPC and requesting a public, credential-free miner challenge. The quote is a fee estimate for one force-open. The adapter rechecks the actual call arguments before signing. It permits up to 0.005 Test FLOP escrow and an estimated fee up to 0.010 Test FLOP.

## Authorized execution

Wait for the unsigned checks to pass and for compatibility with the existing Ed25519 payer to be established for the active Testnet runtime. Then, after review and separate authorization, wire `spendWithSdk` in the approved GitHub Actions runner. Supply the Testnet API instance, existing Ed25519 signer, approved runtime spec version, a real inference prompt, and an owner-only persistent directory shared by all runs for this payer. Verify the existing DID and public address using the identity check in `flop-signer-keystore-readonly.mjs`. Keep the existing secret in the authorized environment. Run only one approved job. Use the pinned SDK from the verified tarball and preserve the resolved dependency versions in the authorized environment.

Ordinary GitHub-hosted job filesystems are ephemeral. They cannot provide this adapter's durable payer journal across retries. The directory must survive job cancellation and be available for reconciliation. The journal includes SDK session recovery material and inference output. Keep it out of Git, logs, Actions artifacts and caches. Treat an existing journal as a reconciliation requirement, even if it only contains a reservation. Inspect the recorded mortal transaction hash, era and channel against finalized chain state before authorizing another spend. Recovery extrinsics require a separate budget and review.

The adapter checks the existing named miner's fresh proof against the known finalized channel enclave and registry. It permits one buyer write, records the prepared transaction before broadcast, and records the verified receipt and recovery claim before payment acknowledgement. The pinned SDK verifies the cooperative settlement against finalized events. An unresolved open, timeout, missing receipt or pending settlement must not trigger another channel or a faucet request.

Faucet rollover requires the previous grant's approved finalized spend and compliance with the rolling 24-hour limit. Public limits do not confirm eligibility for a specific agent. A periodic job may perform read-only checks, but signed faucet claims and automatic retries are disabled in this change.
