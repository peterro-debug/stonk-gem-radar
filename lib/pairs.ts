import type { QuoteMeta } from "./types";
import { getTokenMeta } from "./helius";

export async function listQuotePairs(): Promise<QuoteMeta[]> {
  const base = (process.env.STONKFUN_API_BASE || "https://www.stonkfun.xyz/api/public/v1").replace(/\/$/, "");
  const res = await fetch(`${base}/pairs`, {
    headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`Stonk pair registry HTTP ${res.status}`);
  const body = await res.json();
  const rows = body?.data?.pairs;
  if (!Array.isArray(rows) || !rows.length || rows.some(row => typeof row?.mint !== "string")) {
    throw new Error("Stonk pair registry is empty or malformed");
  }
  return rows.map(row => ({ mint: row.mint, name: row.name, symbol: row.symbol,
    image: row.logoUrl, decimals: row.decimals, category: row.category }));
}

export async function getQuoteMeta(mint: string): Promise<QuoteMeta> {
  try {
    const row = (await listQuotePairs()).find(candidate => candidate.mint === mint);
    if (row) return row;
  } catch {
    // Helius metadata is a safe fallback when the public Stonk API is slow.
  }
  return { mint, ...(await getTokenMeta(mint)) };
}
