import type { Snapshot } from "./types";
import { positiveAlertBlockers } from "./alert-policy";
import { formatAlert } from "./format";

export function isEarlyNameCandidate(s: Snapshot): boolean {
  const mc = s.pair.marketCap ?? s.pair.fdv;
  return s.ageMinutes <= 30 && (mc == null || (mc > 0 && mc < 100_000))
    && s.narrative.pairFit && Boolean(s.quote.isNewPair || s.quote.isFirstMover)
    && positiveAlertBlockers(s).length === 0 && s.status !== "SKIP" && s.status !== "INVALIDATED";
}

export function formatCandidate(s: Snapshot): string {
  return formatAlert(s, { candidate: true });
}
