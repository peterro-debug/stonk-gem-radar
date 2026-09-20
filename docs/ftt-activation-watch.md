# FTT activation watch

Quote: `EzfgjvkSwthhgHaceR3LnKXUoRkP6NUhfghdaHAj1tUv`.

Runs inside the existing single durable pair monitor, not a separate bot or ChatGPT automation. The monitor sleeps 60 seconds after each full tick; network, discovery, workflow queue and Telegram latency add to that interval. No exact-second delivery guarantee.

The one-time readiness notification requires exact quote-mint identity, both explicit registry booleans, the global LaunchLab switch, and HTTP 200 with valid quote-specific pricing/curve configuration. It does not claim that a transaction was signed or successfully executed. Source failures are UNKNOWN/unavailable, not activation. Failed Telegram delivery remains pending until a later confirmed-ready check; successful delivery is recorded in durable state.

The FTT first-launch watch uses the existing #1/#2/#3 rank and notification ledger. It is pinned ahead of the ten ordinary event slots and does not expire at two hours or 48 hours before those launches have been delivered. Its starting timestamp is a verified empty Stonk-feed observation (2026-09-20T20:29:44.609Z), not an invented quote creation time. Normal safety gates, candidate approval and other pair watches are unchanged.

Public health exposes `sources.fttActivationWatch` and `sources.fttLaunchWatch`. The existing five-minute watchdog moves the running pair monitor to the new deployment while preserving state. Verify the deployed revision, active/non-outdated monitor, and a populated recent FTT check before reporting the watch as running. No Telegram or wallet credentials are logged or changed.
