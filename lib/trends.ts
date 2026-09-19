import type { PairMetrics, Snapshot, TrendMetrics } from "./types";

function change(current?: number, previous?: number): number | undefined {
  if (current == null || previous == null || previous <= 0) return undefined;
  return ((current - previous) / previous) * 100;
}

function acceleration(current?: number, previous?: number): number | undefined {
  if (current == null || previous == null || previous <= 0) return undefined;
  return current / previous;
}

export function calculateTrend(
  pair: PairMetrics,
  holders: number,
  uniqueBuyers: number | undefined,
  lowMarketCap: number | undefined,
  previous?: Snapshot,
): TrendMetrics {
  const mc = pair.marketCap ?? pair.fdv;
  const previousMc = previous?.pair.marketCap ?? previous?.pair.fdv;
  const holderGrowthPct = change(holders, previous?.holders.holders);
  const uniqueBuyerGrowthPct = change(uniqueBuyers, previous?.traders.uniqueBuyers);
  const marketCapChangePct = change(mc, previousMc);
  const liquidityGrowthPct = change(pair.liquidityUsd, previous?.pair.liquidityUsd);
  const volume1hAcceleration = acceleration(pair.volume1h, previous?.pair.volume1h);
  const volume24hAcceleration = acceleration(pair.volume24h, previous?.pair.volume24h);
  const recoveryFromLowPct = mc != null && lowMarketCap != null && lowMarketCap > 0
    ? ((mc - lowMarketCap) / lowMarketCap) * 100
    : undefined;

  const signals: string[] = [];
  if ((pair.priceChange24h || 0) >= 35) signals.push("24h price expansion");
  if ((marketCapChangePct || 0) >= 35) signals.push("market-cap acceleration");
  if ((holderGrowthPct || 0) >= 10) signals.push("holder growth resumed");
  if ((uniqueBuyerGrowthPct || 0) >= 20) signals.push("unique buyers accelerating");
  if ((volume1hAcceleration || 0) >= 1.8) signals.push("1h volume acceleration");
  if ((volume24hAcceleration || 0) >= 1.5) signals.push("24h volume acceleration");
  if ((recoveryFromLowPct || 0) >= 35) signals.push("price reclaimed from tracked low");

  const buys = pair.buys1h || 0;
  const sells = pair.sells1h || 0;
  if (buys >= 30 && buys > sells * 1.2) signals.push("fresh buy-side flow");
  if (mc && (pair.volume24h || 0) / mc >= 0.2) signals.push("high volume/MC rotation");

  return {
    holderGrowthPct,
    uniqueBuyerGrowthPct,
    marketCapChangePct,
    liquidityGrowthPct,
    volume1hAcceleration,
    volume24hAcceleration,
    recoveryFromLowPct,
    reawakeningSignals: signals,
  };
}
