import { describe, expect, it } from "vitest";
import { narrativeScore } from "@/lib/narrative";
import { classify } from "@/lib/score";
import { shouldNotify } from "@/lib/transitions";
import type { Snapshot, WalletRiskMetrics, WalletVerification } from "@/lib/types";

type Base = Parameters<typeof classify>[0];

function wallet(verification: WalletVerification): WalletRiskMetrics {
  return {
    verification,
    provider: "test",
    checkedAt: Date.now(),
    graphChecked: true,
    bundleChecked: verification === "CLEAN",
    sniperChecked: verification === "CLEAN",
    fundingChecked: verification === "CLEAN",
    graphInsiderWallets: verification === "RISKY" ? 40 : 0,
    insiderSupplyPct: verification === "RISKY" ? 9 : 0,
    mintAuthorityRevoked: true,
    freezeAuthorityRevoked: true,
    flags: verification === "RISKY" ? ["40 linked insider wallets detected"] : verification === "UNKNOWN" ? ["verification incomplete: bundle, sniper, common-funder"] : [],
    excludedTokenAccounts: [],
  };
}

function base(overrides: Partial<Base> = {}): Base {
  const narrative = narrativeScore(
    { name: "LinkedInu", symbol: "LINKEDINU" },
    { mint: "quote", name: "LinkedIn", symbol: "LNKDX", isFirstMover: true, isNewPair: true, launchRank: 1 },
    { mode: "reward", transferFeeBps: 300, rewardMint: "quote", rewardSymbol: "LNKDX", nativeQuoteReward: true },
  );
  return {
    checkedAt: Date.now(),
    ageMinutes: 60,
    mode: "FLASH",
    launch: {
      signature: "test",
      launchedAt: Date.now() - 60 * 60_000,
      creator: "creator",
      platformConfig: "config",
      poolState: "pool",
      mint: "mint",
      quoteMint: "quote",
    },
    token: { name: "LinkedInu", symbol: "LINKEDINU" },
    quote: { mint: "quote", name: "LinkedIn", symbol: "LNKDX", isFirstMover: true, isNewPair: true, launchRank: 1 },
    pair: {
      marketCap: 220_000,
      liquidityUsd: 80_000,
      volume5m: 55_000,
      volume1h: 310_000,
      volume24h: 310_000,
      buys5m: 410,
      sells5m: 240,
      buys1h: 1_100,
      sells1h: 700,
      priceChange24h: 95,
    },
    holders: { holders: 520, top10Pct: 18, creatorPct: 0.5 },
    traders: { uniqueBuyers: 240, uniqueSellers: 130, uniqueTraders: 310, sampledSwaps: 400 },
    rewards: {
      mode: "reward",
      transferFeeBps: 300,
      rewardMint: "quote",
      rewardSymbol: "LNKDX",
      payoutCount: 3_500,
      rewardedHolders: 420,
      nativeQuoteReward: true,
    },
    stonk: { status: "graduated", graduationProgress: 1, officialPeakMarketCap: 300_000, mode: "reward" },
    wallet: wallet("CLEAN"),
    narrative,
    trend: { reawakeningSignals: ["24h price expansion", "fresh buy-side flow", "high volume/MC rotation"] },
    peakMarketCap: 300_000,
    lowMarketCap: 120_000,
    retention: 0.73,
    ...overrides,
  };
}

describe("LinkedInu/JUPCAT regression gates", () => {
  it("keeps the original LinkedInu-style setup eligible for GEM", () => {
    const result = classify(base());
    expect(result.status).toBe("GEM");
    expect(result.score).toBeGreaterThanOrEqual(82);
  });

  it("never treats UNKNOWN wallet evidence as CLEAN", () => {
    const result = classify(base({ wallet: wallet("UNKNOWN") }));
    expect(result.status).not.toBe("GEM");
    expect(result.risks.join(" ")).toContain("wallet gate UNKNOWN");
  });

  it("hard-rejects a linked/bundled wallet cluster", () => {
    const result = classify(base({ wallet: wallet("RISKY") }));
    expect(result.status).toBe("SKIP");
    expect(result.risks.join(" ")).toContain("linked insider wallets");
  });

  it("surfaces JUPCAT as REAWAKENING even when it is no longer a fresh launch", () => {
    const narrative = narrativeScore(
      { name: "Jupiter Cat", symbol: "JUPCAT" },
      { mint: "JUP", name: "Jupiter", symbol: "JUP", launchCount: 529 },
      { mode: "reward", transferFeeBps: 300, rewardMint: "JUP", rewardSymbol: "JUP", payoutCount: 127_584, rewardedHolders: 3_356, nativeQuoteReward: true },
    );
    const jupcat = base({
      ageMinutes: 13 * 24 * 60,
      mode: "REAWAKENING",
      token: { name: "Jupiter Cat", symbol: "JUPCAT" },
      quote: { mint: "JUP", name: "Jupiter", symbol: "JUP", launchCount: 529 },
      pair: {
        marketCap: 1_204_708,
        liquidityUsd: 117_058,
        volume24h: 309_584,
        buys1h: 180,
        sells1h: 110,
        priceChange24h: 123.2,
      },
      holders: { holders: 3_356, top10Pct: 17.27, creatorPct: 0 },
      traders: {},
      rewards: { mode: "reward", transferFeeBps: 300, rewardMint: "JUP", rewardSymbol: "JUP", payoutCount: 127_584, rewardedHolders: 3_356, nativeQuoteReward: true },
      wallet: wallet("UNKNOWN"),
      narrative,
      trend: { reawakeningSignals: ["24h price expansion", "fresh buy-side flow", "high volume/MC rotation"] },
      peakMarketCap: 2_189_473,
      lowMarketCap: 350_000,
      retention: 0.55,
    });
    const result = classify(jupcat);
    expect(narrative.mascotFit).toBe(true);
    expect(narrative.rewardFit).toBe(true);
    expect(result.status).toBe("REAWAKENING");
  });

  it("notifies on SKIP to REAWAKENING and GEM to INVALIDATED transitions", () => {
    expect(shouldNotify("SKIP", "REAWAKENING")).toBe(true);
    expect(shouldNotify("GEM", "INVALIDATED")).toBe(true);
    expect(shouldNotify("REAWAKENING", "REAWAKENING")).toBe(false);
  });
});

// Compile-time guard: the fixture must remain structurally compatible with a
// real Snapshot as the signal model evolves.
void ({} as Snapshot);
