import type { QuoteMeta } from "./types";
import { getTokenMeta } from "./helius";

export async function getQuoteMeta(mint: string): Promise<QuoteMeta> {
  const base = (process.env.STONKFUN_API_BASE || "https://www.stonkfun.xyz/api/public/v1").replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/pairs`, { headers: { accept: "application/json" }, cache: "no-store" });
    if (res.ok) {
      const body = await res.json() as any;
      const rows: any[] = body?.data?.pairs || [];
      const row = rows.find((candidate) => candidate?.mint === mint);
      if (row) {
        return {
          mint,
          name: row.name,
          symbol: row.symbol,
          image: row.logoUrl,
          decimals: row.decimals,
          category: row.category,
        };
      }
    }
  } catch {
    // Helius metadata is a safe fallback when the public Stonk API is slow.
  }
  return { mint, ...(await getTokenMeta(mint)) };
}
