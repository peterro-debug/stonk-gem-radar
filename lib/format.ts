import type { Snapshot } from "./types";

const money = (n?: number) => n == null ? "n/a" : n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `$${(n / 1_000).toFixed(0)}k` : `$${n.toFixed(0)}`;
const pct = (n?: number) => n == null ? "n/a" : `${n.toFixed(1)}%`;

export function formatAlert(s: Snapshot): string {
  const name = s.token.name || s.token.symbol || "UNKNOWN";
  const symbol = s.token.symbol ? ` ($${s.token.symbol})` : "";
  const quote = s.quote.symbol || s.quote.name || s.launch.quoteMint.slice(0, 8);
  const pairTag = s.quote.isNewPair ? " — NEW PAIR" : "";
  const p = s.pair;
  const h = s.holders;
  const t = s.traders;
  const retention = s.retention == null ? "n/a" : `${(s.retention * 100).toFixed(0)}%`;
  const icon = s.status === "GEM" ? "🚨" : s.status === "SKIP" ? "⛔️" : "⚡️";

  return [
    `${icon} STONK ${s.status} — ${s.ageMinutes.toFixed(1)}m OLD`,
    `${name}${symbol}`,
    `Mint: ${s.launch.mint}`,
    `Pair: ${quote}${pairTag}`,
    `MC: ${money(p.marketCap ?? p.fdv)} | Peak: ${money(s.peakMarketCap)} | Retention: ${retention}`,
    `Vol 5m: ${money(p.volume5m)} | Vol 1h: ${money(p.volume1h)}`,
    `Liquidity: ${money(p.liquidityUsd)}`,
    `Buys/Sells 5m: ${p.buys5m ?? "n/a"}/${p.sells5m ?? "n/a"}`,
    `Holders: ${h.holders} | Unique buyers: ${t.uniqueBuyers ?? "n/a"} | Traders: ${t.uniqueTraders ?? "n/a"}`,
    `Top10: ${pct(h.top10Pct)} | Dev: ${pct(h.creatorPct)}`,
    `Narrative: ${s.narrativeScore}/5 — ${s.narrativeReason}`,
    `LinkedInu score: ${s.score}/100+`,
    s.risks.length ? `Risks: ${s.risks.slice(0, 3).join("; ")}` : "Risks: none triggered yet",
  ].join("\n");
}
