# RedDragon Testnet direct inference

Run the unsigned regression suite with:

```sh
node --test scripts/flop-agent-preflight.test.mjs scripts/flop-spend.test.mjs
```

The registry readiness workflow installs the SHA-512-verified FLOP SDK 0.13.1 and probes the twelve published candidates. It checks fresh challenge signatures, finalized calibration and registry identity, estimates the exact force-open shape, and independently reopens the historical settlement block and extrinsic for each indexed payment. A valid challenge alone only proves possession of the claimed enclave key. Selection requires an enclave key and matching model identity anchored to a successful, positive cooperative settlement. It ranks eligible candidates by escrow plus estimated opening fee, then by miner ID for reproducibility. The payment index contains observed checkpoints and is not an exhaustive index of chain activity. A missing entry leaves a miner ineligible until positive settlement is independently verified and added.

## Manually approved execution

Review the exact local revision and run the fresh unsigned readiness check. Approve the selected miner ID, the reported runtime spec version, and one public inference with 0.005 Test FLOP escrow, at most 0.010 Test FLOP in estimated opening fees, and at most 1,200 channel blocks. Estimates can differ from charged fees. The runner rechecks the candidate and budget and stops on a change. It allows one buyer extrinsic. Recovery extrinsics need separate review and authorization.

After separately authorized publication, the workflow is manually dispatched with those exact miner and runtime inputs and the approval value `one-testnet-inference`. GitHub requires the workflow file to be present on the default branch for manual dispatch. Use the `flop-inference-approved` environment and restrict its branches to the reviewed execution branch. Configure required reviewers where the private repository's plan supports them. On plans without that protection, keep this job disabled or unconfigured and have the owner run the same reviewed entry point once in the authorized external environment after manually confirming the inputs. Never assign the runner label to machines available to untrusted workflows.

Provision the external environment before execution:

- An isolated runner with `flop-inference-authorized` and an immutable reviewed installation of SDK 0.13.1 and its resolved dependencies. `FLOP_TRUSTED_MODULES` points to that node_modules directory. Verify the tarball against the hash in the readiness workflow and retain its dependency lockfile.
- `FLOP_EXISTING_SIGNER_FILE` points to the existing Ed25519 PKCS#8 DER file owned by the runner account with owner-only permissions. Keep the key on the authorized machine. The runner checks both the existing DID and SS58 address locally. The payer signer uses Ed25519 and the SDK uses a separate, ephemeral sr25519 session key for the transcript. No additional funded account is required.
- `FLOP_STATE_DIRECTORY` points to a pre-existing, owner-only durable directory shared by all invocations for this payer. An ordinary GitHub-hosted job filesystem cannot provide that persistence.

The journal records the miner and network, channel intent, signed transaction hash and account nonce with its mortal era before broadcast, finalized opening block, verified receipt before payment acknowledgement, and final settlement. Treat it as sensitive because it contains the SDK's session recovery material and inference output. Keep it out of Git, logs, artifacts and caches. An existing journal, including an empty file left by interruption, blocks every retry from this directory. On uncertainty, match the recorded hash in finalized blocks spanning the recorded era, then inspect dispatch events and the recorded channel. If finality has not passed the era or RPC history is incomplete, leave the outcome unresolved. Never delete or bypass the journal to retry. An open or expired channel is not proof of payment.

Successful production use of the existing signer has not been established by unsigned checks. Testnet funds have no monetary value. No faucet request is part of this workflow.
