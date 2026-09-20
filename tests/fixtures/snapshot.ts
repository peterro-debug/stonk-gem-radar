import type { Snapshot } from "@/lib/types";

export function verifiedSnapshot(): Snapshot {
  const now = Date.now();
  return {
    checkedAt: now, ageMinutes: 10, mode: "FLASH", score: 100, status: "GEM", reasons: [], risks: [],
    launch: { mint: "mint", signature: "sig", launchedAt: now - 600_000, poolState: "pool", quoteMint: "quote", platformConfig: "config" },
    token: { name: "Google It", symbol: "GOOGLEIT" }, quote: { mint: "quote", symbol: "GOOGL", isNewPair: true },
    pair: { checkedAt: now, marketCap: 50_000, liquidityUsd: 20_000, volume5m: 100_000, volume1h: 200_000,
      volume24h: 300_000, buys5m: 200, sells5m: 100, buys1h: 500, sells1h: 200 },
    holders: { checkedAt: now, holders: 200, top10Pct: 20, creatorPct: 0, sampleComplete: true, poolExclusionKnown: true },
    traders: { checkedAt: now, uniqueBuyers: 30, uniqueTraders: 50, sampledSwaps: 80 },
    rewards: { nativeQuoteReward: true }, stonk: {},
    wallet: { checkedAt: now, verification: "CLEAN", provider: "fixture", graphChecked: true, bundleChecked: true,
      sniperChecked: true, fundingChecked: true, insiderSupplyPct: 0, bundledSupplyPct: 0, sniperSupplyPct: 0,
      commonFunderSupplyPct: 0, freshWalletSupplyPct: 0, mintAuthorityRevoked: true, freezeAuthorityRevoked: true,
      flags: [], excludedTokenAccounts: ["vault"] },
    narrative: { score: 3, pairFit: true, reason: "Google It / Alphabet", mascotFit: false, firstMoverFit: true, rewardFit: true },
    trend: { reawakeningSignals: ["growth", "flow"] }, retention: .8,
  };
}
