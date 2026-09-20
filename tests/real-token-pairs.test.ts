import { describe, expect, it } from "vitest";
import { narrativeScore } from "@/lib/narrative";
import { nameAssociation } from "@/lib/name-fit";
import { classify } from "@/lib/score";
import { maySendAlert } from "@/lib/alert-policy";
import { verifiedSnapshot } from "./fixtures/snapshot";

// Actual names/quotes read from Stonk's token API on 2026-09-20.
// Market/security fixtures below are synthetic: this is not a launch-time replay.
const cases = [
  { name: "Feels Good Man", symbol: "FEELSGOOD", quote: "PEPE", score: 4, links: 46, pct: .9354407869449195 },
  { name: "ALLINU", symbol: "ALLINU", quote: "DKNG", score: 3, links: 114, pct: 9.458480674716817 },
  { name: "LinkedInu", symbol: "LinkedInu", quote: "MSFTX", score: 4, links: 26, pct: 4.787575757160758 },
  { name: "Anonymous Cat", symbol: "ZCAT", quote: "ZEC", score: 4, links: 323, pct: 3.652847199328725 },
];

describe("real pair associations without weakening safety", () => {
  it.each(cases)("recognizes $name against $quote", c => {
    const narrative = narrativeScore(c, { mint: "quote", symbol: c.quote }, { nativeQuoteReward: true, transferFeeBps: 100 });
    expect(narrative).toMatchObject({ pairFit: true, score: c.score });
    const s = verifiedSnapshot(); s.narrative = narrative;
    expect(maySendAlert(s, false)).toBe(true);
    s.wallet.verification = "UNKNOWN";
    expect(maySendAlert(s, false)).toBe(false);
    s.wallet.verification = "RISKY";
    s.wallet.graphInsiderWallets = c.links;
    s.wallet.insiderSupplyPct = c.pct;
    s.wallet.flags = [`${c.links} linked insider wallets detected`];
    expect(classify(s).status).toBe("SKIP");
  });
  it("does not match unrelated pairs or incidental substrings", () => {
    expect(nameAssociation({ name: "LinkedInu" }, { symbol: "GOOGL" }).matched).toBe(false);
    expect(nameAssociation({ name: "ALLINU" }, { symbol: "MSFTX" }).matched).toBe(false);
    expect(nameAssociation({ name: "Anonymous Cat" }, { symbol: "DKNG" }).matched).toBe(false);
    expect(nameAssociation({ name: "Fall Into Space" }, { symbol: "DKNG" }).matched).toBe(false);
  });
});
