import type { PairMetrics } from "./types";

function n(v: unknown): number | undefined {
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
  pairs = pairs.filter((p) => p?.chainId === "solana");
  if (quoteMint) {
    const exact = pairs.filter((p) => p?.quoteToken?.address === quoteMint || p?.baseToken?.address === quoteMint);
    if (exact.length) pairs = exact;
  }
  pairs.sort((a, b) => Number(b?.liquidity?.usd || 0) - Number(a?.liquidity?.usd || 0));
  const p = pairs[0];
  if (!p) return {};
  return {
    pairAddress: p.pairAddress,
    dexId: p.dexId,
    priceUsd: n(p.priceUsd),
    marketCap: n(p.marketCap),
    fdv: n(p.fdv),
    liquidityUsd: n(p.liquidity?.usd),
    volume5m: n(p.volume?.m5),
    volume1h: n(p.volume?.h1),
    volume24h: n(p.volume?.h24),
    buys5m: n(p.txns?.m5?.buys),
    sells5m: n(p.txns?.m5?.sells),
    buys1h: n(p.txns?.h1?.buys),
    sells1h: n(p.txns?.h1?.sells),
    pairCreatedAt: n(p.pairCreatedAt),
  };
}
