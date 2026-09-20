# Stonk Gem Radar

Event-driven StonkFun / Raydium LaunchLab scanner built to find **new asymmetric movements**, not merely newly created tokens.

## Detection model

The same mint can move through three scan modes:

- **FLASH (0–6h):** early buyer, holder, volume, liquidity and pair-fit velocity.
- **BUILD (6h–3d):** survival after the first pump, retention, holder breadth and sustained flow.
- **REAWAKENING (3–21d):** renewed volume, holders/buyers, buy-side flow and price reclaim. This is the JUPCAT fix: token age no longer disqualifies a new movement.

Helius starts a monitor for each verified StonkFun launch. A durable pair monitor also polls the official pair registry and recent launches about every 60 seconds (plus processing/indexing time). The daily `/api/discover` cron backfills volume-leading tokens and acts as a watchdog. A deterministic workflow hook permits only one active 21-day monitor per mint.

Each durable monitor uses absolute-age checkpoints around T+20s, 3m, 7m, 12m, 20m, 1h, 3h, 6h, 12h, 1d, 2d, 3d, 4d, 5d, 7d, 10d, 14d, 18d and 21d. Weak launches stop early; qualified candidates continue. Every check is persisted in the Vercel Workflow event log.

## Event/pair and reward intelligence

The radar uses StonkFun's official public API for token, pair, graduation, peak-MC and holder-reward data. It scores these explicitly:

- direct meme/name fit with the quote asset;
- project/asset mascot fit;
- native quote-token rewards;
- one of the first three launches against a new/rare pair;
- an optional `RECENT_PAIR_MINTS` event-feed override for freshly announced official pairs.

This makes patterns such as `JUP mascot + JUP pair + JUP rewards` a first-class signal rather than an after-the-fact narrative observation.

### Pair events and early name candidates

The first successful registry read establishes a baseline: existing pairs are not announced as new. Later additions produce a Telegram pair-event alert. State and cursors are persisted in Workflow step results and the `state` stream; six-hour runs hand the baseline to a successor on the latest deployment. Authenticated Helius traffic, daily discovery and `/api/admin/monitor` can start a missing monitor. A failed run restarted without a successor establishes a fresh baseline; it cannot reconstruct pair additions during that outage. `detectedAt` is the observation time, not a claimed exchange launch timestamp.

Quote aliases and explicit associations cover Google/Alphabet → Google It/Feeling Lucky, PEPE → FEELSGOOD, and other asset motifs. Phrase boundaries prevent incidental substring matches. This is explainable rule-based matching, not a universal AI semantic model; novel jokes and image-only posts can be missed. A readable name alone is insufficient.

Within 30 minutes of launch, a matching name on a newly observed pair or among its first three launches can produce a separate **TIDLIG NAVNEKANDIDAT** alert below $100k MC. It must pass the same mandatory checks as all other positive token alerts. Unknown market cap or incomplete security evidence suppresses it. Ordinary market/risk checkpoints continue.

Optional X ingestion uses the official API with `X_BEARER_TOKEN` and the verified numeric `X_STONK_USER_ID`. It polls original posts every five minutes, establishes an initial cursor without sending historical posts, validates authors, and matches announcement wording to registered pairs. Unmatched posts are retained for 48 hours in case the pair registry updates later. Missing access, rate limits and errors are reported explicitly; configured credentials alone do not mean the feed is active. API access/usage is governed by the X account; this app does not purchase it.

`/api/health` reports the deployed revision, monitor heartbeat, source success times and errors. Protected `GET /api/admin/monitor` includes recent events and cursors. Start with `POST /api/admin/monitor` or the setup page. Registry and launch-feed failures retain previous state; Telegram pair notifications retry on subsequent polls. The scan limit is 500 launch rows with 25 enqueues per poll; a scan overflow is reported rather than silently advancing the cursor.

### Data correctness

DEX Screener valuations describe its base token. For reversed pairs (for example PEPE/FEELSGOOD), the radar reverses buy/sell flow and takes valuation only from a pool whose base is the target mint. Otherwise it retains Stonk's target-token valuation. It never uses PEPE's cap as FEELSGOOD's cap.

Incomplete holder samples and unknown pool exclusions produce `NO SIGNAL` while observation continues. In the first seven minutes a sample with fewer than 60 holders also waits for distribution to develop. After that, complete concentration data still hits the existing hard thresholds. Verified insider/bundle risks remain fatal at every age. A failed holder refresh cannot fabricate a holder-base collapse.

Existing launch workflows remain pinned to their original deployment. After deploying a policy change, authenticated `POST /api/admin/monitor` or the setup action queues a durable rollout. Each upgrade saves the latest completed analysis, peak/low values and notification history before cancelling the old run and starting its replacement. Active analysis/delivery steps are allowed to finish first. Health and protected monitor status report the remaining legacy runs. Setup also recovers a stale pair monitor while preserving its registry and launch cursor. Tests are synthetic regressions, not a historical replay proving an alert at a particular age or price.

## Hard wallet gate

RugCheck graph data is checked on every snapshot and detected AMM vaults are removed from holder concentration calculations. `SOLANA_TRACKER_API_KEY` enables the real Solana Tracker Data API: `GET /tokens/{mint}` and `GET /tokens/{mint}/bundlers`, authenticated with `x-api-key`. The dedicated bundle endpoint supplies aggregate percentages despite its capped wallet list. Missing data, mismatched token identity, stale indexed pools, 404, 429, timeout and malformed responses never imply a zero risk measurement.

Solana Tracker adds bundle, sniper and insider measurements. It does **not** establish complete common-funder or fresh-wallet coverage. GMGN or the specialist gateway can supply those additional checks when their token-specific evidence is complete. Provider configuration alone is not evidence that a particular token is covered. No accounts, credits or paid upgrades are purchased by the application.

`GMGN_API_KEY` enables GMGN's read-only OpenAPI (`/v1/token/info`, `/v1/token/security`, `/v1/market/token_top_holders`, authenticated with `X-APIKEY`). No trading permission or private signing key is used. Bundle/sniper/insider holdings are calculated from current wallet balances and classification tags. GMGN's bundle **trading-volume** ratios and fresh-wallet **count** ratio are never treated as supply percentages.

The holder route is capped at 100 rows. The live API rejects ascending order despite the documentation advertising it, and offers no documented pagination. Positive measurements require coverage of the reported holder count, valid balances/tags, and no inconsistent total. Known pool accounts are excluded and cannot inflate verified wallet coverage. More than 100 holders, missing wallet tags, unknown creation times or absent original funding transfers leave the respective checks incomplete. An observed risky concentration can still reject a token from a partial list; a low concentration in a partial list cannot establish that it is safe. Conflicting providers use the highest measured risk, and an active authority overrides a revoked-authority claim.

Common-funder concentration means the largest group of at least two current holders sharing a recorded first native-transfer source. This is a heuristic: an exchange or other shared service can produce a common source without common ownership. Fresh-wallet concentration counts supply in wallets created within 24 hours before the token's launch or afterward. These are provider-indexed wallet heuristics, not a complete forensic trace of all funding hops. The demo reports GMGN coverage and missing fields explicitly. A 429 stops requests for the reported cooldown (five minutes by default); HTTP errors, timeouts and malformed reports never imply zero risk.

Wallet verification has only three outcomes:

- `CLEAN`: graph, bundle, sniper, common-funder, fresh-wallet and authority checks returned valid measurements and remained below hard thresholds.
- `RISKY`: a linked insider/bundle/sniper/funder threshold or another hard wallet risk was hit.
- `UNKNOWN`: evidence is incomplete.

**`UNKNOWN` blocks every positive token alert, including FLASH, EARLY WATCH, BUILD, REAWAKENING, RECLAIM, GEM and early name candidates.** Missing evidence yields `NO SIGNAL` and continued observation. A high activity/potential score cannot bypass this gate.

All positive alerts additionally require narrative >= 3/5, a documented name/pair association, complete holder sampling and known pool exclusions, a measured creator balance, market cap, liquidity >= $10,000, observed volume/buy/sell flow and an on-chain buyer sample. Required observations expire after five minutes; freshness is checked again immediately before sending, including on delivery retries. Buyer counts describe the most recent 100 pool transactions within five minutes, not a complete census. Fetch timestamps are observation times, not guarantees about the upstream indexer's latency. Risk warnings for previously alerted tokens bypass the positive-alert gate. A score out of 100 describes activity/potential, not a probability or security rating.

The optional `WALLET_RISK_API_URL` receives:

```json
{ "chain": "solana", "mint": "...", "launchedAt": 0 }
```

It must return the matching `mint`, a fresh `checkedAt` Unix timestamp in milliseconds, explicit coverage booleans (`bundle.analyzed`, `snipers.analyzed`, `funding.analyzed`) and actual `supplyPct` values between 0 and 100. Top-level aliases such as `bundleChecked` and `bundledSupplyPct` are also accepted. `freshWalletSupplyPct` is required. An `analyzed: true` flag without its measurement is incomplete. Missing authority fields are never interpreted as revoked.

## Meaningful notifications

Telegram receives state transitions, not repeated snapshots. Examples:

Messages show the decision first, followed by market cap, liquidity, one relevant volume window, holder count, narrative/pair score, check status and the two leading blockers or risks. The activity score out of 100 and provider diagnostics stay in the analysis record. Token alerts include Stonk/GMGN links and a copy-address button; untrusted names are escaped before HTML formatting. A test or incomplete candidate cannot look like an approved alert. Prior-signal invalidations retain their explicit warning and reason.

- `FLASH → EARLY WATCH → GEM`
- `BUILD WATCH → RECLAIM`
- `SKIP → REAWAKENING` when the scheduled discovery pass starts a later monitor
- `GEM → INVALIDATED`

## StonkFun addresses

- Raydium LaunchLab: `LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj`
- StonkFun reward config: `6BwHHDg3u1854jC8PDLXvR4spTcLNaoBxLJNGC4nTESt`
- StonkFun standard config: `4E876qZTE9FJMrBzgVtBrSrzz2TLivB5Y5QXPjB4gZL7`

For `initialize_with_token_2022`, the parser uses creator=1, platform config=3, pool=5, new mint=6, quote mint=7 and vaults=8/9.

## Environment variables

Copy `.env.example` and set secrets in Vercel, never in GitHub.

Required for live launch analysis and alerts:

```text
HELIUS_API_KEY=
HELIUS_WEBHOOK_AUTH_SECRET=
TELEGRAM_BOT_TOKEN=
CRON_SECRET=
RADAR_ADMIN_SECRET=
```

Optional:

```text
TELEGRAM_USERNAME=PelleSuper
TELEGRAM_CHAT_ID=
WALLET_RISK_API_URL=
WALLET_RISK_API_KEY=
SOLANA_TRACKER_API_KEY=
GMGN_API_KEY=
RECENT_PAIR_MINTS=
DISCOVERY_MAX_STARTS=25
STONKFUN_API_BASE=https://www.stonkfun.xyz/api/public/v1
X_BEARER_TOKEN=
X_STONK_USER_ID=
```

If `TELEGRAM_CHAT_ID` is temporarily absent, the bot can resolve it from recent Telegram `/start` updates matching `TELEGRAM_USERNAME`. Set the numeric ID afterward.

## Automatic production setup

After deploying, open `/admin`, enter `RADAR_ADMIN_SECRET`, and run setup. The protected setup endpoint:

- creates or updates the raw Helius mainnet webhook for the LaunchLab program;
- points it at the deployment's `/api/helius` endpoint with the configured authorization secret;
- resolves the Telegram chat from the most recent `/start` sent by `TELEGRAM_USERNAME`; and
- sends a production test message; and
- starts the durable pair/launch monitor if it is missing.

It is idempotent and only updates the webhook when its configuration has changed.

## Verification

```bash
npm install
npm run typecheck
npm test
npm run build
```

Regression tests cover the original LinkedInu pattern, the JUPCAT second-wave miss, the `UNKNOWN ≠ CLEAN` rule, linked-wallet rejection and state-transition notifications.

## Security

Rotate any Telegram or API token that has ever been pasted into chat. Store replacements only in encrypted Vercel environment variables.

<!-- Vercel production deployment configured and verified 2026-09-19 -->
