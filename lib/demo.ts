import { discoverCandidates, type DiscoveryCandidate } from "./discovery";
import { listStonkTokens, stonkRowToLaunch } from "./stonk";
import type { Snapshot } from "./types";

export type DemoCandidate = DiscoveryCandidate & {
  selection: "radar-candidate" | "newest-fallback";
};

export async function chooseDemoCandidate(): Promise<DemoCandidate> {
  const candidates = await discoverCandidates();
  if (candidates[0]) {
    return { ...candidates[0], selection: "radar-candidate" };
  }

  const newest = await listStonkTokens("newest", 1, 25);
  for (const row of newest) {
    const launch = stonkRowToLaunch(row);
    if (!launch) continue;
    return {
      launch,
      mode: "FLASH",
      priority: 0,
      reason: "newest valid StonkFun launch (demo fallback)",
      selection: "newest-fallback",
    };
  }

  throw new Error("No valid StonkFun launch is currently available for the demo");
}

export function summarizeDemo(snapshot: Snapshot) {
  return {
    candidate: {
      name: snapshot.token.name,
      symbol: snapshot.token.symbol,
      mint: snapshot.launch.mint,
      quote: snapshot.quote.symbol || snapshot.quote.name,
      ageMinutes: Number(snapshot.ageMinutes.toFixed(1)),
      mode: snapshot.mode,
    },
    market: {
      marketCapUsd: snapshot.pair.marketCap ?? snapshot.pair.fdv,
      liquidityUsd: snapshot.pair.liquidityUsd,
      volume5mUsd: snapshot.pair.volume5m,
      volume1hUsd: snapshot.pair.volume1h,
      volume24hUsd: snapshot.pair.volume24h,
      priceChange24hPct: snapshot.pair.priceChange24h,
      buys5m: snapshot.pair.buys5m,
      sells5m: snapshot.pair.sells5m,
    },
    participation: {
      holders: snapshot.holders.holders,
      top10Pct: snapshot.holders.top10Pct,
      creatorPct: snapshot.holders.creatorPct,
      uniqueBuyers: snapshot.traders.uniqueBuyers,
      uniqueTraders: snapshot.traders.uniqueTraders,
    },
    walletGate: {
      verification: snapshot.wallet.verification,
      provider: snapshot.wallet.provider,
      graphChecked: snapshot.wallet.graphChecked,
      bundleChecked: snapshot.wallet.bundleChecked,
      sniperChecked: snapshot.wallet.sniperChecked,
      fundingChecked: snapshot.wallet.fundingChecked,
      bundledSupplyPct: snapshot.wallet.bundledSupplyPct,
      sniperSupplyPct: snapshot.wallet.sniperSupplyPct,
      commonFunderSupplyPct: snapshot.wallet.commonFunderSupplyPct,
      freshWalletSupplyPct: snapshot.wallet.freshWalletSupplyPct,
      gmgn: snapshot.wallet.gmgn,
    },
    verdict: {
      status: snapshot.status,
      score: snapshot.score,
      reasons: snapshot.reasons,
      risks: snapshot.risks,
    },
    narrative: snapshot.narrative,
    novelty: snapshot.novelty,
  };
}
