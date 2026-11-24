# RedDragon FLOP — Final Completion Progress

Updated: 2026-11-25 (Europe/Istanbul)

## Verified source checkpoint

- Main / production source baseline: `aba62f91fc6ae0fbdb6cb141fd1d8f8345238710`.
- GitHub main was rechecked on 2026-11-25 and still points to this SHA.
- Production deployment recorded from the previous checkpoint: `dpl_66o9tmKCAkCCMG3By3bdCbeytyVV`, READY. No new deployment was created.
- Isolated sandbox Chromium run `45505440409`, candidate `5b8bc9fb363ccbe99ebd0effae78b266eefb823b`: 12/12. This predates the current candidate changes and is not evidence for them.

## Current local candidate checkpoint

- Candidate worktree: `/tmp/reddragon-csp-candidate`, branch `fix/flop-csp-production-acceptance`, based on the verified main SHA above.
- 20 modified source/test/configuration files are preserved locally. No main, sandbox, or production code was changed remotely in this checkpoint.
- CSP fix moves usage-guide styles from runtime `<style>` injection to `public/styles.css`; CSP remains strict (`style-src 'self'`) and does not add `unsafe-inline`.
- Relay profile writes now require a DID-bound Ed25519 signature over the normalized profile payload; topic writes remain public to preserve Technocore protocol behavior. DID fingerprint alone is not treated as proof of key ownership.
- Rate limiting remains per function-instance `Map` and therefore is not a shared distributed quota. Severity remains medium; no paid or external provider was configured.
- Testnet status code now checks the live RPC runtime identity as well as chain/genesis. No wallet signature, faucet claim, inference request, voucher action, or chain write occurred.

## Candidate verification recorded on 2026-11-25

| Check | Result | Scope / limitation |
|---|---|---|
| `npm test` | PASS — 91/91, 0 failed, 0 skipped | Local candidate source tests. Prior command output was observed in the preceding work session; a separate log artifact was not preserved. |
| `npm run test:local-preview` | PASS — 7/7 | Local HTTP preview, strict CSP, assets and routes. |
| `npm run test:local-http` | PASS | Read-only live RPC identity and local relay safeguards; no upstream writes. |
| Targeted FLOP status tests | PASS — 24/24 | `node --test scripts/flop-status.test.mjs scripts/verify-flop-observatory.test.mjs`. |
| Targeted relay/i18n/preview tests | PASS — 37/37 | Mocked relay tests; no live Technocore writes. |
| Syntax / JSON / diff checks | PASS | `node --check` modified JS files, JSON parse, `git diff --check`. |
| Chromium on this candidate | NOT RUN | Local Chromium socket was previously denied (`Operation not permitted`); that failing method was not repeated. Existing Actions run predates these changes. |

## Fresh official FLOP Testnet checks (2026-11-25)

- Specific official Testnet page reports `live, unscored`; vouchers/orders/swaps disabled; Testnet faucet and scoring activation remain unannounced. RPC is `wss://testnet.flop.network/`; expected genesis is `0x918abd58fb16306b30ef3886514cfaebffecb4de43e82b6f8ec4795c43cfd800`.
- Direct read-only JSON-RPC returned chain `FLOP Testnet`, runtime `flop-testnet`, spec version `1014035`, and the expected genesis hash.
- `@flop-labs/sdk` latest was checked as `0.10.0`; its runtime compatibility code admits `1014035`. This confirms runtime-version admission only, not inference or settlement.
- `https://faucet.flop.network/` identifies itself as the Devnet faucet and reports `network=devnet`; it was not used. Testnet faucet remains unverified/unavailable.
- Official specific Testnet page and a separate generic official links page conflict on launch wording; use the Testnet page and live RPC for the current network state, and keep that discrepancy noted.
- No testnet inference, settlement, voucher balance, or user wallet requirement was exercised. Do not claim a reward or working inference.

## Relay architecture evidence and remaining risk

- Current limiter is an in-process `Map`, 60 reads / 10 writes per minute, keyed by IP/category. An isolated two-module test demonstrates separate in-memory allowances; this is a model, not an observation of Vercel's live instances.
- Vercel WAF can provide edge IP/JA4 rate limits, but usage may incur charges beyond included quota and does not provide the desired DID-keyed shared quota. Upstash Free has quotas and a payment-card/pay-as-you-go upgrade path; no account, DB, or credential was created due to zero budget.
- Relay profile writes are protected only through this RedDragon relay; public Technocore KV is not globally private. Public `topic` remains world-writable as protocol metadata. No distributed limit is claimed as solved.

## Phase status and next actions

| Phase | Status | Next action |
|---|---|---|
| 0 — Verify checkpoint and preserve changes | PASS | Keep this local checkpoint and remote baseline refs. |
| 1 — Production read-only browser acceptance | NOT ACCEPTED | Requires post-fix deployment before production console/network/CSP verification; do not deploy before candidate browser acceptance. |
| 2 — DID backup/restore and relay regressions | PASS — candidate sandbox Chromium | Run `45509985101`: local preview 7/7, focused security/regression 76/76, Chromium 12/12; exact sandbox candidate commit `3f3694ce3eae790f4a61db10ccc136033e5de3c0`; source SHA-256 manifest passed with 63 entries. | Keep the QA run as the candidate evidence; do not treat it as production acceptance. |
| 3 — Distributed relay rate limit | UNRESOLVED, medium risk | Zero-budget shared store not available; decide whether to retain documented risk or obtain an approved shared provider later. Do not claim fixed. |
| 4 — FLOP Testnet readiness | Partially verified; faucet/inference unverified | Recheck official pages before any future live participation; no user action currently required. |
| 5 — Final release | NOT STARTED | Candidate CI/E2E passed, but production is not deployed; relay distributed rate limit remains an explicitly unresolved medium risk. | Decide whether the zero-budget deployment can accept that documented limitation; if yes, merge only after main CI and then perform production read-only browser acceptance. |

## Safety

- One commit was pushed only to sandbox QA: `3f3694ce3eae790f4a61db10ccc136033e5de3c0`; only the isolated FLOP workflow ran, with `contents: read` and `ubuntu-24.04`. No main push, merge, Vercel deployment, real Technocore write, wallet signature, secret transfer, or chain transaction occurred.
- Close1/trader files were not changed.


## Latest isolated candidate run — 2026-11-25 (Europe/Istanbul)

- Sandbox branch head tested: `3f3694ce3eae790f4a61db10ccc136033e5de3c0`; run: [45509985101](https://github.com/maho0638/reddragon-flop-e2e-sandbox/actions/runs/45509985101), event `push`, job `local-browser-e2e`, label `ubuntu-24.04`, conclusion SUCCESS.
- Manifest: all 63 SHA-256 entries passed. Baselines recorded separately: production source `aba62f...`, prior isolated E2E baseline `5b8bc9...`, dynamic test candidate is the checked-out commit.
- Local preview security gate: 7/7 passed, including `/api/relay` GET=405, static write-method denial, strict `style-src 'self'`, and external-write hard deny.
- Focused security/regressions: 76/76 passed, 0 failed, 0 skipped. Included encrypted DID backup restore and tamper cases, real Ed25519 verification, unsigned/forged profile rejection before upstream, signed profile compatibility, public topic compatibility, rate-limit instance simulation, Testnet runtime identity and translation assertions.
- Chromium: 12/12 passed, 0 failed, 0 skipped. Logs explicitly show step-11 TR/EN layout at all four viewport widths, `/flop` TR/EN, four viewport home layout, DID create/encrypted backup/restore with mock relay, X share clipboard without popup/external write, and other UI/ledger checks.
- Test data was synthetic; relay and FLOP status were mocked in browser. No Technocore write occurred. This is candidate evidence only; production remains on `aba62f...` and production browser acceptance is still pending.
- No Vercel project matched the sandbox repo name in the read-only project lookup; no deployment was requested or created.
