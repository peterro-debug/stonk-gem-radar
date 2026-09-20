import { normalizeName } from "./name-fit";
import type { StonkTokenRow } from "./stonk";
import type { NoveltyMetrics, QuoteMeta, RewardMetrics, TokenMeta } from "./types";

const generic = new Set(["baby", "mini", "new", "real", "official", "the", "token", "coin", "meme", "inu", "cat", "dog", "frog", "ai", "agent", "moon", "bull", "bear", "pepe", "sol", "solana"]);
const identity = (name = "") => normalizeName(name).split(" ")
  .filter(word => !["baby", "mini", "new", "real", "official", "the"].includes(word) && !/^\d+$/.test(word)).join("");

// One-letter typo variants of longer names, plus punctuation and sequel suffixes.
// Ticker overlap alone is deliberately insufficient to identify a copy.
export function similarIdentity(a: string, b: string): boolean {
  const x = identity(a), y = identity(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (Math.min(x.length, y.length) < 6 || Math.abs(x.length - y.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (x.length >= y.length) i++;
    if (y.length >= x.length) j++;
  }
  return edits + (x.length - i) + (y.length - j) <= 1;
}

export function assessNovelty(input: {
  mint: string; launchedAt: number; token: TokenMeta; quote: QuoteMeta; rewards: RewardMetrics;
  rows: StonkTokenRow[]; pairCoverageComplete: boolean; pairComparisonReady?: boolean; now?: number;
}): NoveltyMetrics {
  const { mint, launchedAt, token, quote, rewards } = input;
  const words = normalizeName(token.name).split(" ").filter(Boolean);
  const distinctive = words.length > 0 && words.length <= 5 && words.some(w => w.length >= 3 && !generic.has(w))
    && (token.symbol?.trim().length || 0) >= 2 && (token.symbol?.trim().length || 0) <= 15;
  const prior = [...new Map(input.rows.map(row => [row.mint, row])).values()]
    .filter(row => row.mint !== mint && Number.isFinite(Date.parse(row.createdAt || ""))
      && Date.parse(row.createdAt!) <= launchedAt);
  const matches = prior.filter(row => row.name && (identity(token.name) === identity(row.name)
    || (normalizeName(token.symbol).length >= 3 && normalizeName(token.symbol) === normalizeName(row.symbol)
      && similarIdentity(token.name || "", row.name))))
    .map(row => ({ mint: row.mint, name: row.name!, samePair: row.quote?.mint === quote.mint }));
  const duplicate = matches.length > 0;
  const reasons: string[] = [];
  if (distinctive) reasons.push("distinctive readable name");
  const pairComparisonReady = input.pairComparisonReady ?? input.pairCoverageComplete;
  if (pairComparisonReady && !matches.some(m => m.samePair)) reasons.push(input.pairCoverageComplete
    ? "no earlier close name on this pair" : "no earlier close name in the recent and leading pair sample");
  const otherPairs = prior.filter(row => row.quote?.mint && row.quote.mint !== quote.mint);
  if (otherPairs.length >= 20 && !duplicate) reasons.push("no close name in the recent/active cross-pair sample");
  if (distinctive && (words.filter(w => !generic.has(w)).length >= 2 || words.some(w => w.length >= 7 && !generic.has(w)))
    && !similarIdentity(token.name || "", quote.name || quote.symbol || "")) reasons.push("individual concept beyond the quote asset name");
  if ((rewards.nativeQuoteReward && (rewards.transferFeeBps || 0) > 0) || quote.isNewPair || quote.isFirstMover) {
    reasons.push("native pair rewards or measured first-mover context");
  }
  return { checkedAt: input.now ?? Date.now(), score: Math.min(5, reasons.length), distinctive, duplicate,
    comparedTokens: prior.length, pairCoverageComplete: input.pairCoverageComplete,
    pairComparisonReady, pairScope: input.pairCoverageComplete ? "complete" : pairComparisonReady ? "recent-and-leading" : "unavailable",
    reasons, matches: matches.slice(0, 5), method: "catalogue-v1" };
}
