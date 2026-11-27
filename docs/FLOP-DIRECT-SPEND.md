# RedDragon Testnet direct inference

Run the unsigned regression suite with:

```sh
node --test scripts/flop-agent-preflight.test.mjs scripts/flop-spend.test.mjs scripts/flop-github-journal.test.mjs
```

The readiness workflow probes twelve published miners. It verifies fresh challenge signatures, finalized calibration, registry identity and historical positive cooperative payment, then ranks eligible miners by escrow plus estimated opening fee. A challenge signature alone only proves possession of the claimed enclave key. Missing payment history leaves that miner ineligible.

## Changes to review

The application, tests and dependency lockfile belong on `work/flop-inference`. The only file proposed for the default branch is `.github/workflows/flop-inference-approved.yml`. Review it separately after the development revision passes CI. It checks out an immutable full commit from the protected environment variable `FLOP_REVIEWED_COMMIT`. It does not use the default branch for application code. The existing checkpoint remains available in Git history.

## One approved execution on GitHub-hosted Ubuntu

Before enabling the workflow, a repository administrator must:

1. Configure `flop-inference-approved` with required reviewers, no admin bypass, and only the `main` deployment branch. Set `FLOP_REVIEWED_COMMIT` in that environment to the full reviewed development commit after CI. Verify the repository already has the authorized `TECHNOCORE_PRIVATE_KEY_PKCS8_B64` Actions secret. Do not copy its value out of GitHub. The existing secret is referenced only by the execution step. The runner derives and checks the existing DID and SS58 address.
2. Create the dedicated `flop-inference-state` branch before dispatch. Ensure no workflow on its starting revision is configured to run on its creation or on pushes to it. Keep the branch out of deployment triggers. Protect it against deletion and force pushes and allow the workflow token to write the journal. No token or external storage account is required. The one-shot journal path is fixed. A prior journal is a stop condition.
3. Publish only the manual workflow file to the default branch with separate approval. Run fresh read-only readiness against the reviewed revision. Confirm the miner, runtime, 0.005 Test FLOP escrow and maximum 0.010 Test FLOP estimated opening fee. The maximum channel duration is 1,200 blocks. Actual fees may differ from estimates.

The user selects **Actions → FLOP one-shot approved Testnet inference → Run workflow**, selects `main` for the launcher and enters the full reviewed development SHA, verified miner ID, runtime specVersion and `one-testnet-inference`. Confirm the revision and inputs before selecting **Review deployments → Approve and deploy**. A fresh candidate or runtime mismatch stops the run. The standard GitHub-hosted machine is allocated only for the approved run. The workflow permits one opening extrinsic and rejects GitHub reruns.

## State and reconciliation

An atomic create-only reservation on the state branch blocks competing and subsequent runs. Each append must match the previous blob SHA. The opening transaction is broadcast only after GitHub acknowledges the durable hash, nonce and mortal era record. The finalized opening and the verified receipt's root are recorded before the payment acknowledgement. Ambiguous or rejected writes stop execution.

The public journal contains only approved metadata such as public addresses, channel and transaction hashes, and state transitions. It has no secrets, prompts, output, signed transaction bytes or recovery material. The private working journal is ephemeral. Runner loss can prevent recovery of the original session key and inference output. Reconcile the recorded hash and channel against finalized chain history and retain the reservation. Any recovery extrinsic requires a separate review and budget. No faucet request or automatic recovery runs.
