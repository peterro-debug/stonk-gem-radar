import type { TokenMeta } from "./types";

// Explicit, explainable associations. This is not an AI confidence score.
const profiles = [
  { aliases: ["GOOG", "GOOGL", "GOOGLE", "ALPHABET"], motifs: ["google", "google it", "im feeling lucky", "feeling lucky", "dont be evil", "page rank", "pagerank", "googol", "gemini", "chrome"], compounds: ["googleinu"] },
  { aliases: ["PEPE"], motifs: ["pepe", "frog", "feelsgood", "feels good", "feelsgoodman", "kek", "wojak", "rare pepe"], compounds: ["pepeinu", "babypepe"] },
  { aliases: ["JUP", "JUPITER"], motifs: ["jup", "jupiter", "jupcat", "jupiter cat", "cat"], compounds: ["jupcat"] },
  { aliases: ["LNKD", "LINKEDIN"], motifs: ["linkedin", "linkedinu", "open to work", "opentowork", "professional network"], compounds: ["linkedinu"] },
  { aliases: ["CARDS"], motifs: ["card", "cards", "psa", "psa10", "pokemon", "pokedex", "collector"] },
  { aliases: ["ZEC", "ZCASH"], motifs: ["zcash", "privacy", "anon", "anonymous", "anonymity", "shield", "zatoshi", "cypher"] },
  { aliases: ["XMR", "MONERO"], motifs: ["monero", "privacy", "anon", "anonymous", "anonymity", "ring", "ghost"] },
  { aliases: ["BTC", "WBTC", "BITCOIN"], motifs: ["bitcoin", "satoshi", "nakamoto", "orange", "hodl", "bitconnect"] },
  { aliases: ["SOL", "SOLANA"], motifs: ["solana", "toly", "validator", "bonk"] },
  { aliases: ["BONK", "WIF"], motifs: ["bonk", "dog", "inu", "hat", "wif"] },
  { aliases: ["SPY", "SP500"], motifs: ["spy", "sp500", "wall street", "stonk", "bull", "america"] },
  { aliases: ["GME", "GAMESTOP"], motifs: ["gamestop", "roaring kitty", "kitty", "apes", "diamond hands"] },
  { aliases: ["NVDA", "NVIDIA"], motifs: ["nvidia", "jensen", "gpu", "ai", "leather jacket"] },
  { aliases: ["TSLA", "TESLA"], motifs: ["tesla", "elon", "cybertruck", "electric car"] },
  { aliases: ["AAPL", "APPLE"], motifs: ["apple", "iphone", "steve jobs", "think different"] },
  { aliases: ["AMZN", "AMAZON"], motifs: ["amazon", "bezos", "prime", "alexa"] },
  // Semantic/product associations; these do not imply token affiliation.
  { aliases: ["MSFT", "MICROSOFT"], motifs: ["microsoft", "windows", "clippy", "bill gates", "linkedin", "linkedinu", "open to work"] },
  { aliases: ["DKNG", "DRAFTKINGS"], motifs: ["draftkings", "draft kings", "all in", "allin", "allinu", "jackpot", "parlay", "sportsbook", "poker"] },
];

export const normalizeName = (value = "") => value.toLowerCase()
  .normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/['’]/g, "")
  .replace(/[^a-z0-9]+/g, " ").trim();

export function containsPhrase(text: string, phrase: string): boolean {
  const needle = normalizeName(phrase);
  return needle.length >= 2 && ` ${normalizeName(text)} `.includes(` ${needle} `);
}

export function quoteAliases(quote: TokenMeta): string[] {
  const symbol = (quote.symbol || "").toUpperCase();
  const keys = [symbol, symbol.length > 2 ? symbol.replace(/X$/, "") : symbol];
  const matches = profiles.filter(p => p.aliases.some(a => keys.includes(a) || containsPhrase(quote.name || "", a)));
  return [...new Set([quote.name || "", ...keys, ...matches.flatMap(p => p.aliases)].filter(v => v.length >= 2))];
}

export function nameAssociation(token: TokenMeta, quote: TokenMeta): { matched: boolean; reason: string } {
  const text = `${token.name || ""} ${token.symbol || ""}`;
  const aliases = quoteAliases(quote);
  const direct = aliases.find(alias => containsPhrase(text, alias));
  if (direct) return { matched: true, reason: `pair name/alias: ${direct}` };
  const profilesForQuote = profiles.filter(p => p.aliases.some(a => aliases.includes(a)));
  const motif = profilesForQuote.flatMap(p => [...p.motifs, ...(p.compounds || [])])
    .find(word => containsPhrase(text, word));
  return motif ? { matched: true, reason: `pair association: ${motif}` }
    : { matched: false, reason: "no supported name association" };
}
