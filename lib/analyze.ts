import { getPairMetrics } from "./dex";
import { getHolderMetrics, getTokenMeta, getTraderMetrics } from "./helius";
import { getQuoteMeta } from "./pairs";
import { narrativeScore } from "./narrative";
import { classify } from "./score";
import type { Launch, Snapshot } from "./types";

export async function analyzeLaunch(launch: Launch, previousPeak?: number): Promise<Snapshot> {
  const [token, quote, pair, holders, traders] = await Promise.all([
    getTokenMeta(launch.mint),
    getQuoteMeta(launch.quoteMint),
    getPairMetrics(launch.mint, launch.quoteMint),
    getHolderMetrics(launch.mint, {
      creator: launch.creator,
      excludeTokenAccounts: [launch.baseVault || ""].filter(Boolean),
    }),
    getTraderMetrics(launch.poolState, launch.mint, launch.baseVault, launch.launchedAt),
  ]);

  const now = Date.now();
  const ageMinutes = Math.max(0, (now - launch.launchedAt) / 60_000);
  const marketCap = pair.marketCap ?? pair.fdv;
  const peakMarketCap = Math.max(previousPeak || 0, marketCap || 0) || undefined;
  const retention = peakMarketCap && marketCap ? marketCap / peakMarketCap : undefined;
  const narrative = narrativeScore(token, quote);

  const base = {
    checkedAt: now,
    ageMinutes,
    launch,
    token,
    quote,
    pair,
    holders,
    traders,
    narrativeScore: narrative.score,
    narrativeReason: narrative.reason,
    peakMarketCap,
    retention,
  };
  const verdict = classify(base);
  return { ...base, ...verdict };
}
