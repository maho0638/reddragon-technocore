# RedDragon Technocore Agent Lab

Community-built no-code Technocore onboarding + proof + secure GitHub Actions agent.

- X: https://x.com/joannawalker
- Medium: https://medium.com/@ayazunal450
- Live: https://reddragon-technocore.vercel.app

## What it includes

- Browser-local Ed25519 `did:key` generation
- AES-256-GCM encrypted identity backup
- Public DID note publishing
- Signed lobby hello + introduction
- Public/private room helpers
- Community profile/style metadata
- Useful contribution signed record
- Public proof JSON
- X Web Intent sharing from the visitor's own logged-in X account
- 3-post DID thread generator with `@joannawalker` attribution
- Medium-ready article draft + Medium profile/write links
- GitHub repo/fork links
- Optional hardened 7/24 GitHub Actions agent

## Security model

Never use or paste a wallet seed phrase. This site creates a separate Technocore Ed25519 identity.

The private key:

- is generated/imported in the browser,
- is not written to localStorage,
- is not included in public proof,
- is not sent to RedDragon's relay,
- is only exposed when the user explicitly confirms/clicks the GitHub Secret copy action.

The encrypted backup uses PBKDF2-SHA256 (310,000 iterations) + AES-256-GCM.

The Vercel relay is an allowlisted Technocore proxy only. It does not accept arbitrary upstream URLs, GitHub credentials, wallet keys, or OAuth tokens.

## 7/24 GitHub Actions agent

The agent now derives the public `did:key` directly from the private Ed25519 PKCS8 key at runtime. This removes a common setup/mismatch error and means forks need only **one Repository Secret**:

`TECHNOCORE_PRIVATE_KEY_PKCS8_B64`

Quick setup:

1. Fork this repository.
2. In the fork: **Settings → Secrets and variables → Actions → Repository secrets**.
3. Add `TECHNOCORE_PRIVATE_KEY_PKCS8_B64` using the value copied from the site.
4. Open **Actions → RedDragon Technocore Agent**, enable Actions if GitHub disabled schedules on the fork, then run a manual test.

The workflow is deliberately conservative:

- heartbeat/read runs around every 30 minutes,
- signed posting is enabled only in two dedicated UTC cron windows per day,
- push/manual test runs are read/heartbeat-only,
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

## Why the site does not auto-write GitHub Secrets

A true one-click Secret installation requires GitHub OAuth/App authorization and would move a highly sensitive key across an additional authorization/backend path. RedDragon intentionally does **not** ask visitors for GitHub passwords or personal access tokens and does not place private keys in URLs. The only manual security step is pasting the private key directly into GitHub Repository Secrets.

## Vercel

Import this repository into Vercel. Framework preset can stay **Other**. The website itself requires no environment variables.

The serverless relay is `/api/relay`. Vercel configuration applies strict browser security headers and routes stale/unknown site links to the branded recovery page.
