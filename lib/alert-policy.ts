import { isFresh, percentage } from "./risk-validation";
import { WALLET_LIMITS } from "./constants";
import type { Snapshot, WalletRiskMetrics } from "./types";

export const ALERT_POLICY_VERSION = "originality-and-observation-v2";
export const MIN_NARRATIVE_SCORE = 3;
export const MIN_ALERT_LIQUIDITY_USD = 10_000;

export function missingWalletChecks(w: WalletRiskMetrics, now: number): string[] {
  return [
    !isFresh(w.checkedAt, now) && "fresh wallet evidence",
    !(w.graphChecked && percentage(w.insiderSupplyPct) != null) && "insider graph",
    !(w.bundleChecked && percentage(w.bundledSupplyPct) != null) && "bundles",
    !(w.sniperChecked && percentage(w.sniperSupplyPct) != null) && "snipers",
    !(w.fundingChecked && percentage(w.commonFunderSupplyPct) != null) && "common funders",
    percentage(w.freshWalletSupplyPct) == null && "fresh-wallet concentration",
    w.mintAuthorityRevoked !== true && "mint authority revoked",
    w.freezeAuthorityRevoked !== true && "freeze authority revoked",
  ].filter((v): v is string => Boolean(v));
}

export function walletThresholdRisks(w: WalletRiskMetrics): string[] {
  const flags: string[] = [];
  for (const field of ["bundledSupplyPct", "sniperSupplyPct", "commonFunderSupplyPct", "freshWalletSupplyPct", "insiderSupplyPct"] as const) {
    const value = percentage(w[field]);
    if (value != null && value > WALLET_LIMITS[field]) flags.push(`${field}: ${value.toFixed(1)}% exceeds ${WALLET_LIMITS[field]}%`);
  }
  if (w.mintAuthorityRevoked === false) flags.push("mint authority remains enabled");
  if (w.freezeAuthorityRevoked === false) flags.push("freeze authority remains enabled");
  if (w.rugged === true) flags.push("token marked as rugged");
  return flags;
}

type Evidence = Omit<Snapshot, "score" | "status" | "reasons" | "risks">;

export function positiveAlertBlockers(s: Evidence, now = s.checkedAt): string[] {
  const missing = missingWalletChecks(s.wallet, now);
  if (s.wallet.verification !== "CLEAN") missing.push(`wallet gate ${s.wallet.verification}`);
  missing.push(...walletThresholdRisks(s.wallet));
  if (s.novelty?.duplicate) missing.push("earlier close-name launch found");
  if (!isFresh(s.checkedAt, now)) missing.push("fresh analysis");
  if (!Number.isFinite(s.narrative.score) || s.narrative.score < MIN_NARRATIVE_SCORE) missing.push("narrative at least 3/5");
  if (!s.narrative.pairFit || !s.narrative.reason?.trim()) missing.push("documented name/pair connection");
  if (s.holders.sampleComplete !== true || s.holders.poolExclusionKnown !== true
    || s.holders.holders <= 0 || percentage(s.holders.top10Pct) == null || percentage(s.holders.creatorPct) == null) {
    missing.push("complete holder and creator distribution with pool exclusions");
  }
  if (!isFresh(s.holders.checkedAt, now)) missing.push("fresh holder evidence");
  if (!isFresh(s.pair.checkedAt, now)) missing.push("fresh market evidence");
  const mc = s.pair.marketCap ?? s.pair.fdv;
  if (!Number.isFinite(mc) || (mc || 0) <= 0) missing.push("market cap");
  if (!Number.isFinite(s.pair.liquidityUsd) || (s.pair.liquidityUsd || 0) < MIN_ALERT_LIQUIDITY_USD) missing.push("liquidity at least $10,000");
  const volume = s.mode === "FLASH" ? s.pair.volume5m : s.mode === "BUILD" ? s.pair.volume1h : s.pair.volume24h;
  const buys = s.mode === "FLASH" ? s.pair.buys5m : s.pair.buys1h;
  const sells = s.mode === "FLASH" ? s.pair.sells5m : s.pair.sells1h;
  if (!Number.isFinite(volume) || (volume || 0) <= 0 || !Number.isFinite(buys) || (buys || 0) <= 0 || !Number.isFinite(sells) || (sells ?? -1) < 0) missing.push("measured volume and buy/sell flow");
  if (!isFresh(s.traders.checkedAt, now) || !Number.isFinite(s.traders.uniqueBuyers)
    || (s.traders.uniqueBuyers || 0) <= 0 || (s.traders.sampledSwaps || 0) <= 0) missing.push("on-chain buyer sample");
  return [...new Set(missing)];
}

export function novelConceptQualified(s: Evidence, now = s.checkedAt): boolean {
  const n = s.novelty;
  return Boolean(n && isFresh(n.checkedAt, now) && n.pairComparisonReady && n.distinctive
    && !n.duplicate && n.score >= 3);
}

// An observation is an explicit request for human review, never a verified GEM.
// Only specified specialist gaps are allowed; core evidence still fails closed.
export function observationBlockers(s: Evidence, now = s.checkedAt): string[] {
  const permittedGaps = new Set(["bundles", "snipers", "common funders", "fresh-wallet concentration",
    "wallet gate UNKNOWN", "on-chain buyer sample"]);
  if (novelConceptQualified(s, now)) {
    permittedGaps.add("narrative at least 3/5");
    permittedGaps.add("documented name/pair connection");
  }
  const blockers = positiveAlertBlockers(s, now).filter(reason => !permittedGaps.has(reason));
  const mc = s.pair.marketCap ?? s.pair.fdv ?? 0;
  const cap = s.mode === "FLASH" ? 750_000 : s.mode === "BUILD" ? 5_000_000 : 10_000_000;
  if (mc < 5_000 || mc > cap) blockers.push("outside observation market-cap window");
  if (s.holders.holders < 60) blockers.push("at least 60 measured holders");
  if ((s.holders.top10Pct ?? 100) > 55 || (s.holders.creatorPct ?? 100) > 15) blockers.push("holder concentration");
  if (s.wallet.verification === "RISKY") blockers.push("known wallet risk");
  const volume = s.mode === "FLASH" ? s.pair.volume5m : s.mode === "BUILD" ? s.pair.volume1h : s.pair.volume24h;
  const minimum = s.mode === "FLASH" ? 10_000 : s.mode === "BUILD" ? 20_000 : 50_000;
  const buys = s.mode === "FLASH" ? s.pair.buys5m : s.pair.buys1h;
  const sells = s.mode === "FLASH" ? s.pair.sells5m : s.pair.sells1h;
  if ((volume ?? 0) < minimum || (buys ?? 0) < 30 || (buys ?? 0) < (sells ?? 0) * 0.8) blockers.push("insufficient observation activity");
  if (s.retention != null && s.retention < 0.25) blockers.push("weak peak retention");
  if (s.mode === "REAWAKENING" && s.trend.reawakeningSignals.length < 2) blockers.push("unconfirmed renewed activity");
  return [...new Set(blockers)];
}

export function maySendAlert(s: Snapshot, everAlerted: boolean, now = Date.now()): boolean {
  if (s.status === "INVALIDATED") return everAlerted;
  if (s.status === "NO SIGNAL" || s.status === "SKIP") return false;
  if (s.status === "OBSERVATION") return s.score >= 70 && observationBlockers(s, now).length === 0;
  return positiveAlertBlockers(s, now).length === 0;
}
