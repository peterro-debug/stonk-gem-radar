import { describe, expect, it } from "vitest";
import { maySendAlert, positiveAlertBlockers } from "@/lib/alert-policy";
import { classify } from "@/lib/score";
import { isEarlyNameCandidate } from "@/lib/candidate";
import type { Snapshot } from "@/lib/types";

import { verifiedSnapshot } from "./fixtures/snapshot";

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
    expect(classify(s).status).toBe("OBSERVATION");
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
      (s: Snapshot) => { s.narrative.pairFit = false; },
    ]) {
      const s = verifiedSnapshot(); mutate(s);
      expect(classify(s).status).toBe("NO SIGNAL");
      expect(isEarlyNameCandidate(s)).toBe(false);
    }
  });
  it("keeps missing on-chain buyers out of verified signals while allowing a labelled observation", () => {
    const s = verifiedSnapshot(); s.traders = {};
    expect(maySendAlert(s, false)).toBe(false);
    expect(classify(s).status).toBe("OBSERVATION");
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
