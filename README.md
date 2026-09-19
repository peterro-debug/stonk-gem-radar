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

Within 30 minutes of launch, a matching name on a newly observed pair or among its first three launches can produce a separate **TIDLIG NAVNEKANDIDAT** alert below $100k MC, or with MC explicitly unknown. Confirmed wallet risks suppress it. The alert is a hypothesis, not a GEM approval, an assertion of uniqueness, or an automatic trade. Ordinary market/risk checkpoints continue.

Optional X ingestion uses the official API with `X_BEARER_TOKEN` and the verified numeric `X_STONK_USER_ID`. It polls original posts every five minutes, establishes an initial cursor without sending historical posts, validates authors, and matches announcement wording to registered pairs. Unmatched posts are retained for 48 hours in case the pair registry updates later. Missing access, rate limits and errors are reported explicitly; configured credentials alone do not mean the feed is active. API access/usage is governed by the X account; this app does not purchase it.

`/api/health` reports the deployed revision, monitor heartbeat, source success times and errors. Protected `GET /api/admin/monitor` includes recent events and cursors. Start with `POST /api/admin/monitor` or the setup page. Registry and launch-feed failures retain previous state; Telegram pair notifications retry on subsequent polls. The scan limit is 500 launch rows with 25 enqueues per poll; a scan overflow is reported rather than silently advancing the cursor.

### Data correctness

DEX Screener valuations describe its base token. For reversed pairs (for example PEPE/FEELSGOOD), the radar reverses buy/sell flow and takes valuation only from a pool whose base is the target mint. Otherwise it retains Stonk's target-token valuation. It never uses PEPE's cap as FEELSGOOD's cap.

Incomplete holder samples and unknown pool exclusions produce `NO SIGNAL` while observation continues. In the first seven minutes a sample with fewer than 60 holders also waits for distribution to develop. After that, complete concentration data still hits the existing hard thresholds. Verified insider/bundle risks remain fatal at every age. A failed holder refresh cannot fabricate a holder-base collapse.

Existing launch workflows remain pinned to their original deployment until they finish; the new code governs newly started workflows. Tests are synthetic regressions, not a historical replay proving that FEELSGOOD would have been alerted at a particular age or price.

## Hard wallet gate

RugCheck graph data is checked on every snapshot and detected AMM vaults are removed from holder concentration calculations. The optional specialist adapter adds bundle, sniper and common-funder evidence.

Wallet verification has only three outcomes:

- `CLEAN`: graph, bundle, sniper and common-funder checks all completed and remained below hard thresholds.
- `RISKY`: a linked insider/bundle/sniper/funder threshold or another hard wallet risk was hit.
- `UNKNOWN`: evidence is incomplete.

**`UNKNOWN` is never treated as `CLEAN`, and cannot trigger `GEM`.** It can still produce an explicitly gated FLASH, EARLY WATCH, BUILD or REAWAKENING alert so a promising token is not silently lost.

The optional `WALLET_RISK_API_URL` receives:

```json
{ "chain": "solana", "mint": "...", "launchedAt": 0 }
```

It should return explicit coverage booleans (`bundle.analyzed`, `snipers.analyzed`, `funding.analyzed`) plus `supplyPct` values. Top-level aliases such as `bundleChecked` and `bundledSupplyPct` are also accepted.

## Meaningful notifications

Telegram receives state transitions, not repeated snapshots. Examples:

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
