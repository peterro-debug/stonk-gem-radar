import type { Snapshot } from "./types";
import { positiveAlertBlockers } from "./alert-policy";

const money = (n?: number) => n == null ? "n/a" : n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `$${(n / 1_000).toFixed(0)}k` : `$${n.toFixed(0)}`;
const pct = (n?: number) => n == null ? "n/a" : `${n.toFixed(1)}%`;
const multiple = (n?: number) => n == null ? "n/a" : `${n.toFixed(1)}x`;

function ageLabel(minutes: number): string {
  if (minutes < 60) return `${minutes.toFixed(1)}m`;
  if (minutes < 1_440) return `${(minutes / 60).toFixed(1)}h`;
  return `${(minutes / 1_440).toFixed(1)}d`;
}

export function formatAlert(s: Snapshot): string {
  const name = s.token.name || s.token.symbol || "UNKNOWN";
  const symbol = s.token.symbol ? ` ($${s.token.symbol})` : "";
  const quote = s.quote.symbol || s.quote.name || s.launch.quoteMint.slice(0, 8);
  const pairTag = s.quote.isNewPair
    ? " — NEW PAIR EVENT"
    : s.quote.isFirstMover
      ? ` — FIRST MOVER #${s.quote.launchRank}`
      : "";
  const p = s.pair;
  const h = s.holders;
  const t = s.traders;
  const retention = s.retention == null ? "n/a" : `${(s.retention * 100).toFixed(0)}%`;
  const icon = s.status === "GEM"
    ? "🚨"
    : s.status === "INVALIDATED" || s.status === "SKIP"
      ? "⛔️"
      : s.status === "REAWAKENING" || s.status === "RECLAIM"
        ? "🔥"
        : "⚡️";

  const lines = [
    `${icon} STONK ${s.status} — ${s.mode} — ${ageLabel(s.ageMinutes)} OLD`,
    `${name}${symbol}`,
    s.status === "INVALIDATED" ? "RISIKOVARSEL — tidligere signal er ugyldig"
      : s.wallet.verification === "RISKY" ? "AVVIST — walletkontrollen har funnet risiko"
      : positiveAlertBlockers(s).length ? "UAVKLART — obligatoriske kontroller mangler"
      : "Obligatoriske kontroller bestått ved siste sjekk",
    `Mint: ${s.launch.mint}`,
    `Pair: ${quote}${pairTag}`,
    `MC: ${money(p.marketCap ?? p.fdv)} | Peak: ${money(s.peakMarketCap)} | Retention: ${retention}`,
    `Vol 5m/1h/24h: ${money(p.volume5m)} / ${money(p.volume1h)} / ${money(p.volume24h)}`,
    `Liquidity: ${money(p.liquidityUsd)} | 24h price: ${pct(p.priceChange24h)}`,
    `Buys/Sells 5m: ${p.buys5m ?? "n/a"}/${p.sells5m ?? "n/a"} | 1h: ${p.buys1h ?? "n/a"}/${p.sells1h ?? "n/a"}`,
    `Holders: ${h.holders} | Unique buyers (5m sample): ${t.uniqueBuyers ?? "n/a"} | Traders: ${t.uniqueTraders ?? "n/a"}`,
    `Top10: ${pct(h.top10Pct)} | Dev: ${pct(h.creatorPct)}`,
    `Wallet gate: ${s.wallet.verification} (${s.wallet.provider})`,
    `Graph/bundle/sniper/funder: ${s.wallet.graphChecked ? "✓" : "?"}/${s.wallet.bundleChecked ? "✓" : "?"}/${s.wallet.sniperChecked ? "✓" : "?"}/${s.wallet.fundingChecked ? "✓" : "?"}`,
    `Bundle/sniper/funder/fresh supply: ${pct(s.wallet.bundledSupplyPct)}/${pct(s.wallet.sniperSupplyPct)}/${pct(s.wallet.commonFunderSupplyPct)}/${pct(s.wallet.freshWalletSupplyPct)}`,
    `Narrative: ${s.narrative.score}/5 — ${s.narrative.reason}`,
  ];

  if (s.wallet.gmgn && s.wallet.gmgn.status !== "not-configured") {
    const g = s.wallet.gmgn;
    lines.push(`GMGN: ${g.status} | wallets undersøkt: ${g.sampledWallets}/${g.expectedWallets ?? "?"}`);
    if (g.missing.length) lines.push(`GMGN mangler: ${g.missing.join("; ")}`);
    if (!g.coverageComplete && g.observedSupplyPct.bundledSupplyPct != null) {
      lines.push(`Bundleandel observert i utvalget: minst ${pct(g.observedSupplyPct.bundledSupplyPct)}`);
    }
  }

  if (s.rewards.nativeQuoteReward) {
    lines.push(
      `Rewards: ${(s.rewards.transferFeeBps || 0) / 100}% ${s.rewards.rewardSymbol || quote} | holders ${s.rewards.rewardedHolders ?? "n/a"} | payouts ${s.rewards.payoutCount ?? "n/a"}`,
    );
  }
  if (s.trend.reawakeningSignals.length) {
    lines.push(`Reawakening: ${s.trend.reawakeningSignals.slice(0, 4).join("; ")}`);
  }
  if (s.trend.volume24hAcceleration != null) {
    lines.push(`24h volume vs prior check: ${multiple(s.trend.volume24hAcceleration)}`);
  }
  lines.push(
    `Aktivitet og potensial: ${s.score}/100 (ikke en sikkerhetsscore)`,
    s.risks.length ? `Risks: ${s.risks.slice(0, 4).join("; ")}` : "Risks: none triggered",
  );
  return lines.join("\n");
}
