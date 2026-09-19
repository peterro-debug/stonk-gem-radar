import type { QuoteMeta, TokenMeta } from "./types";

const motifs: Record<string, string[]> = {
  PEPE: ["pepe", "frog", "feelsgood", "feels good", "kek", "wojak", "rare pepe"],
  ZEC: ["zec", "zcash", "privacy", "anon", "shield", "zatoshi", "cypher"],
  XMR: ["xmr", "monero", "privacy", "anon", "ring", "ghost"],
  BTC: ["btc", "bitcoin", "satoshi", "nakamoto", "orange", "hodl"],
  WBTC: ["btc", "bitcoin", "satoshi", "nakamoto", "orange", "hodl"],
  SOL: ["sol", "solana", "toly", "validator", "bonk"],
  SPYX: ["spy", "sp500", "s&p", "wall street", "stonk", "bull", "america"],
  GMEX: ["gme", "gamestop", "roaring kitty", "kitty", "apes"],
  NVDAX: ["nvidia", "nvda", "jensen", "gpu", "ai"],
  TSLAX: ["tesla", "tsla", "elon", "cybertruck"],
};

const norm = (s?: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function narrativeScore(token: TokenMeta, quote: QuoteMeta): { score: number; reason: string } {
  const name = norm(`${token.name || ""} ${token.symbol || ""}`);
  const qsym = (quote.symbol || "").toUpperCase();
  const qname = norm(quote.name);
  let score = 0;
  const reasons: string[] = [];

  const symbol = (token.symbol || "").trim();
  const words = norm(token.name).split(/\s+/).filter(Boolean);
  if (symbol.length >= 2 && symbol.length <= 10) { score += 1; reasons.push("short ticker"); }
  if (words.length >= 1 && words.length <= 3) { score += 1; reasons.push("simple name"); }

  if (qname && name.includes(qname)) { score += 2; reasons.push("direct quote-name link"); }
  if (qsym && name.includes(qsym.toLowerCase())) { score += 2; reasons.push("direct quote-symbol link"); }

  const keys = [qsym, qsym.replace(/X$/, "")];
  const vocab = [...new Set(keys.flatMap((k) => motifs[k] || []))];
  const hit = vocab.find((m) => name.includes(norm(m)));
  if (hit) { score += 3; reasons.push(`native motif: ${hit}`); }

  if (/inu|cat|dog|frog|pepe|wojak|chad|baby|mini|ai|agent|coin|moon|bull|bear/.test(name)) {
    score += 1;
    reasons.push("recognizable meme primitive");
  }

  return { score: Math.min(score, 5), reason: reasons.join(", ") || "weak/unclear meme link" };
}
