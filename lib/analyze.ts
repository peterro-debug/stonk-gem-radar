import { modeForAge } from "./constants";
import { getPairMetrics } from "./dex";
import { getHolderMetrics, getTokenMeta, getTraderMetrics } from "./helius";
import { narrativeScore } from "./narrative";
import { getQuoteMeta } from "./pairs";
import { classify } from "./score";
import { getStonkContext, recentConceptCatalogue } from "./stonk";
import { assessNovelty } from "./novelty";
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
  const [stonk, dexPair, wallet, heliusToken, quoteFallback, recentConcepts] = await Promise.all([
    getStonkContext(launch.mint, launch.quoteMint),
    getPairMetrics(launch.mint, launch.quoteMint),
    getWalletRiskMetrics(launch.mint, launch.launchedAt, launch.baseVault ? [launch.baseVault] : []),
    getTokenMeta(launch.mint),
    getQuoteMeta(launch.quoteMint),
    recentConceptCatalogue(),
  ]);

  const excludedTokenAccounts = [
    launch.baseVault,
    ...wallet.excludedTokenAccounts,
  ].filter((value): value is string => Boolean(value));
  const [holders, traders] = await Promise.all([getHolderMetrics(launch.mint, {
    creator: launch.creator || stonk.creator,
    excludeTokenAccounts: [...new Set(excludedTokenAccounts)],
  }).catch((error: unknown) => ({ holders: 0, sampleComplete: false, poolExclusionKnown: excludedTokenAccounts.length > 0,
    error: error instanceof Error && /^Helius RPC \w+ failed: \d+$/.test(error.message)
      ? error.message : "Helius holder data unavailable" })),
    getTraderMetrics(launch.poolState, launch.mint, launch.baseVault || excludedTokenAccounts[0], launch.launchedAt),
  ]);

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
  if (Object.keys(pair).length) pair.checkedAt = now;
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
  const novelty = assessNovelty({ mint: launch.mint, launchedAt: launch.launchedAt, token, quote,
    rewards: stonk.rewards, rows: [...stonk.catalogue.rows, ...recentConcepts],
    pairCoverageComplete: stonk.catalogue.pairCoverageComplete, pairComparisonReady: stonk.catalogue.pairComparisonReady, now });

  const base = {
    checkedAt: now,
    ageMinutes,
    mode: modeForAge(ageMinutes),
    launch: { ...launch, creator: launch.creator || stonk.creator },
    token,
    quote,
    pair,
    holders,
    traders,
    rewards: stonk.rewards,
    stonk: stonk.stonk,
    wallet,
    narrative,
    novelty,
    trend,
    peakMarketCap,
    lowMarketCap,
    retention,
  };
  const verdict = classify(base, { previous: context.previous, everAlerted: context.everAlerted });
  return { ...base, ...verdict };
}
