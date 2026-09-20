import { describe, expect, it } from "vitest";
import { classify } from "@/lib/score";
import { maySendAlert, observationBlockers } from "@/lib/alert-policy";
import { assessNovelty, similarIdentity } from "@/lib/novelty";
import { narrativeScore } from "@/lib/narrative";
import { formatAlert } from "@/lib/format";
import { shouldNotify } from "@/lib/transitions";
import { verifiedSnapshot } from "./fixtures/snapshot";

function unknownConcept(name = "Velvet Orbit") {
  const s = verifiedSnapshot();
  s.token = { name, symbol: "VORBIT" };
  s.quote = { mint: "unseen-quote", name: "Unseen Asset", symbol: "UNSEEN" };
  s.rewards = { nativeQuoteReward: true, transferFeeBps: 100 };
  s.narrative = narrativeScore(s.token, s.quote, s.rewards);
  s.novelty = assessNovelty({ mint: s.launch.mint, launchedAt: s.launch.launchedAt, token: s.token,
    quote: s.quote, rewards: s.rewards, rows: [], pairCoverageComplete: true });
  s.wallet.verification = "UNKNOWN";
  s.wallet.bundleChecked = s.wallet.sniperChecked = s.wallet.fundingChecked = false;
  s.wallet.bundledSupplyPct = s.wallet.sniperSupplyPct = s.wallet.commonFunderSupplyPct = s.wallet.freshWalletSupplyPct = undefined;
  s.traders = {};
  return s;
}

describe("open concept discovery and graded alerts", () => {
  it.each(["Velvet Orbit", "Copper Lantern", "Quiet Comet"])("finds previously unknown concept %s without a name whitelist", name => {
    const s = unknownConcept(name);
    expect(s.narrative.pairFit).toBe(false);
    expect(s.narrative.score).toBeLessThan(3);
    expect(s.novelty?.score).toBeGreaterThanOrEqual(3);
    const classified = { ...s, ...classify(s) };
    expect(classified.status).toBe("OBSERVATION");
    expect(maySendAlert(classified, false)).toBe(true);
    const text = formatAlert(classified);
    expect(text).toContain("🟡 OBSERVASJON");
    expect(text).toContain("Ufullstendig verifisert");
    expect(text).toContain("navnekobling til paret ikke bekreftet");
    expect(text).not.toContain("bestått");
    expect(text).not.toContain("🟢");
    expect(maySendAlert({ ...classified, status: "GEM" }, false)).toBe(false);
  });
  it("withholds observations for missing core evidence, weak trading, stale data and known risks", () => {
    for (const change of [
      (s: ReturnType<typeof unknownConcept>) => { s.wallet.graphChecked = false; },
      (s: ReturnType<typeof unknownConcept>) => { s.wallet.mintAuthorityRevoked = undefined; },
      (s: ReturnType<typeof unknownConcept>) => { s.holders.creatorPct = undefined; },
      (s: ReturnType<typeof unknownConcept>) => { s.holders.poolExclusionKnown = false; },
      (s: ReturnType<typeof unknownConcept>) => { s.pair.buys5m = 2; },
      (s: ReturnType<typeof unknownConcept>) => { s.wallet.bundledSupplyPct = 9; },
      (s: ReturnType<typeof unknownConcept>) => { s.wallet.verification = "RISKY"; },
      (s: ReturnType<typeof unknownConcept>) => { s.novelty!.pairComparisonReady = false; },
      (s: ReturnType<typeof unknownConcept>) => { s.novelty!.checkedAt -= 600_000; },
    ]) {
      const s = unknownConcept(); change(s);
      expect(observationBlockers(s).length).toBeGreaterThan(0);
      expect(maySendAlert({ ...s, status: "OBSERVATION" }, false)).toBe(false);
      expect(classify(s).status).not.toBe("OBSERVATION");
    }
    const s = unknownConcept();
    expect(maySendAlert({ ...s, status: "OBSERVATION" }, false, s.checkedAt + 360_000)).toBe(false);
  });
  it("deduplicates observations, permits upgrades and warns if a previously observed token becomes risky", () => {
    expect(shouldNotify("NO SIGNAL", "OBSERVATION")).toBe(true);
    expect(shouldNotify("OBSERVATION", "OBSERVATION")).toBe(false);
    expect(shouldNotify("OBSERVATION", "GEM")).toBe(true);
    expect(shouldNotify("GEM", "OBSERVATION")).toBe(false);
    const s = unknownConcept(); s.wallet.insiderSupplyPct = 12;
    const result = { ...s, ...classify(s, { everAlerted: true }) };
    expect(result.status).toBe("INVALIDATED");
    expect(maySendAlert(result, true)).toBe(true);
  });
  it("detects copies without using later launches as historical evidence", () => {
    const s = unknownConcept();
    const input = { mint: s.launch.mint, launchedAt: s.launch.launchedAt, token: s.token, quote: s.quote,
      rewards: s.rewards, pairCoverageComplete: true };
    const prior = { mint: "earlier", name: "Velvet Orbit", symbol: "VORBIT", quote: { mint: s.quote.mint },
      createdAt: new Date(s.launch.launchedAt - 60_000).toISOString() };
    for (const name of ["Velvet Orbit", "Velvet Orbit 2.0", "Baby Velvet Orbit", "Velvet Orbiit"]) {
      s.novelty = assessNovelty({ ...input, token: { name, symbol: "VORBIT" }, rows: [prior] });
      expect(s.novelty.duplicate).toBe(true);
      expect(classify(s).status).toBe("NO SIGNAL");
    }
    expect(assessNovelty({ ...input, rows: [{ ...prior, createdAt: new Date(s.launch.launchedAt + 60_000).toISOString() }] }).duplicate).toBe(false);
    expect(similarIdentity("Quiet Comet", "Velvet Orbit")).toBe(false);
    expect(assessNovelty({ ...input, token: { name: "Topcat", symbol: "TOPCAT" },
      rows: [{ ...prior, name: "POPCAT", symbol: "POPCAT" }] }).duplicate).toBe(false);
  });
  it("does not equate generic names or failed catalogues with originality", () => {
    expect(unknownConcept("Baby Moon Coin").novelty?.distinctive).toBe(false);
    expect(classify(unknownConcept("Baby Moon Coin")).status).toBe("NO SIGNAL");
  });
});
