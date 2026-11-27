# RedDragon FLOP isolated browser test snapshot

This branch carries the static site, local API handlers, source tests, and an isolated cross-browser workflow at the repository root. Tests use a loopback preview and mock external services; the preview denies relay writes. No secrets, wallet credentials, production deployment configuration, or personal automation workflows are included.

## Wallet scope

The FLOP page can connect an injected Polkadot wallet and read its free balance plus recent finalized `balances.Transfer` events from the Testnet RPC after checking the official genesis and supported runtime. The history is bounded to recent blocks because the public archive feed is not available. This client has no transaction-signing or chain-write path.

Faucet preparation signs the official claim message in the wallet extension and creates a command for the user to inspect and run manually. The site never submits, retries, or reports a claim as successful.

## Local checks

Run `npm ci`, then `npm run build:wallet-chain` before `npm run test:local-preview` or `npm run test:browser`. Unit and security tests run with `npm test` and `npm run test:security-regressions`. The isolated workflow runs the browser suite on Chromium, Firefox, and WebKit. Browser tests use mocked service responses and an injected test wallet; they never use a real user wallet or send a claim.

## Admin development status

The local Node 24 preview uses a persistent SQLite database at `.data/admin.sqlite` (override with `ADMIN_DB_PATH`). It supports one-use application challenges, Ed25519 DID and Polkadot wallet proof verification, scrypt password hashes, HMAC-bound sessions, CSRF checks, approval/rejection, separate faucet/inference permissions, daily limits, revocation, emergency stop, and audit rows. `ADMIN_PASSWORD_HASH` and `ADMIN_SESSION_SECRET` must be supplied outside source control; without them, login fails closed. When `DATABASE_URL` is configured, the service uses the Neon PostgreSQL adapter, transactional state changes, row locks, SQL-atomic per-user quota consumption, and SQL-atomic shared request limits. Each request creates and closes its Neon WebSocket pool. It fails closed if the database cannot initialize or answer a request.

For this QA run, the dedicated GitHub Actions step passes only `NEON_INTEGRATION_DATABASE_URL` to the required integration test and sets `REQUIRE_NEON_INTEGRATION=1`; a missing URL fails the step instead of counting as a skip. That repository secret is configured by the owner for the Neon `site-qa` branch. The test uses two independently initialized pools, exercises application proof/review states, separate permission revocation, emergency stop, concurrent per-user quota and shared rate-limit operations, session revocation, audit durability, pool restart, and a simulated connection outage. It deletes its uniquely namespaced test rows in a `finally` cleanup. It does not use production `DATABASE_URL` or any other Neon connection string.

When the production backend is configured, admin state and shared rate limits use the same PostgreSQL database; no Redis account is needed. Without it, local tests use SQLite atomic transactions. Faucet submission and inference execution remain disabled: no browser claim CORS contract or supported official inference service has been verified, and permission grants cannot trigger either operation.

To enable the production adapter, set its pooled PostgreSQL connection string as `DATABASE_URL`, and set `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`, and `ADMIN_ACTOR` through the backend environment's private variable settings. Generate the password hash locally with `node scripts/create-admin-password-hash.mjs`; it prompts for the password with masked input and prints only the scrypt hash. Generate a separate random session secret, for example with `openssl rand -base64 32`. Store values in the backend's private variable manager; do not commit or send them in chat. The first database-backed admin API request creates the prefixed tables.

The Chromium job also captures bilingual desktop and mobile screenshots for home, FLOP, application, admin, and custom 404 pages, plus navigation videos. It uploads them as a 14-day GitHub Actions artifact. The artifact is QA evidence from the isolated preview with external writes blocked; it is not a production recording.

Neon Free and GitHub Actions quotas are account-dependent; no billing dashboard value is available to this workflow. This work does not activate paid services or deployment.
