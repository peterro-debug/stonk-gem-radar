# Stonk Gem Radar

Event-driven scanner for newly launched StonkFun / Raydium LaunchLab tokens. The goal is **early discovery**, not a delayed trending list.

## What it does

1. Helius raw webhook watches the Raydium LaunchLab program.
2. The receiver only accepts instructions using one of StonkFun's two platform configs.
3. New StonkFun mint = a durable Vercel Workflow.
4. The workflow checks the launch around **T+20s, T+3m, T+7m, T+12m and T+20m**.
5. It enriches with:
   - exact base mint + quote mint from the launch instruction,
   - quote metadata / `isNew` pair signal,
   - Helius holder count and top-10 concentration (bonding-curve base vault excluded),
   - creator balance,
   - DexScreener market cap / liquidity / volume / buys / sells,
   - pair-aware meme/narrative score,
   - peak market-cap retention across the workflow.
6. Telegram only receives meaningful state changes: `FLASH`, `EARLY WATCH`, `GEM`, `RECLAIM`, or a later `SKIP` if a previously alerted coin fails.

## StonkFun addresses

- Raydium LaunchLab: `LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj`
- StonkFun reward config: `6BwHHDg3u1854jC8PDLXvR4spTcLNaoBxLJNGC4nTESt`
- StonkFun standard config: `4E876qZTE9FJMrBzgVtBrSrzz2TLivB5Y5QXPjB4gZL7`

For `initialize_with_token_2022`, the scanner uses the documented account layout: creator=1, platform config=3, pool=5, new mint=6, quote mint=7, base vault=8, quote vault=9.

## Secrets

Set these in Vercel. Never commit them.

```text
HELIUS_API_KEY=
HELIUS_WEBHOOK_AUTH_SECRET=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=          # preferred once known
TELEGRAM_USERNAME=PelleSuper
```

If `TELEGRAM_CHAT_ID` is temporarily absent, the bot can resolve it from recent Telegram `/start` updates matching `TELEGRAM_USERNAME`. Set the numeric chat ID afterward so delivery no longer depends on Telegram retaining the update.

## Helius webhook

Create a **raw mainnet webhook** monitoring the LaunchLab program address and point it at:

```text
https://<deployment>/api/helius
```

Set the webhook auth header to the same value as `HELIUS_WEBHOOK_AUTH_SECRET`.

The receiver returns 2xx quickly after starting a durable workflow. Helius retries failed deliveries, so keep the route idempotent at the provider level where possible.

## Security

A Telegram bot token that has ever been pasted into a chat should be rotated before production. Put the replacement directly in Vercel's encrypted environment variables rather than in source code or GitHub.
