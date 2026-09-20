import type { Snapshot } from "./types";
import { positiveAlertBlockers, walletThresholdRisks } from "./alert-policy";
import { WALLET_LIMITS } from "./constants";

const money = (n?: number) => n == null || !Number.isFinite(n) ? "ukjent"
  : n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M`
  : n >= 1_000 ? `$${(n / 1_000).toFixed(1)}k` : `$${n.toFixed(0)}`;
const clean = (value: string, max = 70) => value.replace(/\s+/g, " ").trim().slice(0, max);
const age = (minutes: number) => minutes < 60 ? `${minutes.toFixed(0)} min`
  : minutes < 1440 ? `${(minutes / 60).toFixed(1)} t` : `${(minutes / 1440).toFixed(1)} d`;

function riskSummary(s: Snapshot): string[] {
  const w = s.wallet;
  const reasons: string[] = [];
  if (w.rugged) reasons.push("token merket som rug");
  if (w.mintAuthorityRevoked === false) reasons.push("flere tokens kan utstedes");
  if (w.freezeAuthorityRevoked === false) reasons.push("tokens kan fryses");
  for (const [field, label] of [["bundledSupplyPct", "bundles"], ["sniperSupplyPct", "snipere"],
    ["commonFunderSupplyPct", "felles finansiering"], ["insiderSupplyPct", "koblede insiders"],
    ["freshWalletSupplyPct", "nye wallets"]] as const) {
    const measured = w[field];
    const lowerBound = w.gmgn?.observedSupplyPct[field];
    if (measured != null && measured > WALLET_LIMITS[field]) reasons.push(`${label} ${measured.toFixed(1)}%`);
    else if (lowerBound != null && lowerBound > WALLET_LIMITS[field]) reasons.push(`${label} minst ${lowerBound.toFixed(1)}%`);
  }
  if ((w.graphInsiderWallets ?? 0) >= WALLET_LIMITS.graphInsiderWallets) reasons.push(`${w.graphInsiderWallets} koblede wallets`);
  if (s.holders.sampleComplete && (s.holders.top10Pct ?? 0) > 55) reasons.push(`topp 10 eier ${s.holders.top10Pct!.toFixed(1)}%`);
  if (s.holders.sampleComplete && (s.holders.creatorPct ?? 0) > 15) reasons.push(`utsteder eier ${s.holders.creatorPct!.toFixed(1)}%`);
  if (s.risks.some(r => r.includes("holder base fell"))) reasons.push("antall eiere falt over 30%");
  if (s.risks.some(r => r.includes("near-complete round trip"))) reasons.push("nesten hele oppgangen er reversert");
  if (w.verification === "RISKY" && !reasons.length) reasons.push("risikofunn fra walletkontrollen");
  if (s.narrative.score < 3) reasons.push(`parmatch ${s.narrative.score}/5, krever minst 3/5`);
  else if (!s.narrative.pairFit) reasons.push("navnekoblingen til paret mangler");
  if (w.verification === "UNKNOWN") reasons.push(w.gmgn?.expectedWallets && !w.gmgn.coverageComplete
    ? `walletdekning ${w.gmgn.sampledWallets}/${w.gmgn.expectedWallets}` : "walletkontroller ufullstendige");
  if (!s.holders.sampleComplete || !s.holders.poolExclusionKnown || s.holders.creatorPct == null) reasons.push("eierfordeling ikke ferdig kontrollert");
  if ((s.pair.liquidityUsd ?? 0) < 10_000) reasons.push("likviditet under $10k eller ukjent");
  if (s.risks.some(r => r.includes("thin liquidity"))) reasons.push("tynn likviditet mot markedsverdi");
  if (s.risks.some(r => r.includes("sell-heavy"))) reasons.push("salg dominerer handelen");
  if (!reasons.length && s.risks.length) reasons.push("andre risikofunn i analysen");
  return [...new Set(reasons)];
}

// Full observations remain in the analysis record. Telegram is a concise
// decision summary; incomplete reports must never look like approved signals.
export function formatAlert(s: Snapshot, options: { demo?: boolean; candidate?: boolean } = {}): string {
  const blockers = positiveAlertBlockers(s);
  const risky = s.status === "INVALIDATED" || s.status === "SKIP" || s.wallet.verification === "RISKY" || walletThresholdRisks(s.wallet).length > 0;
  const label = s.status === "INVALIDATED" ? "RISIKOVARSEL"
    : risky ? "AVVIST" : blockers.length ? "AVVENT" : options.candidate ? "TIDLIG KANDIDAT"
    : s.status === "NO SIGNAL" ? "AVVENT" : s.status;
  const icon = risky ? "⛔" : label === "AVVENT" ? "🟡" : "🟢";
  const token = clean(s.token.name || s.token.symbol || "Ukjent token", 50);
  const quote = clean(s.quote.symbol || s.quote.name || "ukjent par", 15);
  const volume = s.mode === "FLASH" ? s.pair.volume5m : s.mode === "BUILD" ? s.pair.volume1h : s.pair.volume24h;
  const window = s.mode === "FLASH" ? "5m" : s.mode === "BUILD" ? "1t" : "24t";
  const holderCount = !s.holders.checkedAt ? "ukjent" : `${s.holders.sampleComplete ? "" : "minst "}${s.holders.holders}`;
  const lines = [
    `${options.demo ? "🧪 TEST · " : icon + " "}${label} · ${token} / ${quote}`,
    "",
    `MC ${money(s.pair.marketCap ?? s.pair.fdv)} · Likviditet ${money(s.pair.liquidityUsd)}`,
    `Volum ${window} ${money(volume)} · Eiere ${holderCount}`,
    `Parmatch ${s.narrative.score}/5 · Alder ${age(s.ageMinutes)}`,
    risky ? "⛔ Risikokrav brutt" : blockers.length ? "⏳ Kontroller ufullstendige" : "✓ Obligatoriske kontroller bestått ved siste sjekk",
  ];
  const risks = riskSummary(s);
  if (risks.length) lines.push(`Årsak: ${risks.slice(0, 2).join("; ")}${risks.length > 2 ? ` (+${risks.length - 2} øvrige forhold)` : ""}.`);
  else if (blockers.length) lines.push("Avventer ferske og komplette markeds-/kjøperdata.");
  if (s.status === "INVALIDATED") lines.push("Tidligere signal er trukket tilbake.");
  if (options.candidate) lines.push("Tidlig kandidat; radaren følger utviklingen.");
  if (options.demo) lines.push("Test med ferske data. Ingen handel utført.");
  return lines.join("\n");
}
