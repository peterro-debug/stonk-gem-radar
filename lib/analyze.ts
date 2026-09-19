import { modeForAge } from "./constants";
import { getPairMetrics } from "./dex";
import { getHolderMetrics, getTokenMeta, getTraderMetrics } from "./helius";
import { narrativeScore } from "./narrative";
import { getQuoteMeta } from "./pairs";
import { classify } from "./score";
import { getStonkContext } from "./stonk";
import { calculateTrend } from "./trends";
import { getWalletRiskMetrics } from "./wallet-risk";
import type { AnalysisContext, Launch, PairMetrics, Snapshot, TokenMeta } from "./types";
import { activePairEvent } from "./pair-events";
import { pairMonitorStatus } from "./pair-monitor-status";

function mergeDefined<T extends object>(base: T, override: Partial<T>): T {
  const out = { ...base } as Record<string, unknown>;
  for (const [key, value] of Object.entries(override)) {
    if (value !== undefined && value !== null) out[key] = value;
  }
  return out as T;
}

function mergeToken(primary: TokenMeta, fallback: TokenMeta): TokenMeta {
  return {
    name: primary.name || fallback.name,
    symbol: primary.symbol || fallback.symbol,
    image: primary.image || fallback.image,
    decimals: primary.decimals ?? fallback.decimals,
  };
}

export async function analyzeLaunch(launch: Launch, context: AnalysisContext = {}): Promise<Snapshot> {
  const [stonk, dexPair, wallet, heliusToken, quoteFallback, traders] = await Promise.all([
    getStonkContext(launch.mint, launch.quoteMint),
    getPairMetrics(launch.mint, launch.quoteMint),
    getWalletRiskMetrics(launch.mint, launch.launchedAt),
    getTokenMeta(launch.mint),
    getQuoteMeta(launch.quoteMint),
    getTraderMetrics(launch.poolState, launch.mint, launch.baseVault, launch.launchedAt),
  ]);

  const excludedTokenAccounts = [
    launch.baseVault,
    ...wallet.excludedTokenAccounts,
  ].filter((value): value is string => Boolean(value));
  const holders = await getHolderMetrics(launch.mint, {
    creator: launch.creator,
    excludeTokenAccounts: [...new Set(excludedTokenAccounts)],
  }).catch(() => ({ holders: 0, sampleComplete: false, poolExclusionKnown: excludedTokenAccounts.length > 0 }));

  const now = Date.now();
  const ageMinutes = Math.max(0, (now - launch.launchedAt) / 60_000);
  const token = mergeToken(stonk.token, heliusToken);
  const quote = {
    ...quoteFallback,
    ...stonk.quote,
    name: stonk.quote.name || quoteFallback.name,
    symbol: stonk.quote.symbol || quoteFallback.symbol,
    image: stonk.quote.image || quoteFallback.image,
  };
  let event = launch.pairEvent || context.previous?.quote.event;
  if (!event && ageMinutes <= 30) {
    try {
      const monitor = await pairMonitorStatus();
      event = monitor.state && activePairEvent(monitor.state.events, launch.quoteMint, now);
    } catch { /* Event source unavailable: retain first-mover inference, never invent an event. */ }
  }
  if (event && activePairEvent([event], launch.quoteMint, now)) {
    quote.event = event;
    quote.isNewPair = true;
  }
  const pair = mergeDefined<PairMetrics>(stonk.pair, dexPair);
  const marketCap = pair.marketCap ?? pair.fdv;
  const peakMarketCap = Math.max(
    context.peakMarketCap || 0,
    stonk.stonk.officialPeakMarketCap || 0,
    marketCap || 0,
  ) || undefined;
  const lowMarketCap = marketCap == null
    ? context.lowMarketCap
    : Math.min(context.lowMarketCap ?? marketCap, marketCap);
  const retention = peakMarketCap && marketCap ? marketCap / peakMarketCap : undefined;
  const trend = calculateTrend(pair, holders.holders, traders.uniqueBuyers, lowMarketCap, context.previous);
  const narrative = narrativeScore(token, quote, stonk.rewards);

  const base = {
    checkedAt: now,
    ageMinutes,
    mode: modeForAge(ageMinutes),
    launch,
    token,
    quote,
    pair,
    holders,
    traders,
    rewards: stonk.rewards,
    stonk: stonk.stonk,
    wallet,
    narrative,
    trend,
    peakMarketCap,
    lowMarketCap,
    retention,
  };
  const verdict = classify(base, { previous: context.previous, everAlerted: context.everAlerted });
  return { ...base, ...verdict };
}
