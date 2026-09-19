import type { Snapshot } from "./types";

export function classify(s: Omit<Snapshot, "score" | "status" | "reasons" | "risks">): Pick<Snapshot, "score" | "status" | "reasons" | "risks"> {
  const p = s.pair;
  const h = s.holders;
  const t = s.traders;
  const reasons: string[] = [];
  const risks: string[] = [];
  let score = 0;

  const mc = p.marketCap ?? p.fdv ?? 0;
  const vol = p.volume5m ?? 0;
  const buys = p.buys5m ?? 0;
  const sells = p.sells5m ?? 0;
  const liq = p.liquidityUsd ?? 0;
  const top10 = h.top10Pct;
  const dev = h.creatorPct;

  if (mc >= 20_000 && mc <= 300_000) { score += 16; reasons.push("asymmetric MC window"); }
  else if (mc > 300_000 && mc <= 750_000) { score += 9; reasons.push("still early MC"); }
  else if (mc > 1_500_000) risks.push("late relative to desired discovery window");

  if (vol >= 10_000) { score += 8; reasons.push("real early volume"); }
  if (vol >= 30_000) { score += 8; reasons.push("strong 5m volume"); }
  if (mc > 0 && vol / mc >= 0.15) { score += 7; reasons.push("high volume/MC velocity"); }
  if (buys >= 75) { score += 7; reasons.push("broad buy activity"); }
  if (buys >= 200) { score += 5; reasons.push("accelerating buys"); }
  if (buys > sells * 1.15) { score += 6; reasons.push("buy-side flow"); }
  if (sells > buys * 1.4 && buys + sells > 100) risks.push("sell-heavy churn");

  if ((t.uniqueBuyers || 0) >= 25) { score += 5; reasons.push("broad unique buyer set"); }
  if ((t.uniqueBuyers || 0) >= 75) { score += 5; reasons.push("strong unique buyer expansion"); }
  if ((t.sampledSwaps || 0) >= 40 && (t.uniqueTraders || 0) > 0 && (t.sampledSwaps || 0) / (t.uniqueTraders || 1) > 5) risks.push("high swaps-per-wallet: possible churn/bots");

  if (h.holders >= 60) { score += 7; reasons.push("holder breadth"); }
  if (h.holders >= 150) { score += 6; reasons.push("strong holder breadth"); }
  if (top10 != null && top10 <= 25) { score += 8; reasons.push("acceptable top-10 concentration"); }
  if (top10 != null && top10 > 35) risks.push(`top-10 concentration ${top10.toFixed(1)}%`);
  if (dev != null && dev <= 2) { score += 5; reasons.push("low creator balance"); }
  if (dev != null && dev > 8) risks.push(`creator still holds ${dev.toFixed(1)}%`);

  if (liq >= 10_000) { score += 5; reasons.push("usable liquidity"); }
  if (liq >= 25_000) { score += 4; reasons.push("solid early liquidity"); }
  if (mc > 100_000 && liq > 0 && liq / mc < 0.06) risks.push("thin liquidity vs MC");

  if (s.quote.isNewPair) { score += 10; reasons.push("launches against a newly admitted Stonk pair"); }

  score += s.narrativeScore * 4;
  if (s.narrativeScore >= 4) reasons.push("exceptional pair-aware meme fit");

  if (s.retention != null) {
    if (s.retention >= 0.62) { score += 9; reasons.push("strong peak retention"); }
    else if (s.retention < 0.35) risks.push(`poor peak retention ${(s.retention * 100).toFixed(0)}%`);
  }

  const fatal = (top10 != null && top10 > 55) || (dev != null && dev > 15) || (s.retention != null && s.retention < 0.22);
  if (fatal) return { score: Math.min(100, score), status: "SKIP", reasons, risks: [...risks, "hard risk threshold hit"] };

  let status: Snapshot["status"] = "NO SIGNAL";
  if (s.ageMinutes <= 5 && score >= 55 && mc > 0 && mc <= 350_000) status = "FLASH";
  if (s.ageMinutes >= 3 && score >= 68 && mc > 0 && mc <= 650_000) status = "EARLY WATCH";
  if (s.ageMinutes >= 7 && score >= 80 && (s.retention == null || s.retention >= 0.5)) status = "GEM";
  if (s.ageMinutes >= 7 && s.retention != null && s.retention >= 0.65 && score >= 72 && status !== "GEM") status = "RECLAIM";

  return { score: Math.min(100, score), status, reasons, risks };
}
