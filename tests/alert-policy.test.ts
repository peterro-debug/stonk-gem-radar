import { describe, expect, it } from "vitest";
import { maySendAlert, positiveAlertBlockers } from "@/lib/alert-policy";
import { classify } from "@/lib/score";
import { isEarlyNameCandidate } from "@/lib/candidate";
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

describe("mandatory checks before every positive alert", () => {
  it("allows a fully verified 3/5 candidate and rejects 2/5 despite 100 points", () => {
    const s = verifiedSnapshot();
    expect(positiveAlertBlockers(s)).toEqual([]);
    expect(maySendAlert(s, false)).toBe(true);
    s.narrative.score = 2;
    expect(classify(s).status).toBe("NO SIGNAL");
    expect(maySendAlert(s, false)).toBe(false);
    expect(isEarlyNameCandidate(s)).toBe(false);
  });
  it.each(["FLASH", "EARLY WATCH", "BUILD WATCH", "REAWAKENING", "RECLAIM", "GEM"] as const)("blocks %s with incomplete wallets", status => {
    const s = verifiedSnapshot(); s.status = status; s.wallet.verification = "UNKNOWN";
    expect(maySendAlert(s, false)).toBe(false);
    expect(classify(s).status).toBe("NO SIGNAL");
  });
  it("requires real measurements even when a provider claims CLEAN and analyzed", () => {
    const s = verifiedSnapshot(); s.wallet.commonFunderSupplyPct = undefined;
    expect(maySendAlert(s, false)).toBe(false);
    expect(isEarlyNameCandidate(s)).toBe(false);
    s.wallet.commonFunderSupplyPct = 0; s.wallet.freshWalletSupplyPct = undefined;
    expect(maySendAlert(s, false)).toBe(false);
  });
  it("rechecks freshness when delivery retries", () => {
    const s = verifiedSnapshot();
    expect(maySendAlert(s, false, s.checkedAt + 6 * 60_000)).toBe(false);
    s.pair.checkedAt = s.checkedAt - 6 * 60_000;
    expect(classify(s).status).toBe("NO SIGNAL");
  });
  it("waits for incomplete holders, missing creator data, thin liquidity and missing buyer evidence", () => {
    for (const mutate of [
      (s: Snapshot) => { s.holders.sampleComplete = undefined; },
      (s: Snapshot) => { s.holders.creatorPct = undefined; },
      (s: Snapshot) => { s.pair.liquidityUsd = 3_000; },
      (s: Snapshot) => { s.traders = {}; },
      (s: Snapshot) => { s.narrative.pairFit = false; },
    ]) {
      const s = verifiedSnapshot(); mutate(s);
      expect(classify(s).status).toBe("NO SIGNAL");
      expect(isEarlyNameCandidate(s)).toBe(false);
    }
  });
  it("keeps invalidation delivery for previously alerted tokens regardless of missing checks or narrative", () => {
    const s = verifiedSnapshot();
    s.narrative.score = 1; s.wallet.verification = "UNKNOWN"; s.wallet.bundledSupplyPct = 30;
    const verdict = classify(s, { everAlerted: true });
    expect(verdict.status).toBe("INVALIDATED");
    expect(maySendAlert({ ...s, ...verdict }, true)).toBe(true);
    expect(maySendAlert({ ...s, ...verdict }, false)).toBe(false);
  });
});
