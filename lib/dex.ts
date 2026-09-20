import type { PairMetrics } from "./types";

function n(v: unknown): number | undefined {
  if (v == null || v === "" || typeof v === "boolean") return undefined;
  const x = Number(v);
  return Number.isFinite(x) ? x : undefined;
}

export async function getPairMetrics(mint: string, quoteMint?: string): Promise<PairMetrics> {
  const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return {};
  const body = await res.json() as any;
  let pairs: any[] = Array.isArray(body?.pairs) ? body.pairs : [];
  pairs = pairs.filter((p) => p?.chainId === "solana"
    && (p?.baseToken?.address === mint || p?.quoteToken?.address === mint));
  const valuationPairs = pairs.filter((p) => p?.baseToken?.address === mint)
    .sort((a, b) => (n(b?.liquidity?.usd) || 0) - (n(a?.liquidity?.usd) || 0));
  if (quoteMint) {
    const exact = pairs.filter((p) => (p?.baseToken?.address === mint && p?.quoteToken?.address === quoteMint)
      || (p?.quoteToken?.address === mint && p?.baseToken?.address === quoteMint));
    if (exact.length) pairs = exact;
  }
  pairs.sort((a, b) => Number(b?.liquidity?.usd || 0) - Number(a?.liquidity?.usd || 0));
  const p = pairs[0];
  if (!p) return {};
  const reversed = p.quoteToken?.address === mint;
  // DEX Screener's USD price, cap and changes describe the BASE token only.
  // Keep flow on the requested pair; value the target from its own base pool.
  // If none exists, undefined leaves the official Stonk valuation intact.
  const value = reversed ? valuationPairs[0] : p;
  return {
    pairAddress: p.pairAddress,
    dexId: p.dexId,
    priceUsd: n(value?.priceUsd),
    marketCap: n(value?.marketCap),
    fdv: n(value?.fdv),
    valuationSource: value ? "dex-base" : undefined,
    valuationPairAddress: value?.pairAddress,
    flowReversed: reversed,
    liquidityUsd: n(p.liquidity?.usd),
    volume5m: n(p.volume?.m5),
    volume1h: n(p.volume?.h1),
    volume24h: n(p.volume?.h24),
    buys5m: n(p.txns?.m5?.[reversed ? "sells" : "buys"]),
    sells5m: n(p.txns?.m5?.[reversed ? "buys" : "sells"]),
    buys1h: n(p.txns?.h1?.[reversed ? "sells" : "buys"]),
    sells1h: n(p.txns?.h1?.[reversed ? "buys" : "sells"]),
    buys24h: n(p.txns?.h24?.[reversed ? "sells" : "buys"]),
    sells24h: n(p.txns?.h24?.[reversed ? "buys" : "sells"]),
    priceChange5m: n(value?.priceChange?.m5),
    priceChange1h: n(value?.priceChange?.h1),
    priceChange24h: n(value?.priceChange?.h24),
    pairCreatedAt: n(p.pairCreatedAt),
  };
}


export async function getBatchPairMetrics(mints: string[], quoteMint?: string): Promise<Record<string, PairMetrics>> {
  const unique = [...new Set(mints.filter(Boolean))];
  const out: Record<string, PairMetrics> = {};
  for (let i = 0; i < unique.length; i += 30) {
    const chunk = unique.slice(i, i + 30);
    try {
      const res = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${chunk.join(",")}`, {
        headers: { accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) continue;
      const pairs = await res.json() as any[];
      const wanted = new Set(chunk);
      const grouped = new Map<string, any[]>();
      for (const p of Array.isArray(pairs) ? pairs : []) {
        if (p?.chainId !== "solana") continue;
        const base = p?.baseToken?.address;
        const quote = p?.quoteToken?.address;
        for (const mint of [base, quote]) {
          if (!mint || !wanted.has(mint)) continue;
          const list = grouped.get(mint) || [];
          list.push(p);
          grouped.set(mint, list);
        }
      }
      for (const mint of chunk) {
        const options = grouped.get(mint) || [];
        if (!options.length) continue;
        const exact = quoteMint ? options.filter((p) =>
          (p?.baseToken?.address === mint && p?.quoteToken?.address === quoteMint)
          || (p?.quoteToken?.address === mint && p?.baseToken?.address === quoteMint)) : [];
        const pool = (exact.length ? exact : options)
          .sort((a, b) => (n(b?.liquidity?.usd) || 0) - (n(a?.liquidity?.usd) || 0))[0];
        if (!pool) continue;
        const reversed = pool?.quoteToken?.address === mint;
        out[mint] = {
          checkedAt: Date.now(),
          pairAddress: pool.pairAddress,
          dexId: pool.dexId,
          flowReversed: reversed,
          liquidityUsd: n(pool?.liquidity?.usd),
          volume5m: n(pool?.volume?.m5),
          volume1h: n(pool?.volume?.h1),
          volume24h: n(pool?.volume?.h24),
          buys5m: n(pool?.txns?.m5?.[reversed ? "sells" : "buys"]),
          sells5m: n(pool?.txns?.m5?.[reversed ? "buys" : "sells"]),
          buys1h: n(pool?.txns?.h1?.[reversed ? "sells" : "buys"]),
          sells1h: n(pool?.txns?.h1?.[reversed ? "buys" : "sells"]),
          buys24h: n(pool?.txns?.h24?.[reversed ? "sells" : "buys"]),
          sells24h: n(pool?.txns?.h24?.[reversed ? "buys" : "sells"]),
          priceChange5m: n(pool?.priceChange?.m5),
          priceChange1h: n(pool?.priceChange?.h1),
          priceChange24h: n(pool?.priceChange?.h24),
          pairCreatedAt: n(pool?.pairCreatedAt),
          // DexScreener values the base token. Stonk remains the fallback for
          // target valuation when the watched token happens to be quote-side.
          marketCap: reversed ? undefined : n(pool?.marketCap),
          fdv: reversed ? undefined : n(pool?.fdv),
          priceUsd: reversed ? undefined : n(pool?.priceUsd),
          valuationSource: reversed ? undefined : "dex-base",
        };
      }
    } catch {
      // A batch failure must not block the authoritative Stonk pair monitor.
    }
  }
  return out;
}
