import { isAlertStatus } from "./transitions";
import type { SignalStatus, Snapshot } from "./types";
import { observationBlockers, partialObservationEvidence, positiveAlertBlockers, walletThresholdRisks } from "./alert-policy";

type SnapshotBase = Omit<Snapshot, "score" | "status" | "reasons" | "risks">;

export function classify(
  s: SnapshotBase,
  context: { previous?: Snapshot; everAlerted?: boolean } = {},
): Pick<Snapshot, "score" | "status" | "reasons" | "risks"> {
  const p = s.pair;
  const h = s.holders;
  const t = s.traders;
  const reasons: string[] = [];
  const risks: string[] = [];
  const fatal: string[] = [];
  fatal.push(...walletThresholdRisks(s.wallet));
  let score = 0;

  const mc = p.marketCap ?? p.fdv ?? 0;
  const activeVolume = s.mode === "FLASH" ? (p.volume5m || 0) : s.mode === "BUILD" ? (p.volume1h || 0) : (p.volume24h || 0);
  const buys = s.mode === "FLASH" ? (p.buys5m || 0) : (p.buys1h || 0);
  const sells = s.mode === "FLASH" ? (p.sells5m || 0) : (p.sells1h || 0);
  const liq = p.liquidityUsd ?? 0;
  const top10 = h.top10Pct;
  const dev = h.creatorPct;
  // Early balances describe the first few buyers, not a settled distribution.
  // Missing/truncated samples must not terminate a 21-day monitor or pass GEM.
  const holdersPending = h.sampleComplete === false || h.poolExclusionKnown === false
    || h.holders === 0 || top10 == null || (s.ageMinutes < 7 && h.holders < 60);
  if (holdersPending) risks.push("holder distribution pending — continue observation");

  if (mc >= 5_000 && mc <= 300_000) { score += 16; reasons.push("asymmetric MC window"); }
  else if (mc > 300_000 && mc <= 750_000) { score += 10; reasons.push("still-early MC"); }
  else if (mc > 750_000 && mc <= 3_000_000) { score += 5; reasons.push("expandable MC"); }
  else if (mc > 10_000_000) risks.push("late relative to the radar mandate");

  const volumeThreshold = s.mode === "FLASH" ? 10_000 : s.mode === "BUILD" ? 20_000 : 50_000;
  if (activeVolume >= volumeThreshold) { score += 8; reasons.push(`${s.mode.toLowerCase()} volume confirmed`); }
  if (activeVolume >= volumeThreshold * 3) { score += 8; reasons.push("strong volume acceleration"); }
  if (mc > 0 && (p.volume24h || activeVolume) / mc >= 0.15) { score += 7; reasons.push("high volume/MC velocity"); }
  if (buys >= 75) { score += 7; reasons.push("broad buy activity"); }
  if (buys >= 200) { score += 5; reasons.push("accelerating buys"); }
  if (buys > sells * 1.15 && buys + sells >= 30) { score += 6; reasons.push("buy-side flow"); }
  if (sells > buys * 1.4 && buys + sells > 100) risks.push("sell-heavy churn");

  if ((t.uniqueBuyers || 0) >= 25) { score += 5; reasons.push("broad unique-buyer set"); }
  if ((t.uniqueBuyers || 0) >= 75) { score += 5; reasons.push("strong unique-buyer expansion"); }
  if ((t.sampledSwaps || 0) >= 40 && (t.uniqueTraders || 0) > 0 && (t.sampledSwaps || 0) / (t.uniqueTraders || 1) > 5) {
    risks.push("high swaps-per-wallet: possible churn/bots");
  }

  if (h.holders >= 60) { score += 7; reasons.push("holder breadth"); }
  if (h.holders >= 150) { score += 6; reasons.push("strong holder breadth"); }
  if (!holdersPending && top10 != null && top10 <= 25) { score += 8; reasons.push("acceptable top-10 concentration"); }
  if (top10 != null && top10 > 35) risks.push(`top-10 concentration ${top10.toFixed(1)}%`);
  if (!holdersPending && top10 != null && top10 > 55) fatal.push(`top-10 concentration ${top10.toFixed(1)}%`);
  if (!holdersPending && dev != null && dev <= 2) { score += 5; reasons.push("low creator balance"); }
  if (dev != null && dev > 8) risks.push(`creator still holds ${dev.toFixed(1)}%`);
  if (!holdersPending && dev != null && dev > 15) fatal.push(`creator controls ${dev.toFixed(1)}%`);

  if (liq >= 10_000) { score += 5; reasons.push("usable liquidity"); }
  if (liq >= 25_000) { score += 4; reasons.push("solid liquidity"); }
  if (mc > 100_000 && liq > 0 && liq / mc < 0.06) risks.push("thin liquidity vs MC");

  if (s.quote.isNewPair) { score += 10; reasons.push("new Stonk pair event"); }
  else if (s.quote.isFirstMover) { score += 7; reasons.push(`first mover on pair #${s.quote.launchRank}`); }

  score += s.narrative.score * 4;
  if (s.narrative.score >= 4) reasons.push("exceptional pair-aware meme fit");
  if (s.narrative.rewardFit) { score += 6; reasons.push("pair + native reward flywheel"); }
  if ((s.rewards.payoutCount || 0) >= 1_000 && (s.rewards.rewardedHolders || 0) >= 150) {
    score += 4;
    reasons.push("reward distribution has real breadth");
  }

  if (s.wallet.mintAuthorityRevoked) { score += 2; reasons.push("mint authority revoked"); }
  if (s.wallet.freezeAuthorityRevoked) { score += 2; reasons.push("freeze authority revoked"); }
  if (s.wallet.verification === "CLEAN") {
    score += 8;
    reasons.push("bundle/sniper/funder gate passed");
  } else if (s.wallet.verification === "RISKY") {
    fatal.push(...(s.wallet.flags.length ? s.wallet.flags : ["wallet gate RISKY"]));
  } else {
    risks.push("wallet gate UNKNOWN — verified signals blocked; observation may qualify");
    risks.push(...s.wallet.flags.slice(0, 2));
  }

  if (s.retention != null) {
    if (s.retention >= 0.62) { score += 9; reasons.push("strong peak retention"); }
    else if (s.retention < 0.35) risks.push(`poor peak retention ${(s.retention * 100).toFixed(0)}%`);
    if (s.retention < 0.15 && (p.priceChange24h || 0) < 50) fatal.push("near-complete round trip from peak");
  }

  if ((s.trend.holderGrowthPct || 0) >= 10) { score += 5; reasons.push("holders accelerating again"); }
  if ((s.trend.volume1hAcceleration || 0) >= 1.8 || (s.trend.volume24hAcceleration || 0) >= 1.5) {
    score += 5;
    reasons.push("volume is accelerating versus prior snapshot");
  }

  const prior = context.previous;
  if (!holdersPending && prior && prior.holders.sampleComplete !== false
    && prior.holders.holders >= 100 && h.holders < prior.holders.holders * 0.7) {
    fatal.push("holder base fell more than 30% between checks");
  }

  const rawScore = Math.min(100, score);
  const hadAlert = Boolean(context.everAlerted || (prior && isAlertStatus(prior.status)));
  if (fatal.length) {
    const status: SignalStatus = hadAlert ? "INVALIDATED" : "SKIP";
    return { score: rawScore, status, reasons, risks: [...new Set([...risks, ...fatal, "hard risk threshold hit"])] };
  }

  if (holdersPending && !partialObservationEvidence(s)) return { score: rawScore, status: "NO SIGNAL", reasons, risks: [...new Set(risks)] };

  const blockers = positiveAlertBlockers(s);
  if (blockers.length) return { score: rawScore,
    status: rawScore >= 70 && observationBlockers(s).length === 0 ? "OBSERVATION" : "NO SIGNAL", reasons,
    risks: [...new Set([...risks, `Awaiting required checks: ${blockers.join("; ")}`])] };

  let status: SignalStatus = "NO SIGNAL";
  const walletPassed = s.wallet.verification === "CLEAN";
  const retentionOkay = s.retention == null || s.retention >= 0.45;

  if (s.mode === "REAWAKENING") {
    const reawakeningQualified =
      s.trend.reawakeningSignals.length >= 2
      && mc >= 10_000
      && mc <= 10_000_000
      && (p.volume24h || 0) >= 50_000
      && h.holders >= 150
      && liq >= 10_000
      && s.narrative.score >= 3;

    if (reawakeningQualified) status = "REAWAKENING";
    const trackedReclaim = Boolean(prior) && (
      (s.trend.marketCapChangePct || 0) >= 30
      || (s.trend.recoveryFromLowPct || 0) >= 35
    );
    if (reawakeningQualified && trackedReclaim && retentionOkay && rawScore >= 72) status = "RECLAIM";
    if (reawakeningQualified && walletPassed && retentionOkay && rawScore >= 84) status = "GEM";
  } else if (s.mode === "BUILD") {
    if (rawScore >= 65 && mc > 0 && mc <= 5_000_000) status = "BUILD WATCH";
    if (prior && rawScore >= 72 && retentionOkay && (s.trend.marketCapChangePct || 0) >= 25) status = "RECLAIM";
    if (walletPassed && s.ageMinutes >= 7 && rawScore >= 82 && retentionOkay) status = "GEM";
  } else {
    if (s.ageMinutes <= 360 && rawScore >= 55 && mc > 0 && mc <= 750_000) status = "FLASH";
    if (s.ageMinutes >= 3 && rawScore >= 68 && mc > 0 && mc <= 1_500_000) status = "EARLY WATCH";
    if (walletPassed && s.ageMinutes >= 7 && rawScore >= 82 && retentionOkay) status = "GEM";
  }

  return { score: rawScore, status, reasons, risks: [...new Set(risks)] };
}
