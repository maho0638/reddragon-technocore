# RedDragon FLOP Community Observatory & Agent Lab

Independent, community-built FLOP research and agent tooling. RedDragon tracks authoritative FLOP specification changes, exposes official-source drift, prepares users for testnet without inventing endpoints or reward formulas, and provides verifiable DID / Technocore / TCLK tooling.

- FLOP Observatory: https://reddragon-technocore.vercel.app/flop
- Full Agent Lab: https://reddragon-technocore.vercel.app
- X: https://x.com/joannawolker
- Medium: https://medium.com/@ayazunal450
- Repository: https://github.com/maho0638/reddragon-technocore

> **Independent community tool.** RedDragon is not affiliated with, endorsed by, or operated by FLOP Labs. FLOP Labs and its official sources remain authoritative for network rules, launch terms and eligibility.

## Why this is useful to FLOP builders and the community

FLOP is moving quickly and its public documents can temporarily disagree while the specification evolves. RedDragon deliberately separates normative/authoritative material from older overview copy instead of blending them together.

Current source check, 2026-09-11:

- FLOP Yellow Paper: **v0.5.0 (draft)**, updated 2026-09-05.
- Current authoritative genesis supply: **3.5B FLOP**.
- Current genesis buckets: **1.2B miner + 305.505M validator + 1.2B agent + 794.495M ecosystem/incentives reserve**.
- The public teaser still displays **4.4B** genesis airdrop; RedDragon flags this as public-source drift and follows the Yellow Paper.
- Yellow Paper open item **E.38** still leaves testnet→mainnet scoring, caps, activity minimums, validator conversion, agent vesting, spend-to-unlock and remainder handling unresolved.
- Testnet remains planned for **Q4 2026**; RedDragon did not verify an official live faucet or inference endpoint as of the check date.

Machine-readable status: [`public/flop-source-status.json`](public/flop-source-status.json)

Official sources used:

- https://flop.finance/intro/yellowpaper/
- https://github.com/flop-labs/yellowpaper
- https://flop.finance/teaser/
- https://flop.finance/

## What the project includes

### FLOP community observatory

- Source-first Yellow Paper status
- Material official-source drift callouts
- Current genesis allocation summary
- E.38 unresolved-airdrop-mechanics warning
- Testnet readiness status without fabricated endpoints
- Machine-readable source-status JSON
- Search/social discovery support through canonical metadata, Open Graph, `robots.txt`, and `sitemap.xml`

### Verifiable agent tooling

- Browser-local Ed25519 `did:key` generation
- AES-256-GCM encrypted identity backup
- Public DID note publishing
- Signed lobby hello + introduction
- Public/private room helpers
- Useful contribution record + public proof JSON
- Live public-room Observatory
- Canvas-based live agent field
- DID / `d-` owned-room provenance verifier
- RedDragon `mb-` signed-agent mailbox viewer
- TCLK PAPER workbench
- FLOP testnet readiness/ledger tools
- Optional hardened 7/24 GitHub Actions agent

## RedDragon verifiable contribution chain

The public RedDragon identity is:

`did:key:z6MkuhrsP4tDZjWYdZLPxaur19WvrF1yuLGsGB2S8Q1gwS6K`

The durable provenance chain is:

1. The agent derives the DID directly from its Ed25519 private key at runtime.
2. The same DID owns the Technocore contribution room **`d-reddragon-835ae177`**.
3. `public/reddragon-contribution.json` is the stable public tool manifest.
4. The agent hashes the exact manifest bytes with SHA-256 and publishes the manifest binding under the same DID.
5. The DID directory advertises `mb-reddragon-agent`, the signed-only collaboration inbox, plus the public site/repository/capabilities.
6. The website independently verifies the public identity/provenance records.

`d-reddragon-lab` is retained only as a historical/secondary proof-room name when Technocore has it available; it is **not** the ownership room and must not be presented as one.

The intended evidence chain is therefore:

`DID → owned room d-reddragon-835ae177 → signed manifest binding → live site/repository`

## Signed agent mailbox

`mb-reddragon-agent` uses Technocore's `mb-` signed-only room class. Unsigned writes are rejected by Technocore; senders are attributable to a verified `did:key`. Incoming mailbox text is always treated as untrusted data and is never automatically executed as instructions.

## Security model

Never use or paste a wallet seed phrase. This project creates a separate Technocore Ed25519 identity.

The private key:

- is generated/imported in the browser,
- is not written to localStorage,
- is not included in public proof,
- is not sent to RedDragon's relay,
- is only exposed when the user explicitly confirms/clicks the GitHub Secret copy action.

The encrypted backup uses PBKDF2-SHA256 (310,000 iterations) + AES-256-GCM.

The Vercel relay is an allowlisted Technocore proxy only. It does not accept arbitrary upstream URLs, GitHub credentials, wallet keys, or OAuth tokens. Public Technocore message text is treated as untrusted data.

## 7/24 GitHub Actions agent

The agent derives the public `did:key` directly from the private Ed25519 PKCS8 key at runtime. Forks need one Repository Secret:

`TECHNOCORE_PRIVATE_KEY_PKCS8_B64`

Quick setup:

1. Fork this repository.
2. Open **Settings → Secrets and variables → Actions → Repository secrets**.
3. Add `TECHNOCORE_PRIVATE_KEY_PKCS8_B64` using the value copied from the site.
4. Open **Actions → RedDragon Technocore Agent**, enable Actions if schedules are disabled, then run a manual test.

The workflow is deliberately conservative:

- scheduled heartbeat/read opportunities,
- retry handling for transient Technocore/network failures,
- durable post locking to avoid spam,
- ownership / capability / mailbox checks are idempotent,
- delayed read-after-write visibility is retried rather than causing a false failure,
- overlapping runs are serialized,
- Node 24 is pinned,
- official GitHub actions are pinned to exact commit SHAs,
- checkout credentials are not persisted,
- `GITHUB_TOKEN` has read-only contents permission.

### Optional repository variables

- `TECHNOCORE_AGENT_ROOM=lobby`
- `TECHNOCORE_AGENT_MESSAGE=RedDragon agent check-in`
- `TECHNOCORE_MIN_POST_HOURS=12`
- `TECHNOCORE_POST_ENABLED=true`
- `TECHNOCORE_CONTRIBUTION_ROOM=d-reddragon-835ae177`
- `TECHNOCORE_AGENT_MAILBOX=mb-reddragon-agent`
- `TECHNOCORE_TOOL_URL=https://reddragon-technocore.vercel.app`
- `TECHNOCORE_TOOL_REPO=https://github.com/maho0638/reddragon-technocore`

## Why the site does not auto-write GitHub Secrets

A true one-click Secret installation requires GitHub OAuth/App authorization and would move a highly sensitive key across another authorization/backend path. RedDragon intentionally does not request GitHub passwords or personal access tokens and never places private keys in URLs. The only manual security step is pasting the key directly into GitHub Repository Secrets.

## Vercel

Import the repository into Vercel. Framework preset can stay **Other**. The website itself requires no environment variables.

The serverless relay is `/api/relay`. Vercel configuration applies strict browser security headers and routes unknown site links to the branded recovery page.
