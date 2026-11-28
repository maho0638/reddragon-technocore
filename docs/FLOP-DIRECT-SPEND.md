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

1. Keep the incumbent repository secret and legacy workflows in place. The spending step requires `FLOP_INFERENCE_SIGNER_PKCS8_B64` scoped only to `flop-inference-approved`, with no repository or organization secret of that name. Only the owner can provision it from a trusted original. Never recover it from the existing GitHub secret or runner. The runner checks the existing DID and SS58 address.
2. Publish the dedicated state branch `flop-inference-state` containing only `vercel.json` with Git deployment disabled. Activate a ruleset targeting exactly that branch, restricting deletions and blocking force pushes while permitting normal writes by the workflow token. Never reset or remove the real reservation.
3. Publish the reviewed workflow to the default branch with separate approval and pin its reviewed development commit in `FLOP_REVIEWED_COMMIT`. Run and approve `probe-journal` first. It uses only the job token to verify create, duplicate rejection and SHA-based update in an isolated `probes/` path. Then run fresh read-only readiness before requesting a spend. Confirm 0.005 Test FLOP escrow, at most 0.010 Test FLOP estimated opening fee and at most 1,200 channel blocks.

The user selects **Actions → FLOP one-shot approved Testnet inference → Run workflow**, selects `main` for the launcher and enters the full reviewed development SHA, verified miner ID, runtime specVersion and `one-testnet-inference`. Confirm the revision and inputs before selecting **Review deployments → Approve and deploy**. A fresh candidate or runtime mismatch stops the run. The standard GitHub-hosted machine is allocated only for the approved run. The workflow permits one opening extrinsic and rejects GitHub reruns.

## State and reconciliation

An atomic create-only reservation on the state branch blocks competing and subsequent runs. Each append must match the previous blob SHA. The opening transaction is broadcast only after GitHub acknowledges the durable hash, nonce and mortal era record. The finalized opening and the verified receipt's root are recorded before the payment acknowledgement. Ambiguous or rejected writes stop execution.

The public journal contains only approved metadata such as public addresses, channel and transaction hashes, and state transitions. It has no secrets, prompts, output, signed transaction bytes or recovery material. The private working journal is ephemeral. Runner loss can prevent recovery of the original session key and inference output. Reconcile the recorded hash and channel against finalized chain history and retain the reservation. Any recovery extrinsic requires a separate review and budget. No faucet request or automatic recovery runs.
