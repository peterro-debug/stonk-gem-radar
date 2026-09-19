import type { Snapshot } from "./types";

export function isEarlyNameCandidate(s: Snapshot): boolean {
  const mc = s.pair.marketCap ?? s.pair.fdv;
  return s.ageMinutes <= 30 && (mc == null || (mc > 0 && mc < 100_000))
    && s.narrative.pairFit && Boolean(s.quote.isNewPair || s.quote.isFirstMover)
    && s.wallet.verification !== "RISKY" && s.status !== "SKIP" && s.status !== "INVALIDATED";
}

export function formatCandidate(s: Snapshot): string {
  const mc = s.pair.marketCap ?? s.pair.fdv;
  return ["🔎 STONK — TIDLIG NAVNEKANDIDAT", `${s.token.name || s.token.symbol} / ${s.quote.symbol || s.quote.name}`,
    `Alder: ${s.ageMinutes.toFixed(1)} min | MC: ${mc == null ? "ikke tilgjengelig" : `$${Math.round(mc).toLocaleString("en-US")}`}`,
    `Navnekobling: ${s.narrative.reason}`, `Wallet: ${s.wallet.verification} | Analyse: ${s.status}`,
    s.risks.length ? `Åpne sjekker: ${s.risks.join("; ")}` : "Ingen terskler truffet i dette øyeblikksbildet.",
    "Navnet er en hypotese. Dette er ikke et GEM-signal eller et kjøp. Radaren følger utviklingen.",
    `Mint: ${s.launch.mint}`, s.quote.event ? `Parhendelse: ${s.quote.event.sourceUrl}` : "Kilde: blant de første lanseringene på paret",
    `https://www.stonkfun.xyz/token/${s.launch.mint}`].join("\n");
}
