import type { NarrativeMetrics, QuoteMeta, RewardMetrics, TokenMeta } from "./types";
import { containsPhrase, nameAssociation } from "./name-fit";

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
  const reasons: string[] = [];
  let score = 0;

  const symbol = (token.symbol || "").trim();
  const words = norm(token.name).split(/\s+/).filter(Boolean);
  if (symbol.length >= 2 && symbol.length <= 12 && words.length >= 1 && words.length <= 4) {
    score += 1;
    reasons.push("simple, readable meme");
  }

  const association = nameAssociation(token, quote);
  const keys = [qsym, qsym.replace(/X$/, "")];
  const pairFit = association.matched;
  if (pairFit) {
    score += 1;
    reasons.push(association.reason);
  }

  const mascot = [...new Set(keys.flatMap((key) => mascots[key] || []))]
    .find((word) => containsPhrase(name, word));
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

  if (["inu", "cat", "dog", "frog", "pepe", "wojak", "chad", "baby", "mini", "ai", "agent", "coin", "moon", "bull", "bear", "meme", "linkedinu", "jupcat"].some(word => containsPhrase(name, word))) {
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
    method: "rules",
  };
}
