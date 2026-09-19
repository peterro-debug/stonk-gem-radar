import type { QuoteMeta } from "./types";
import { getTokenMeta } from "./helius";

export async function getQuoteMeta(mint: string): Promise<QuoteMeta> {
  // j7tracker mirrors StonkFun's public /pairs registry every 30s and marks pairs
  // seen in the first hour as isNew. This is enrichment only; launch detection is on-chain.
  try {
    const res = await fetch("https://nyc.j7tracker.io/token/stonk-pairs", { cache: "no-store" });
    if (res.ok) {
      const body = await res.json() as any;
      const rows = [...(body?.pairs || []), ...(body?.custom || [])];
      const row = rows.find((x: any) => x?.mint === mint);
      if (row) {
        return {
          mint,
          name: row.name,
          symbol: row.symbol,
          image: row.logoUrl,
          decimals: row.decimals,
          isNewPair: Boolean(row.isNew),
          category: row.category,
        };
      }
    }
  } catch { /* Helius fallback below */ }
  return { mint, ...(await getTokenMeta(mint)) };
}
