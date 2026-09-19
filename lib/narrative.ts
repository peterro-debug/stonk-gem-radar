import type { NarrativeMetrics, QuoteMeta, RewardMetrics, TokenMeta } from "./types";

const motifs: Record<string, string[]> = {
  PEPE: ["pepe", "frog", "feelsgood", "feels good", "kek", "wojak", "rare pepe"],
  JUP: ["jup", "jupiter", "jupcat", "jupiter cat", "cat"],
  CARDS: ["card", "cards", "psa", "psa10", "pokemon", "pokedex", "collector"],
  ZEC: ["zec", "zcash", "privacy", "anon", "shield", "zatoshi", "cypher"],
  XMR: ["xmr", "monero", "privacy", "anon", "ring", "ghost"],
  BTC: ["btc", "bitcoin", "satoshi", "nakamoto", "orange", "hodl", "bitconnect"],
  WBTC: ["btc", "bitcoin", "satoshi", "nakamoto", "orange", "hodl", "bitconnect"],
  SOL: ["sol", "solana", "toly", "validator", "bonk"],
  BONK: ["bonk", "dog", "inu"],
  WIF: ["wif", "hat", "dog"],
  SPYX: ["spy", "sp500", "s&p", "wall street", "stonk", "bull", "america"],
  GMEX: ["gme", "gamestop", "roaring kitty", "kitty", "apes"],
  NVDAX: ["nvidia", "nvda", "jensen", "gpu", "ai"],
  TSLAX: ["tesla", "tsla", "elon", "cybertruck"],
};

const mascots: Record<string, string[]> = {
  JUP: ["cat", "jupcat", "jupiter cat"],
  PEPE: ["pepe", "frog", "feelsgood", "feels good"],
  BONK: ["bonk", "dog", "inu"],
  WIF: ["dog", "wif", "hat"],
};

const norm = (value?: string) => (value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function narrativeScore(token: TokenMeta, quote: QuoteMeta, rewards: RewardMetrics): NarrativeMetrics {
  const name = norm(`${token.name || ""} ${token.symbol || ""}`);
  const qsym = (quote.symbol || "").toUpperCase();
  const qname = norm(quote.name);
  const reasons: string[] = [];
  let score = 0;

  const symbol = (token.symbol || "").trim();
  const words = norm(token.name).split(/\s+/).filter(Boolean);
  if (symbol.length >= 2 && symbol.length <= 12 && words.length >= 1 && words.length <= 4) {
    score += 1;
    reasons.push("simple, readable meme");
  }

  const directName = Boolean(qname && name.includes(qname));
  const directSymbol = Boolean(qsym && name.includes(qsym.toLowerCase()));
  const keys = [qsym, qsym.replace(/X$/, "")];
  const vocabulary = [...new Set(keys.flatMap((key) => motifs[key] || []))];
  const motif = vocabulary.find((word) => name.includes(norm(word)));
  const pairFit = directName || directSymbol || Boolean(motif);
  if (pairFit) {
    score += 1;
    reasons.push(directName || directSymbol ? "direct pair-name link" : `native pair motif: ${motif}`);
  }

  const mascot = [...new Set(keys.flatMap((key) => mascots[key] || []))]
    .find((word) => name.includes(norm(word)));
  const mascotFit = Boolean(mascot);
  if (mascotFit) {
    score += 1;
    reasons.push(`project/asset mascot fit: ${mascot}`);
  }

  const rewardFit = rewards.nativeQuoteReward && (rewards.transferFeeBps || 0) > 0;
  if (rewardFit) {
    score += 1;
    reasons.push(`native ${rewards.rewardSymbol || qsym} holder rewards`);
  }

  const firstMoverFit = Boolean(quote.isFirstMover || quote.isNewPair);
  if (firstMoverFit) {
    score += 1;
    reasons.push(quote.launchRank ? `pair first mover #${quote.launchRank}` : "newly registered pair event");
  }

  if (/inu|cat|dog|frog|pepe|wojak|chad|baby|mini|ai|agent|coin|moon|bull|bear|meme/.test(name)) {
    score += 1;
    reasons.push("recognizable meme primitive");
  }

  return {
    score: Math.min(score, 5),
    reason: reasons.join(", ") || "weak/unclear pair-aware meme link",
    pairFit,
    mascotFit,
    rewardFit,
    firstMoverFit,
  };
}
